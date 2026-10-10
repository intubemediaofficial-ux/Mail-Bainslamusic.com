import { prisma } from "@/lib/db";
import { runSearchJob } from "./search-runner";
import { campaignTick } from "./campaign-runner";
import { blastTick } from "./blast-runner";
import { enrichLeads } from "./enrich";
import { syncInbox } from "./mailer";
import { getSettings, gmailConfigured } from "./settings";
import { autoSyncStep } from "./salesql-sync";
import { healthStep } from "./account-health";

type State = { timer?: NodeJS.Timeout; searchBusy: boolean; enrichBusy: boolean; mailBusy: boolean; imapBusy: boolean; healthBusy: boolean; lastImap: number; lastSalesqlCheck: number; lastHealthCheck: number; lastError?: string; ticks: number };

const g = globalThis as unknown as { __intubtoolScheduler?: State };

const TICK_MS = 20_000;

async function searchStep(st: State) {
  if (st.searchBusy) return;
  const job = await prisma.searchJob.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
  if (!job) return;
  st.searchBusy = true;
  runSearchJob(job.id)
    .catch((e) => (st.lastError = `search: ${(e as Error).message}`))
    .finally(() => (st.searchBusy = false));
}

async function enrichStep(st: State) {
  if (st.enrichBusy) return;
  const queued = await prisma.lead.findMany({ where: { enrichStatus: "queued" }, select: { id: true }, orderBy: { updatedAt: "asc" }, take: 25 });
  if (!queued.length) return;
  st.enrichBusy = true;
  enrichLeads(queued.map((q) => q.id))
    .then(async (res) => {
      // if we stopped early because of a key/credit error, un-queue the rest so they don't spin forever
      const stopped = res.filter((r) => r.status === "skipped" && r.message?.startsWith("Stopped"));
      if (stopped.length)
        await prisma.lead.updateMany({ where: { id: { in: stopped.map((r) => r.leadId) } }, data: { enrichStatus: "error", enrichError: stopped[0].message?.replace("Stopped: ", "") } });
    })
    .catch((e) => (st.lastError = `enrich: ${(e as Error).message}`))
    .finally(() => (st.enrichBusy = false));
}

async function mailStep(st: State) {
  if (st.mailBusy) return;
  st.mailBusy = true;
  try {
    await campaignTick();
  } catch (e) {
    st.lastError = `campaign: ${(e as Error).message}`;
  }
  try {
    await blastTick();
  } catch (e) {
    st.lastError = `multi-send: ${(e as Error).message}`;
  } finally {
    st.mailBusy = false;
  }
}

/** Every connected Gmail account (global/admin + each member) is scanned for replies/bounces. */
async function imapStep(st: State) {
  if (st.imapBusy) return;
  const s = await getSettings();
  const every = (Number(s.imap_poll_minutes) || 10) * 60_000;
  if (Date.now() - st.lastImap < every) return;
  const anySent = (await prisma.emailMessage.count({ where: { status: "sent" } })) + (await prisma.blastMessage.count({ where: { status: "sent" } }));
  if (!anySent) return;
  const members = await prisma.userSetting.findMany({ where: { key: { in: ["gmail_refresh_token", "gmail_app_password"] }, user: { status: "approved" } }, select: { userId: true } });
  const owners: (string | null)[] = [...(gmailConfigured(s) ? [null] : []), ...Array.from(new Set(members.map((m) => m.userId)))];
  if (!owners.length) return;
  st.imapBusy = true;
  st.lastImap = Date.now();
  void (async () => {
    for (const owner of owners) {
      await syncInbox(owner).catch((e) => (st.lastError = `imap${owner ? ` (${owner})` : ""}: ${(e as Error).message}`));
    }
  })().finally(() => (st.imapBusy = false));
}

async function salesqlStep(st: State) {
  if (Date.now() - st.lastSalesqlCheck < 5 * 60_000) return;
  st.lastSalesqlCheck = Date.now();
  await autoSyncStep().catch((e) => (st.lastError = `salesql sync: ${(e as Error).message}`));
}

/** Once a day (Settings → health check hour): sign in to every Gmail account and alert the admin about failures. */
async function accountHealthStep(st: State) {
  if (st.healthBusy || Date.now() - st.lastHealthCheck < 5 * 60_000) return;
  st.lastHealthCheck = Date.now();
  st.healthBusy = true;
  healthStep()
    .catch((e) => (st.lastError = `health: ${(e as Error).message}`))
    .finally(() => (st.healthBusy = false));
}

async function tick(st: State) {
  st.ticks++;
  await Promise.all([searchStep(st), enrichStep(st), mailStep(st), imapStep(st), salesqlStep(st), accountHealthStep(st)]);
}

/** Starts the in-process background scheduler once (safe to call from any server code path). */
export function ensureScheduler() {
  if (g.__intubtoolScheduler?.timer) return g.__intubtoolScheduler;
  const st: State = { searchBusy: false, enrichBusy: false, mailBusy: false, imapBusy: false, healthBusy: false, lastImap: 0, lastSalesqlCheck: 0, lastHealthCheck: 0, ticks: 0 };
  st.timer = setInterval(() => void tick(st).catch((e) => (st.lastError = (e as Error).message)), TICK_MS);
  st.timer.unref?.();
  g.__intubtoolScheduler = st;
  void tick(st).catch(() => undefined);
  return st;
}

export function schedulerStatus() {
  const st = g.__intubtoolScheduler;
  return st ? { running: true, searchBusy: st.searchBusy, enrichBusy: st.enrichBusy, imapBusy: st.imapBusy, ticks: st.ticks, lastError: st.lastError } : { running: false };
}

/** Immediately kick a specific step (used after user actions so they don't wait for the next tick). */
export function kick(step: "search" | "enrich" | "mail" | "imap") {
  const st = ensureScheduler();
  const fn = { search: searchStep, enrich: enrichStep, mail: mailStep, imap: imapStep }[step];
  void fn(st).catch((e) => (st.lastError = (e as Error).message));
}
