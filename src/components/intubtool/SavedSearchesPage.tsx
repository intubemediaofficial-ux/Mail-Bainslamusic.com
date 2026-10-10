"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, Pause, Play, RefreshCw, Search } from "lucide-react";
import { PageHeader, Card, Button, Select, useToast, api } from "@/components/admin/ui";

type Saved = { id: string; name: string; intervalDays: number; active: boolean; lastRunAt: string | null; nextRunAt: string | null; runs: number; lastJob: { status: string; foundCount: number } | null };
type Job = { id: string; name: string | null; status: string; foundCount: number; createdAt: string; mode: string };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "–");
const INTERVALS = [1, 3, 7, 14, 30];

export default function SavedSearchesPage() {
  const { toast, success, error } = useToast();
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([api<Saved[]>("/api/intubtool/saved-searches"), api<Job[]>("/api/intubtool/jobs")]);
      setSaved(s);
      setJobs(j);
    } catch (e) {
      error((e as Error).message);
    }
  }, [error]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, url: string, method: string, body: unknown, msg: string) => {
    setBusy(key);
    try {
      await api(url, { method, body: JSON.stringify(body) });
      success(msg);
      await load();
    } catch (e) {
      error((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saved Searches"
        description="Save any lead search and it re-runs automatically on your schedule. New people found land in Leads Database (and the same list)."
        actions={<Link href="/search"><Button><Search className="h-4 w-4" /> New search</Button></Link>}
      />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-white/10 text-left text-white/50">
            <tr><th className="px-4 py-3">Search</th><th className="px-4 py-3">Repeat</th><th className="px-4 py-3">Last run</th><th className="px-4 py-3">Next run</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {saved?.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-white/50"><BellRing className="mx-auto mb-2 h-8 w-8" />No saved searches yet. Pick one of your searches below and click “Save &amp; repeat”.</td></tr>
            )}
            {saved?.map((s) => (
              <tr key={s.id} className="border-b border-white/5">
                <td className="px-4 py-3 text-white">{s.name}<div className="text-xs text-white/40">{s.runs} auto runs{s.lastJob ? ` · last: ${s.lastJob.foundCount} found (${s.lastJob.status})` : ""}</div></td>
                <td className="px-4 py-3">
                  <Select value={s.intervalDays} onChange={(e) => run(s.id, "/api/intubtool/saved-searches", "PATCH", { id: s.id, intervalDays: Number(e.target.value) }, "Schedule updated")}>
                    {INTERVALS.map((d) => <option key={d} value={d}>every {d} day{d > 1 ? "s" : ""}</option>)}
                  </Select>
                </td>
                <td className="px-4 py-3 text-white/70">{when(s.lastRunAt)}</td>
                <td className="px-4 py-3 text-white/70">{s.active ? when(s.nextRunAt) : <span className="text-amber-300">paused</span>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Button variant="ghost" className="!px-3 !py-1" loading={busy === s.id + "run"} onClick={() => run(s.id + "run", "/api/intubtool/saved-searches", "PATCH", { id: s.id, runNow: true, active: true }, "Will run within 10 minutes")}><RefreshCw className="h-4 w-4" /> Run now</Button>
                  <Button variant="ghost" className="!px-3 !py-1" onClick={() => run(s.id, "/api/intubtool/saved-searches", "PATCH", { id: s.id, active: !s.active }, s.active ? "Paused" : "Resumed")}>
                    {s.active ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Resume</>}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-lg font-semibold text-white">Your recent searches</h2>
        <p className="mb-4 text-sm text-white/50">Save one to repeat it weekly and get fresh leads automatically.</p>
        <div className="divide-y divide-white/5">
          {jobs.length === 0 && <p className="py-6 text-center text-sm text-white/50">No searches yet. Run one from LinkedIn Search first.</p>}
          {jobs.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="truncate text-white">{j.name || "Search"}</div>
                <div className="text-xs text-white/40">{when(j.createdAt)} · {j.foundCount} found · {j.status}</div>
              </div>
              <Button variant="secondary" loading={busy === j.id} onClick={() => run(j.id, "/api/intubtool/saved-searches", "POST", { jobId: j.id, intervalDays: 7 }, "Saved, repeats every 7 days")}>
                <BellRing className="h-4 w-4" /> Save &amp; repeat
              </Button>
            </div>
          ))}
        </div>
      </Card>
      {toast}
    </div>
  );
}
