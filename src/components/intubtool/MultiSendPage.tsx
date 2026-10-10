"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Layers, Play, Pause, Download, Activity } from "lucide-react";
import { PageHeader, Card, Button, useToast, api, Modal, Field, Input } from "@/components/admin/ui";
import { Badge, Empty, timeAgo } from "./bits";

type Blast = {
  id: string; name: string; status: string; createdAt: string; lastRunAt: string | null; autoRunHour: number | null;
  _count: { accounts: number; leads: number };
  stats: { total: number; pending: number; queued: number; sent: number; replied: number; bounced: number; sentToday: number; failed: number; skipped: number; invalid: number };
};

export const blastTone = (s: string) => (({ running: "cyan", idle: "amber", paused: "gray", completed: "green", draft: "gray" }) as const)[s] || "gray";
export const blastLabel = (s: string) => ({ running: "Running", idle: "Waiting for next run", paused: "Paused", completed: "Completed", draft: "Draft" })[s] || s;

export default function MultiSendPage() {
  const router = useRouter();
  const { toast, success, error } = useToast();
  const [list, setList] = useState<Blast[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(() => api<Blast[]>("/api/intubtool/blasts").then(setList).catch((e: Error) => error(e.message)), [error]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const create = async () => {
    setBusy("new");
    try {
      const b = await api<{ id: string }>("/api/intubtool/blasts", { method: "POST", body: JSON.stringify({ name: name.trim() || `List ${new Date().toLocaleDateString()}` }) });
      router.push(`/intubtool/multi-send/${b.id}`);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: string) => {
    setBusy(id);
    try {
      const r = await api<{ message: string }>(`/api/intubtool/blasts/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
      success(r.message);
      load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {toast}
      <PageHeader
        title="Multi-account Send"
        description="Admin only. Upload a separate database, pick which connected Gmail accounts to include, set how many each sends, press Start — #1 takes the first range, #2 the next… Progress is remembered for the next run."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/intubtool/multi-send/accounts">
              <Button variant="secondary"><Activity className="h-4 w-4" /> Accounts health</Button>
            </Link>
            <Button onClick={() => setOpen(true)} loading={busy === "new"}>
              <Plus className="h-4 w-4" /> New list
            </Button>
          </div>
        }
      />
      {list === null ? (
        <p className="text-sm text-white/50">Loading…</p>
      ) : list.length === 0 ? (
        <Empty title="No lists yet">Create a list, upload your database (CSV/XLSX), choose sender accounts and start.</Empty>
      ) : (
        <div className="grid gap-4">
          {list.map((b) => {
            const s = b.stats;
            const done = s.total ? Math.round((s.sent / s.total) * 100) : 0;
            return (
              <Card key={b.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/intubtool/multi-send/${b.id}`} className="flex items-center gap-2 text-lg font-bold hover:text-cyan-300">
                      <Layers className="h-5 w-5 text-cyan-400" /> {b.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/50">
                      <Badge tone={blastTone(b.status)}>{blastLabel(b.status)}</Badge>
                      <span>{b._count.accounts} accounts</span>
                      <span>· {s.total} leads</span>
                      {b.autoRunHour != null && <span>· auto-run daily {String(b.autoRunHour).padStart(2, "0")}:00</span>}
                      {b.lastRunAt && <span>· last start {timeAgo(b.lastRunAt)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {b.status === "running" ? (
                      <Button variant="secondary" onClick={() => act(b.id, "pause")} loading={busy === b.id}>
                        <Pause className="h-4 w-4" /> Pause
                      </Button>
                    ) : (
                      <Button onClick={() => act(b.id, b.status === "paused" ? "resume" : "start")} loading={busy === b.id} disabled={!s.total}>
                        <Play className="h-4 w-4" /> {b.status === "paused" ? "Resume" : "Start next run"}
                      </Button>
                    )}
                    <a href={`/api/intubtool/blasts/${b.id}/report`} title="Excel report">
                      <Button variant="secondary">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
                  {[
                    ["Sent", s.sent, "text-emerald-300"],
                    ["Today", s.sentToday, ""],
                    ["Queued", s.queued, "text-cyan-300"],
                    ["Pending", s.pending, "text-amber-300"],
                    ["Replied", s.replied, "text-violet-300"],
                    ["Bounced", s.bounced, "text-red-300"],
                  ].map(([l, v, c]) => (
                    <div key={l as string} className="rounded-xl bg-white/[0.03] p-3">
                      <p className={`text-xl font-extrabold ${c}`}>{v as number}</p>
                      <p className="text-[11px] uppercase tracking-wider text-white/45">{l as string}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${done}%` }} />
                </div>
                <p className="mt-1 text-right text-[11px] text-white/40">{done}% of database contacted</p>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New list">
        <Field label="Name" hint="e.g. Company database Oct 2026">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="List name" autoFocus />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create} loading={busy === "new"}>Create</Button>
        </div>
      </Modal>
    </>
  );
}
