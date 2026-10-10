"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Folder, Tag, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Modal, Button, Toggle, api } from "@/components/admin/ui";
import { Badge } from "./bits";

type ListRef = { id: string; name: string; count: number } | null;
type Folder = { uid: string; name: string; default: boolean; total?: number; lastSync: string | null; list: ListRef };
type TagT = { uid: string; name: string; color: string | null; list: ListRef };
type FolderResult = { uid: string; name: string; fetched: number; created: number; merged: number; failed: number };
type Result = { startedAt: string; finishedAt: string; ok: boolean; error?: string; folders: FolderResult[]; fetched: number; created: number; merged: number; failed: number; tags: number };
type State = { autoSync: boolean; tagLists: boolean; folderUids: string[] | null; lastRun: Result | null };
type Progress = { running: boolean; folder?: string; folderIndex?: number; folderCount?: number; page?: number; pages?: number; done: number; total: number; created: number; merged: number; failed: number; message?: string };
type Live = { state: State; progress: Progress; folders?: Folder[]; tags?: TagT[] };

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};

export default function SalesqlSyncModal({ open, onClose, onSynced }: { open: boolean; onClose: () => void; onSynced: () => void }) {
  const [live, setLive] = useState<Live | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tagLists, setTagLists] = useState(true);
  const [autoSync, setAutoSync] = useState(false);
  const [starting, setStarting] = useState(false);
  const [wasRunning, setWasRunning] = useState(false);

  const loadLive = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await api<Live>("/api/intubtool/salesql/sync?live=1");
      setLive(d);
      setTagLists(d.state.tagLists);
      setAutoSync(d.state.autoSync);
      setSel(new Set(d.state.folderUids?.length ? d.state.folderUids : (d.folders ?? []).map((f) => f.uid)));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadLive();
  }, [open, loadLive]);

  const running = live?.progress.running ?? false;
  useEffect(() => {
    if (!open || !running) return;
    setWasRunning(true);
    const t = setInterval(async () => {
      try {
        const d = await api<Live>("/api/intubtool/salesql/sync");
        setLive((prev) => (prev ? { ...prev, state: d.state, progress: d.progress } : d));
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [open, running]);
  useEffect(() => {
    if (wasRunning && !running) {
      setWasRunning(false);
      onSynced();
      loadLive();
    }
  }, [running, wasRunning, onSynced, loadLive]);

  const saveSettings = async (patch: Partial<Pick<State, "autoSync" | "tagLists" | "folderUids">>) => {
    try {
      const d = await api<{ state: State }>("/api/intubtool/salesql/sync", { method: "POST", body: JSON.stringify({ action: "settings", ...patch }) });
      setLive((prev) => (prev ? { ...prev, state: d.state } : prev));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const start = async () => {
    if (!live?.folders) return;
    setStarting(true);
    setErr(null);
    try {
      const all = sel.size === live.folders.length;
      const d = await api<{ started: boolean; progress: Progress }>("/api/intubtool/salesql/sync", {
        method: "POST",
        body: JSON.stringify({ action: "start", folderUids: all ? null : Array.from(sel), tagLists }),
      });
      setLive((prev) => (prev ? { ...prev, progress: { ...d.progress, running: true } } : prev));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const toggle = (uid: string) => {
    const n = new Set(sel);
    if (n.has(uid)) n.delete(uid);
    else n.add(uid);
    setSel(n);
  };

  const p = live?.progress;
  const last = live?.state.lastRun ?? null;
  const pct = p && p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;

  return (
    <Modal open={open} onClose={onClose} title="Sync from SalesQL" wide>
      <div className="space-y-5">
        <p className="text-sm text-white/60">
          Pulls your SalesQL <b>Contact Lists</b> straight into this database — no CSV export needed. Each SalesQL folder becomes a contact list here with the same name; each SalesQL <b>tag</b> becomes a
          category on the lead{tagLists ? " and its own list" : ""}. Existing leads are merged (by SalesQL id, LinkedIn URL, email or name + company) and emails/phones you already have are never overwritten. Read-only on SalesQL, uses no credits, sends no email.
        </p>

        {err && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{err}</span>
          </div>
        )}

        {running && p && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Loader2 className="h-4 w-4 animate-spin" /> Syncing {p.folder ? `“${p.folder}”` : ""} {p.folderCount ? `(folder ${p.folderIndex}/${p.folderCount}, page ${p.page}/${p.pages})` : ""}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-cyan-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-white/60">
              {p.done} / {p.total} contacts · {p.created} new · {p.merged} merged · {p.failed} failed
            </div>
          </div>
        )}

        {loading && !live ? (
          <div className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading your SalesQL folders…</div>
        ) : live?.folders ? (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">SalesQL folders → lists</h3>
                <div className="flex gap-3 text-xs">
                  <button type="button" className="text-cyan-300 hover:underline" onClick={() => setSel(new Set(live.folders!.map((f) => f.uid)))}>Select all</button>
                  <button type="button" className="text-white/50 hover:underline" onClick={() => setSel(new Set())}>Clear</button>
                </div>
              </div>
              <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
                {live.folders.map((f) => (
                  <label key={f.uid} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/5">
                    <input type="checkbox" className="accent-cyan-400" checked={sel.has(f.uid)} onChange={() => toggle(f.uid)} disabled={running} />
                    <Folder className="h-4 w-4 text-white/40" />
                    <span className="font-medium">{f.name}</span>
                    {f.default && <Badge>default</Badge>}
                    <span className="text-xs text-white/50">{f.total ?? "?"} in SalesQL</span>
                    <span className="ml-auto text-xs text-white/50">
                      {f.list ? <>→ list “{f.list.name}” ({f.list.count})</> : <>→ new list “{f.name}”</>} · synced {ago(f.lastSync)}
                    </span>
                  </label>
                ))}
                {!live.folders.length && <div className="p-3 text-sm text-white/50">No folders found in your SalesQL account.</div>}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">SalesQL tags → categories{tagLists ? " + lists" : ""}</h3>
              <div className="flex flex-wrap gap-2">
                {(live.tags ?? []).map((t) => (
                  <Badge key={t.uid} tone={t.list ? "cyan" : "gray"} title={t.list ? `List “${t.list.name}” has ${t.list.count} leads` : "List will be created on sync"}>
                    <Tag className="h-3 w-3" /> {t.name}
                  </Badge>
                ))}
                {!live.tags?.length && <span className="text-sm text-white/50">No tags in SalesQL yet.</span>}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Toggle checked={tagLists} onChange={(v) => { setTagLists(v); saveSettings({ tagLists: v }); }} label="Also create a list for every tag" />
                <Toggle checked={autoSync} onChange={(v) => { setAutoSync(v); saveSettings({ autoSync: v, folderUids: sel.size === live.folders!.length ? null : Array.from(sel) }); }} label="Auto-sync every day" />
              </div>
            </div>
          </>
        ) : null}

        {last && !running && (
          <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${last.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
            {last.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />}
            <div>
              <div className="font-semibold">
                Last sync {ago(last.finishedAt)}: {last.fetched} contacts · {last.created} new · {last.merged} merged{last.failed ? ` · ${last.failed} failed` : ""} · {last.tags} tags
              </div>
              {last.error && <div className="mt-1 text-red-200">{last.error}</div>}
              {last.folders.length > 0 && (
                <div className="mt-1 text-xs text-white/60">{last.folders.map((f) => `${f.name}: ${f.fetched} (${f.created} new, ${f.merged} merged)`).join(" · ")}</div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-4">
          <Button variant="ghost" onClick={loadLive} disabled={loading || running}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={start} loading={starting} disabled={running || !live?.folders?.length || !sel.size}>
            <RefreshCw className="h-4 w-4" /> Sync {sel.size === live?.folders?.length ? "all folders" : `${sel.size} folder${sel.size === 1 ? "" : "s"}`} now
          </Button>
        </div>
      </div>
    </Modal>
  );
}
