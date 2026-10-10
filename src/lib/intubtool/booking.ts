import { prisma } from "@/lib/db";
import type { ToolSettings } from "./settings";

const IST_OFFSET_MIN = 330;

export type BookingConfig = { title: string; intro: string; durationMin: number; days: number[]; startHour: number; endHour: number };

const num = (v: string, d: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : d;
};

export function bookingConfig(s: ToolSettings): BookingConfig {
  const days = (s.booking_days || "1,2,3,4,5,6")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const startHour = num(s.booking_start_hour, 11, 0, 23);
  return {
    title: s.booking_title || "Book a call",
    intro: s.booking_intro || "",
    durationMin: num(s.booking_duration_min, 30, 10, 180),
    days: days.length ? days : [1, 2, 3, 4, 5, 6],
    startHour,
    endHour: Math.max(startHour + 1, num(s.booking_end_hour, 19, 1, 24)),
  };
}

export function publicBase(s: ToolSettings) {
  return (s.public_base_url || process.env.NEXTAUTH_URL || "https://mail.bainslamusic.com").replace(/\/$/, "");
}

export function bookingLink(s: ToolSettings, email?: string | null, name?: string | null) {
  const q = new URLSearchParams();
  if (email) q.set("e", email);
  if (name) q.set("n", name);
  const qs = q.toString();
  return `${publicBase(s)}/book${qs ? `?${qs}` : ""}`;
}

/** Free slot start times (UTC Date) for the next `daysAhead` days, in IST working hours, minus booked meetings. */
export async function freeSlots(cfg: BookingConfig, daysAhead = 14): Promise<Date[]> {
  const now = Date.now();
  const until = now + (daysAhead + 1) * 86_400_000;
  const booked = await prisma.meeting.findMany({
    where: { slotAt: { gte: new Date(now - 4 * 3_600_000), lte: new Date(until) }, status: { notIn: ["cancelled"] } },
    select: { slotAt: true, durationMin: true },
  });
  const busy = booked.map((m) => [m.slotAt.getTime(), m.slotAt.getTime() + m.durationMin * 60_000] as const);
  const step = cfg.durationMin * 60_000;
  const minStart = now + 2 * 3_600_000;
  const ist = new Date(now + IST_OFFSET_MIN * 60_000);
  const out: Date[] = [];
  for (let d = 0; d <= daysAhead; d++) {
    const dayUtcMidnight = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + d);
    const weekday = new Date(dayUtcMidnight).getUTCDay();
    if (!cfg.days.includes(weekday)) continue;
    const dayStart = dayUtcMidnight - IST_OFFSET_MIN * 60_000;
    for (let t = dayStart + cfg.startHour * 3_600_000; t + step <= dayStart + cfg.endHour * 3_600_000; t += step) {
      if (t < minStart) continue;
      if (busy.some(([a, b]) => t < b && t + step > a)) continue;
      out.push(new Date(t));
    }
  }
  return out;
}
