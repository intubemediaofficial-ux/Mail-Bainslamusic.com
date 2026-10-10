import { prisma } from "@/lib/db";
import { getSetting } from "./settings";
import { upsertLead, mergeCategory, type LeadInput } from "./leads";
import { ensureList, addLeadsToList } from "./lists";
import { scopeForOwner } from "./scope";

/**
 * Direct sync of the user's SalesQL contact folders (the "Contact Lists" tab in the SalesQL
 * dashboard) into the local leads database. Uses the same internal web API the dashboard uses,
 * authenticated with the stored SalesQL web token. Read-only on the SalesQL side; no credits used.
 *
 *   folder  → IntubTool contact list (same name)
 *   tag     → lead category (+ optionally its own contact list)
 */

const API = "https://api.salesql.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PAGE_SIZE = 100;
const STATE_KEY = "salesql_sync_state";

export type SqFolder = { uid: string; name: string; default: boolean; total?: number };
export type SqTag = { uid: string; name: string; color: string | null };

type SqEmail = { email: string; type?: string | null; email_type?: string | null; verified?: boolean; validation_status?: string | null; main?: boolean; content_type?: string | null };
type SqPhone = { phone: string; phone_type?: string | null; verified?: boolean; is_valid?: boolean; main?: boolean };
type SqProject = { uid: string; name: string; color?: string | null };
export type SqContact = {
  uid: string;
  created_on: string;
  updated_on: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_job_title: string | null;
  primary_role: string | null;
  linkedin_url: string | null;
  person_city_name: string | null;
  person_state_name: string | null;
  person_country_name: string | null;
  primary_organization_text: string | null;
  company_name: string | null;
  company_website: string | null;
  company_linkedin_url: string | null;
  company_industry_name: string | null;
  lead_status_name: string | null;
  folder_name: string | null;
  projects: SqProject[] | null;
  notes: { description?: string | null }[] | null;
  emails: SqEmail[] | null;
  phones: SqPhone[] | null;
};

type Page<T> = { page: number; total: number; results: T[] };

export class SalesqlAuthError extends Error {
  constructor() {
    super("SalesQL web token is missing or expired — log in to SalesQL in your browser and paste a fresh token in Settings.");
  }
}

async function sq<T>(token: string, path: string, params?: Record<string, string | number>): Promise<T> {
  const qs = params ? "?" + new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString() : "";
  const r = await fetch(`${API}${path}${qs}`, {
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json", "User-Agent": UA, Origin: "https://app.salesql.com", Referer: "https://app.salesql.com/" },
    signal: AbortSignal.timeout(45_000),
  });
  if (r.status === 401 || r.status === 403) throw new SalesqlAuthError();
  if (r.status === 429) throw new Error("SalesQL rate limit hit (429) — try again in a few minutes.");
  if (!r.ok) throw new Error(`SalesQL ${path} → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

async function requireToken() {
  const token = await getSetting("salesql_web_token");
  if (!token) throw new SalesqlAuthError();
  return token;
}

export async function fetchFolders(token: string, withCounts = false): Promise<SqFolder[]> {
  const out: SqFolder[] = [];
  for (let page = 1; page < 50; page++) {
    const d = await sq<Page<{ uuid?: string; uid?: string; name: string; default?: boolean }>>(token, "/contacts/folders", { page, page_size: 100 });
    for (const f of d.results) out.push({ uid: f.uuid || f.uid || "", name: f.name, default: !!f.default });
    if (out.length >= d.total || !d.results.length) break;
  }
  if (withCounts) {
    for (const f of out) {
      const d = await sq<Page<unknown>>(token, "/contacts/contacts/", { folder_uid: f.uid, page: 1, page_size: 1 });
      f.total = d.total;
    }
  }
  return out;
}

export async function fetchTags(token: string): Promise<SqTag[]> {
  const out: SqTag[] = [];
  for (let page = 1; page < 50; page++) {
    const d = await sq<Page<{ uid: string; name: string; color?: string | null }>>(token, "/contacts/projects-v2/", { page, page_size: 100 });
    for (const t of d.results) out.push({ uid: t.uid, name: t.name.trim(), color: t.color ?? null });
    if (out.length >= d.total || !d.results.length) break;
  }
  return out;
}

export function fetchContactsPage(token: string, folderUid: string, page: number) {
  return sq<Page<SqContact>>(token, "/contacts/contacts/", { folder_uid: folderUid, page, page_size: PAGE_SIZE });
}

const emailStatus = (e: SqEmail) => (e.verified ? "valid" : e.content_type === "personemailpattern" ? "pattern" : "unverified");
const emailRank = (e: SqEmail) => (e.verified ? 4 : 0) + (e.content_type === "personemailpattern" ? -2 : 0) + (e.type === "job" ? 2 : 0) + (e.main ? 1 : 0);
const phoneRank = (p: SqPhone) => (p.is_valid ? 2 : 0) + (p.verified ? 1 : 0) + (p.phone_type === "personal" || p.phone_type === "mobile" ? 3 : 0) + (p.main ? 1 : 0);
const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
};

/** Maps a SalesQL contact to a LeadInput (without list/category — those depend on sync options). */
export function mapContact(c: SqContact): LeadInput & { emailsArr: { email: string; type?: string; status?: string }[]; phonesArr: { phone: string; type?: string; status?: string }[] } {
  const fullName = (c.name || `${c.first_name || ""} ${c.last_name || ""}`).trim();
  const emailsArr = [...(c.emails || [])]
    .filter((e) => e.email)
    .sort((a, b) => emailRank(b) - emailRank(a))
    .map((e) => ({ email: e.email.trim().toLowerCase(), type: e.type || undefined, status: emailStatus(e) }));
  const phonesArr = [...(c.phones || [])]
    .filter((p) => p.phone)
    .sort((a, b) => phoneRank(b) - phoneRank(a))
    .map((p) => ({ phone: p.phone.trim(), type: p.phone_type || undefined, status: p.is_valid ? "valid" : undefined }));
  const location = [c.person_city_name, c.person_state_name, c.person_country_name].filter(Boolean).join(", ") || null;
  const notes = (c.notes || []).map((n) => n.description?.trim()).filter(Boolean).join("\n") || null;
  return {
    company: (c.company_name || c.primary_organization_text || "Unknown").trim(),
    fullName,
    title: c.primary_job_title || null,
    headline: c.primary_role || null,
    location,
    linkedinUrl: c.linkedin_url || null,
    source: "salesql_sync",
    email: emailsArr[0]?.email || null,
    phone: phonesArr[0]?.phone || null,
    companyDomain: hostOf(c.company_website),
    companyUrl: c.company_linkedin_url || null,
    notes,
    emails: emailsArr,
    phones: phonesArr,
    salesqlUid: c.uid,
    salesqlSyncedAt: new Date(),
    emailsArr,
    phonesArr,
  };
}

// ---------------------------------------------------------------------------------------------
// sync state (persisted in ToolSetting) + in-process progress

export type SyncResult = {
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  error?: string;
  folders: { uid: string; name: string; listId: string; fetched: number; created: number; merged: number; failed: number }[];
  fetched: number;
  created: number;
  merged: number;
  failed: number;
  tags: number;
};

export type SyncState = {
  autoSync: boolean;
  tagLists: boolean;
  folderUids: string[] | null; // null = all folders
  lastRun: SyncResult | null;
  folderLastSync: Record<string, string>;
};

const DEFAULT_STATE: SyncState = { autoSync: false, tagLists: true, folderUids: null, lastRun: null, folderLastSync: {} };

export async function getSyncState(): Promise<SyncState> {
  const row = await prisma.toolSetting.findUnique({ where: { key: STATE_KEY } });
  if (!row) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...(JSON.parse(row.value) as Partial<SyncState>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveSyncState(patch: Partial<SyncState>) {
  const next = { ...(await getSyncState()), ...patch };
  await prisma.toolSetting.upsert({ where: { key: STATE_KEY }, update: { value: JSON.stringify(next) }, create: { key: STATE_KEY, value: JSON.stringify(next) } });
  return next;
}

export type SyncProgress = { running: boolean; startedAt?: string; folder?: string; folderIndex?: number; folderCount?: number; page?: number; pages?: number; done: number; total: number; created: number; merged: number; failed: number; message?: string };

const g = globalThis as unknown as { __salesqlSync?: SyncProgress };
export const syncProgress = (): SyncProgress => g.__salesqlSync ?? { running: false, done: 0, total: 0, created: 0, merged: 0, failed: 0 };

const parseArr = <T,>(s: string | null): T[] => {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
};

/** Union of the stored emails/phones arrays with what SalesQL has now (keeps local picks intact). */
async function mergeContactArrays(leadId: string, existingEmails: string | null, existingPhones: string | null, m: ReturnType<typeof mapContact>) {
  const em = parseArr<{ email: string; type?: string; status?: string }>(existingEmails);
  const ph = parseArr<{ phone: string; type?: string; status?: string }>(existingPhones);
  const haveE = new Set(em.map((e) => e.email.toLowerCase()));
  const haveP = new Set(ph.map((p) => p.phone.replace(/\D/g, "")));
  const addE = m.emailsArr.filter((e) => !haveE.has(e.email));
  const addP = m.phonesArr.filter((p) => !haveP.has(p.phone.replace(/\D/g, "")));
  if (!addE.length && !addP.length) return;
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      emails: addE.length ? JSON.stringify([...em, ...addE]) : undefined,
      phones: addP.length ? JSON.stringify([...ph, ...addP]) : undefined,
    },
  });
}

export type SyncOptions = { folderUids?: string[] | null; tagLists?: boolean };

/**
 * Pulls every contact of the chosen folders into the local DB. Safe to re-run: contacts are
 * matched by SalesQL uid → LinkedIn URL → email → name+company and merged, never duplicated.
 * Existing local email/phone/title values are kept; missing ones are filled from SalesQL.
 */
export async function runSalesqlSync(opts: SyncOptions = {}): Promise<SyncResult> {
  if (g.__salesqlSync?.running) throw new Error("A SalesQL sync is already running");
  const startedAt = new Date();
  const prog: SyncProgress = { running: true, startedAt: startedAt.toISOString(), done: 0, total: 0, created: 0, merged: 0, failed: 0 };
  g.__salesqlSync = prog;
  const state = await getSyncState();
  const tagLists = opts.tagLists ?? state.tagLists;
  const result: SyncResult = { startedAt: startedAt.toISOString(), finishedAt: "", ok: false, folders: [], fetched: 0, created: 0, merged: 0, failed: 0, tags: 0 };

  try {
    const token = await requireToken();
    const all = await fetchFolders(token, true);
    const want = opts.folderUids === undefined ? state.folderUids : opts.folderUids;
    const folders = want?.length ? all.filter((f) => want.includes(f.uid)) : all;
    if (!folders.length) throw new Error("No SalesQL folders to sync");
    prog.total = folders.reduce((a, f) => a + (f.total || 0), 0);
    prog.folderCount = folders.length;
    // SalesQL sync is a workspace (admin) job: it fills the shared pool, never a member's private data
    const scope = await scopeForOwner(null);

    const tagListIds = new Map<string, string>();
    const listFor = async (tag: string) => {
      const k = tag.toLowerCase();
      let id = tagListIds.get(k);
      if (!id) {
        id = (await ensureList(scope, tag)).id;
        tagListIds.set(k, id);
      }
      return id;
    };
    const tagsSeen = new Set<string>();

    for (let fi = 0; fi < folders.length; fi++) {
      const f = folders[fi];
      prog.folder = f.name;
      prog.folderIndex = fi + 1;
      const list = await ensureList(scope, f.name);
      const fr = { uid: f.uid, name: f.name, listId: list.id, fetched: 0, created: 0, merged: 0, failed: 0 };
      result.folders.push(fr);
      prog.pages = Math.max(1, Math.ceil((f.total || 0) / PAGE_SIZE));

      for (let page = 1; page <= 1000; page++) {
        prog.page = page;
        const d = await fetchContactsPage(token, f.uid, page);
        for (const c of d.results) {
          fr.fetched++;
          const tags = (c.projects || []).map((p) => p.name.trim()).filter(Boolean);
          tags.forEach((t) => tagsSeen.add(t.toLowerCase()));
          try {
            const m = mapContact(c);
            if (!m.fullName) throw new Error("no name");
            const category = mergeCategory(null, tags.join(", "));
            const r = await upsertLead({ ...m, category, listId: list.id, ownerId: scope.owner, matchOwners: scope.readOwners });
            if (r.created) fr.created++;
            else {
              fr.merged++;
              await mergeContactArrays(r.lead.id, r.lead.emails, r.lead.phones, m);
            }
            if (tagLists) for (const t of tags) await addLeadsToList(await listFor(t), [r.lead.id]);
          } catch (e) {
            fr.failed++;
            prog.message = `${c.name || c.uid}: ${(e as Error).message}`;
          }
          prog.done++;
        }
        prog.created = result.created + fr.created;
        prog.merged = result.merged + fr.merged;
        prog.failed = result.failed + fr.failed;
        if (!d.results.length || fr.fetched >= d.total) break;
      }
      result.fetched += fr.fetched;
      result.created += fr.created;
      result.merged += fr.merged;
      result.failed += fr.failed;
      state.folderLastSync[f.uid] = new Date().toISOString();
    }
    result.tags = tagsSeen.size;
    result.ok = true;
  } catch (e) {
    result.error = (e as Error).message;
  } finally {
    result.finishedAt = new Date().toISOString();
    prog.running = false;
    prog.message = result.error;
    await saveSyncState({ lastRun: result, folderLastSync: state.folderLastSync }).catch(() => undefined);
  }
  return result;
}

/** Fire-and-forget; progress via syncProgress(). Returns false if a sync is already running. */
export function startSalesqlSync(opts: SyncOptions = {}) {
  if (g.__salesqlSync?.running) return false;
  void runSalesqlSync(opts).catch(() => undefined);
  return true;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Called by the scheduler: runs a full sync once a day when auto-sync is on. */
export async function autoSyncStep() {
  if (g.__salesqlSync?.running) return;
  const st = await getSyncState();
  if (!st.autoSync) return;
  const last = st.lastRun ? new Date(st.lastRun.startedAt).getTime() : 0;
  if (Date.now() - last < DAY_MS) return;
  if (!(await getSetting("salesql_web_token"))) return;
  startSalesqlSync({ folderUids: st.folderUids });
}
