"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Copy, ExternalLink, Save } from "lucide-react";
import { PageHeader, Card, Button, Field, Input, Textarea, useToast, api } from "@/components/admin/ui";

type Meeting = { id: string; name: string; email: string; phone: string | null; company: string | null; topic: string | null; message: string | null; slotAt: string; durationMin: number; status: string; createdAt: string };
const KEYS = ["booking_title", "booking_intro", "booking_duration_min", "booking_days", "booking_start_hour", "booking_end_hour"] as const;
const tone: Record<string, string> = {
  requested: "bg-amber-500/15 text-amber-200",
  confirmed: "bg-emerald-500/15 text-emerald-200",
  done: "bg-sky-500/15 text-sky-200",
  cancelled: "bg-red-500/15 text-red-200",
  no_show: "bg-white/10 text-white/60",
};
const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function MeetingsPage() {
  const { toast, success, error } = useToast();
  const [list, setList] = useState<Meeting[] | null>(null);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/book` : "/book";

  const load = useCallback(async () => {
    try {
      setList(await api<Meeting[]>("/api/intubtool/meetings"));
    } catch (e) {
      error((e as Error).message);
    }
  }, [error]);
  useEffect(() => {
    load();
    api<{ values: Record<string, string> }>("/api/intubtool/settings").then((s) => setCfg(Object.fromEntries(KEYS.map((k) => [k, String(s.values?.[k] ?? "")]))));
  }, [load]);

  const setStatus = async (id: string, status: string) => {
    try {
      await api("/api/intubtool/meetings", { method: "PATCH", body: JSON.stringify({ id, status }) });
      load();
    } catch (e) {
      error((e as Error).message);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      await api("/api/intubtool/settings", { method: "PUT", body: JSON.stringify(cfg) });
      success("Booking settings saved");
    } catch (e) {
      error((e as Error).message);
    }
    setSaving(false);
  };
  const upcoming = (list || []).filter((m) => new Date(m.slotAt) >= new Date() && m.status !== "cancelled").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings"
        description={<>Leads book calls on your public booking page. Put <code className="rounded bg-white/10 px-1">{"{{booking_link}}"}</code> in any campaign / multi-send email.</>}
        actions={
          <>
            <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(link); success("Booking link copied"); }}><Copy className="h-4 w-4" /> Copy link</Button>
            <a href="/book" target="_blank"><Button><ExternalLink className="h-4 w-4" /> Open booking page</Button></a>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5"><div className="text-sm text-white/50">Upcoming</div><div className="mt-1 text-3xl font-bold text-white">{upcoming}</div></Card>
        <Card className="p-5"><div className="text-sm text-white/50">Total booked</div><div className="mt-1 text-3xl font-bold text-white">{list?.length ?? "–"}</div></Card>
        <Card className="p-5"><div className="text-sm text-white/50">Booking link</div><div className="mt-2 truncate text-sm text-fuchsia-300">{link}</div></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-white/10 text-left text-white/50">
            <tr><th className="px-4 py-3">When (IST)</th><th className="px-4 py-3">Person</th><th className="px-4 py-3">Topic</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {list?.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-white/50"><CalendarCheck className="mx-auto mb-2 h-8 w-8" />No bookings yet. Share your booking link in emails.</td></tr>
            )}
            {list?.map((m) => (
              <tr key={m.id} className="border-b border-white/5 align-top">
                <td className="px-4 py-3 text-white">{fmt(m.slotAt)}<div className="text-xs text-white/40">{m.durationMin} min</div></td>
                <td className="px-4 py-3 text-white">{m.name}{m.company ? <span className="text-white/50"> · {m.company}</span> : null}
                  <div className="text-xs text-white/50"><a href={`mailto:${m.email}`} className="hover:text-white">{m.email}</a>{m.phone ? ` · ${m.phone}` : ""}</div></td>
                <td className="px-4 py-3 text-white/70">{m.topic || "–"}{m.message && <div className="mt-1 max-w-xs text-xs text-white/40">{m.message}</div>}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone[m.status] || tone.no_show}`}>{m.status.replace("_", " ")}</span></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {m.status === "requested" && <Button variant="secondary" className="!px-3 !py-1" onClick={() => setStatus(m.id, "confirmed")}>Confirm</Button>}
                  {["requested", "confirmed"].includes(m.status) && <Button variant="ghost" className="!px-3 !py-1" onClick={() => setStatus(m.id, "done")}>Done</Button>}
                  {["requested", "confirmed"].includes(m.status) && <Button variant="ghost" className="!px-3 !py-1" onClick={() => setStatus(m.id, "cancelled")}>Cancel</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Booking page settings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Page title"><Input value={cfg.booking_title || ""} onChange={(e) => setCfg({ ...cfg, booking_title: e.target.value })} /></Field>
          <Field label="Call length (minutes)"><Input type="number" value={cfg.booking_duration_min || ""} onChange={(e) => setCfg({ ...cfg, booking_duration_min: e.target.value })} /></Field>
          <Field label="Intro text" className="sm:col-span-2"><Textarea rows={2} value={cfg.booking_intro || ""} onChange={(e) => setCfg({ ...cfg, booking_intro: e.target.value })} /></Field>
          <Field label="Working days" hint="0=Sun 1=Mon … 6=Sat, comma separated"><Input value={cfg.booking_days || ""} onChange={(e) => setCfg({ ...cfg, booking_days: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From hour (IST)"><Input type="number" value={cfg.booking_start_hour || ""} onChange={(e) => setCfg({ ...cfg, booking_start_hour: e.target.value })} /></Field>
            <Field label="To hour (IST)"><Input type="number" value={cfg.booking_end_hour || ""} onChange={(e) => setCfg({ ...cfg, booking_end_hour: e.target.value })} /></Field>
          </div>
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Save</Button></div>
      </Card>
      {toast}
    </div>
  );
}
