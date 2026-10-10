"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Mail, Play, Pause, Inbox, RefreshCw, Download } from "lucide-react";
import { PageHeader, Card, Button, useToast, api } from "@/components/admin/ui";
import { Badge, statusTone, Empty, timeAgo } from "./bits";
import AiSequenceButton from "./AiSequenceButton";

type Campaign = {
  id: string; name: string; status: string; dailyLimit: number; aiPersonalize: boolean; createdAt: string;
  steps: { id: string; order: number; subject: string }[];
  _count: { leads: number; messages: number };
  stats: { sent: number; opened: number; replied: number; bounced: number; pending: number };
};

export default function CampaignsPage() {
  const router = useRouter();
  const { toast, success, error } = useToast();
  const [list, setList] = useState<Campaign[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api<Campaign[]>("/api/intubtool/campaigns").then(setList).catch((e: Error) => error(e.message)), [error]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const create = async () => {
    setBusy("new");
    try {
      const c = await api<{ id: string }>("/api/intubtool/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: `Campaign ${new Date().toLocaleDateString()}`,
          steps: [
            { subject: "Quick question about {{company}}'s YouTube", body: "Hi {{first_name}},\n\nI came across your work as {{title}} at {{company}}.\n\n[Write your pitch here — keep it 3–5 lines, one clear ask.]\n\nWould a short call this week make sense?\n\n{{signature}}" },
            { delayDays: 3, subject: "", body: "Hi {{first_name}}, just bumping this in case it got buried. Happy to share a 2-minute overview if useful.\n\n{{signature}}" },
          ],
        }),
      });
      router.push(`/campaigns/${c.id}`);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: string) => {
    setBusy(id);
    try {
      await api(`/api/intubtool/campaigns/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
      load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      const r = await api<{ message: string }>("/api/intubtool/inbox-sync", { method: "POST" });
      success(r.message);
      load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <>
      {toast}
      <PageHeader
        title="Email campaigns"
        description="1-by-1 sending from your Gmail with BCC copy, open tracking, reply/bounce detection and automatic follow-ups."
        actions={
          <>
            <a href="/api/intubtool/campaigns/report?format=xlsx" title="Excel: campaign summary + replied, bounced and all sent mails"><Button variant="secondary"><Download className="h-4 w-4" /> Export report</Button></a>
            <Button variant="secondary" onClick={sync} loading={busy === "sync"}><Inbox className="h-4 w-4" /> Check inbox now</Button>
            <AiSequenceButton onError={error} />
            <Button onClick={create} loading={busy === "new"}><Plus className="h-4 w-4" /> New campaign</Button>
          </>
        }
      />
      {list && list.length === 0 && (
        <Empty title="No campaigns yet">Create one, write your email + follow-up steps, add leads from the database, and start.</Empty>
      )}
      <div className="grid gap-4">
        {list?.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/campaigns/${c.id}`} className="flex items-center gap-2 text-lg font-semibold hover:text-cyan-300">
                  <Mail className="h-4 w-4 text-white/40" /> {c.name} <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                </Link>
                <p className="mt-1 text-xs text-white/50">
                  {c.steps.length} step{c.steps.length === 1 ? "" : "s"} · {c._count.leads} leads · {c.dailyLimit}/day {c.aiPersonalize && "· AI personalized"} · created {timeAgo(c.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                {c.status === "running" ? (
                  <Button variant="secondary" onClick={() => act(c.id, "pause")} loading={busy === c.id}><Pause className="h-4 w-4" /> Pause</Button>
                ) : c.status !== "completed" ? (
                  <Button onClick={() => act(c.id, c.status === "paused" ? "resume" : "start")} loading={busy === c.id}><Play className="h-4 w-4" /> {c.status === "paused" ? "Resume" : "Start"}</Button>
                ) : null}
                <Link href={`/campaigns/${c.id}`}><Button variant="ghost">Open</Button></Link>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center sm:grid-cols-6">
              {[
                ["Pending", c.stats.pending, ""],
                ["Sent", c.stats.sent, ""],
                ["Opened", c.stats.opened, pct(c.stats.opened, c.stats.sent)],
                ["Replied", c.stats.replied, pct(c.stats.replied, c.stats.sent)],
                ["Bounced", c.stats.bounced, pct(c.stats.bounced, c.stats.sent)],
                ["Total mails", c._count.messages, ""],
              ].map(([l, n, p]) => (
                <div key={String(l)} className="rounded-xl bg-white/[0.03] p-3">
                  <p className="text-xl font-bold">{n}</p>
                  <p className="text-[11px] uppercase tracking-wider text-white/40">{l}{p ? ` · ${p}` : ""}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {list === null && <p className="mt-6 flex items-center gap-2 text-sm text-white/40"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</p>}
    </>
  );
}
