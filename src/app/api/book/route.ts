import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/intubtool/settings";
import { bookingConfig, freeSlots } from "@/lib/intubtool/booking";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = bookingConfig(await getSettings());
  const slots = await freeSlots(cfg);
  return ok({ title: cfg.title, intro: cfg.intro, durationMin: cfg.durationMin, slots: slots.map((d) => d.toISOString()) });
}

export async function POST(req: Request) {
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const name = str(b.name, 120);
  const email = str(b.email, 200).toLowerCase();
  const slot = new Date(str(b.slot, 40));
  if (!name) return fail("Please enter your name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Please enter a valid email");
  if (isNaN(slot.getTime())) return fail("Please pick a time slot");
  const cfg = bookingConfig(await getSettings());
  const free = await freeSlots(cfg);
  if (!free.some((d) => d.getTime() === slot.getTime())) return fail("This slot was just taken, please pick another", 409);
  const open = await prisma.meeting.count({ where: { email, slotAt: { gte: new Date() }, status: { in: ["requested", "confirmed"] } } });
  if (open >= 3) return fail("You already have upcoming bookings with us", 429);
  const m = await prisma.meeting.create({
    data: {
      name,
      email,
      phone: str(b.phone, 40) || null,
      company: str(b.company, 150) || null,
      topic: str(b.topic, 200) || null,
      message: str(b.message, 2000) || null,
      slotAt: slot,
      durationMin: cfg.durationMin,
      source: str(b.source, 100) || null,
    },
  });
  // A booking is a positive reply: stop further follow-ups to this person.
  await prisma.campaignLead
    .updateMany({ where: { lead: { email }, status: { in: ["pending", "active"] } }, data: { status: "replied" } })
    .catch(() => {});
  return ok({ id: m.id, slotAt: m.slotAt }, 201);
}
