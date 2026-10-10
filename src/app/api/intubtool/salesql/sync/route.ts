import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { getSetting } from "@/lib/intubtool/settings";
import { fetchFolders, fetchTags, getSyncState, saveSyncState, startSalesqlSync, syncProgress, SalesqlAuthError } from "@/lib/intubtool/salesql-sync";
import { listContactLists } from "@/lib/intubtool/lists";
import { ensureScheduler } from "@/lib/intubtool/scheduler";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET  ?live=1  → SalesQL folders (+ counts) and tags from SalesQL, plus saved sync settings and progress.
 * GET           → saved settings + progress only (cheap; used for polling).
 * POST { action: "start", folderUids?: string[] | null, tagLists?: boolean }
 * POST { action: "settings", autoSync?: boolean, tagLists?: boolean, folderUids?: string[] | null }
 */
export async function GET(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  if (!scope.admin) return fail("Admin only", 403);
  ensureScheduler();
  const live = new URL(req.url).searchParams.get("live") === "1";
  const state = await getSyncState();
  const progress = syncProgress();
  if (!live) return ok({ state, progress });
  const token = await getSetting("salesql_web_token");
  if (!token) return fail("SalesQL web token not set — add it in Settings (Test SalesQL shows if it works).", 412);
  try {
    const [folders, tags, lists] = await Promise.all([fetchFolders(token, true), fetchTags(token), listContactLists(scope)]);
    const byName = new Map(lists.map((l) => [l.name.toLowerCase(), l]));
    return ok({
      state,
      progress,
      folders: folders.map((f) => ({ ...f, lastSync: state.folderLastSync[f.uid] ?? null, list: byName.get(f.name.trim().toLowerCase()) ?? null })),
      tags: tags.map((t) => ({ ...t, list: byName.get(t.name.toLowerCase()) ?? null })),
    });
  } catch (e) {
    return fail((e as Error).message, e instanceof SalesqlAuthError ? 401 : 502);
  }
}

type Body = { action?: string; folderUids?: unknown; tagLists?: unknown; autoSync?: unknown };

const uidList = (v: unknown): string[] | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
  return out.length ? out : null;
};

export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  if (!scope.admin) return fail("Admin only", 403);
  const b = await readJson<Body>(req);
  if (!b) return fail("Invalid payload");
  const folderUids = uidList(b.folderUids);
  const tagLists = typeof b.tagLists === "boolean" ? b.tagLists : undefined;
  const autoSync = typeof b.autoSync === "boolean" ? b.autoSync : undefined;

  if (b.action === "settings") {
    const patch: Parameters<typeof saveSyncState>[0] = {};
    if (folderUids !== undefined) patch.folderUids = folderUids;
    if (tagLists !== undefined) patch.tagLists = tagLists;
    if (autoSync !== undefined) patch.autoSync = autoSync;
    return ok({ state: await saveSyncState(patch) });
  }

  if (b.action === "start") {
    if (!(await getSetting("salesql_web_token"))) return fail("SalesQL web token not set — add it in Settings.", 412);
    const patch: Parameters<typeof saveSyncState>[0] = {};
    if (folderUids !== undefined) patch.folderUids = folderUids;
    if (tagLists !== undefined) patch.tagLists = tagLists;
    if (Object.keys(patch).length) await saveSyncState(patch);
    if (!startSalesqlSync({ folderUids, tagLists })) return fail("A SalesQL sync is already running", 409);
    return ok({ started: true, progress: syncProgress() }, 202);
  }

  return fail("Unknown action");
}
