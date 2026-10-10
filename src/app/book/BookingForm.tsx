"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarCheck, Clock, Loader2 } from "lucide-react";

type Info = { title: string; intro: string; durationMin: number; slots: string[] };
const TZ = "Asia/Kolkata";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-fuchsia-500 focus:outline-none";

export default function BookingForm() {
  const sp = useSearchParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [f, setF] = useState({ name: sp.get("n") || "", email: sp.get("e") || "", phone: "", company: "", topic: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const load = () =>
    fetch("/api/book")
      .then((r) => r.json())
      .then((j) => {
        setInfo(j.data);
        if (j.data?.slots?.length) setDay((d) => d || dayKey(j.data.slots[0]));
      });
  useEffect(() => {
    load();
  }, []);

  const days = useMemo(() => {
    const m = new Map<string, string>();
    info?.slots.forEach((s) => m.has(dayKey(s)) || m.set(dayKey(s), s));
    return Array.from(m.entries());
  }, [info]);
  const daySlots = info?.slots.filter((s) => dayKey(s) === day) || [];
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot) return setErr("Please pick a time slot");
    setBusy(true);
    setErr("");
    const r = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, slot, source: sp.get("src") || null }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok || j.ok === false) {
      setErr(j.error || "Booking failed, please try again");
      if (r.status === 409) {
        setSlot("");
        load();
      }
      return;
    }
    setDone(slot);
  };

  if (!info) return <div className="flex justify-center py-20 text-white/50"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (done)
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-10 text-center">
        <CalendarCheck className="mx-auto mb-4 h-12 w-12 text-emerald-300" />
        <h1 className="text-2xl font-bold">You&apos;re booked!</h1>
        <p className="mt-2 text-white/70">{dayLabel(done)} at {timeLabel(done)} (IST), {info.durationMin} min. Our team will contact you on {f.email}{f.phone ? ` / ${f.phone}` : ""}.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur sm:p-8">
      <h1 className="text-2xl font-bold sm:text-3xl">{info.title}</h1>
      {info.intro && <p className="mt-2 text-white/60">{info.intro}</p>}
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-xs text-white/60"><Clock className="h-3.5 w-3.5" /> {info.durationMin} min · India time (IST)</p>

      <div className="mt-6">
        <div className="mb-2 text-sm font-semibold text-white/80">1. Pick a day</div>
        {days.length ? (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {days.map(([k, iso]) => (
              <button type="button" key={k} onClick={() => { setDay(k); setSlot(""); }}
                className={`shrink-0 rounded-xl border px-4 py-2 text-sm ${day === k ? "border-fuchsia-500 bg-fuchsia-500/20 text-white" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"}`}>
                {dayLabel(iso)}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/50">No free slots right now, please check back later.</p>
        )}
      </div>

      {daySlots.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold text-white/80">2. Pick a time</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {daySlots.map((s) => (
              <button type="button" key={s} onClick={() => setSlot(s)}
                className={`rounded-lg border px-2 py-2 text-sm ${slot === s ? "border-violet-500 bg-violet-500/25 text-white" : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"}`}>
                {timeLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 text-sm font-semibold text-white/80">3. Your details</div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <input required className={inputCls} placeholder="Your name *" value={f.name} onChange={set("name")} />
        <input required type="email" className={inputCls} placeholder="Email *" value={f.email} onChange={set("email")} />
        <input className={inputCls} placeholder="Phone / WhatsApp" value={f.phone} onChange={set("phone")} />
        <input className={inputCls} placeholder="Channel / label / company" value={f.company} onChange={set("company")} />
        <input className={`${inputCls} sm:col-span-2`} placeholder="Topic (e.g. music distribution, Content ID)" value={f.topic} onChange={set("topic")} />
        <textarea rows={3} className={`${inputCls} sm:col-span-2`} placeholder="Anything we should know?" value={f.message} onChange={set("message")} />
      </div>
      {err && <p className="mt-3 text-sm text-red-300">{err}</p>}
      <button disabled={busy} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-violet-600 px-4 py-3 font-semibold text-white hover:from-fuchsia-500 hover:to-violet-500 disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm booking{slot ? ` · ${dayLabel(slot)}, ${timeLabel(slot)}` : ""}
      </button>
    </form>
  );
}
