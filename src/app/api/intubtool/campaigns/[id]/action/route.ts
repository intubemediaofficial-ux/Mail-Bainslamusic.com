import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { getSettings, gmailConfigured } from "@/lib/intubtool/settings";
import { kick } from "@/lib/intubtool/scheduler";
import { campaignWhere, getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

/** body: { action: "start" | "pause" | "resume" | "complete" } */
export async function POST(req: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson<{ action?: string }>(req);
  const c = await prisma.campaign.findFirst({ where: campaignWhere(scope, params.id), include: { _count: { select: { steps: true, leads: true } } } });
  if (!c) return fail("Not found", 404);

  switch (b?.action) {
    case "start":
    case "resume": {
      // a campaign only ever sends through its owner's own Gmail connection
      const s = await getSettings(c.ownerId);
      if (!gmailConfigured(s)) return fail(c.ownerId ? "Connect your Gmail first (Settings → Gmail → Connect with Google) — campaigns send only from your own account" : "Gmail is not configured (Settings → Gmail)");
      if (!c._count.steps) return fail("Campaign has no email steps");
      if (!c._count.leads) return fail("Add leads to the campaign first");
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "running" } });
      kick("mail");
      return ok({ status: "running" });
    }
    case "pause":
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "paused" } });
      return ok({ status: "paused" });
    case "complete":
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "completed" } });
      await prisma.campaignLead.updateMany({ where: { campaignId: c.id, status: { in: ["pending", "active"] } }, data: { status: "stopped" } });
      return ok({ status: "completed" });
    default:
      return fail("Unknown action");
  }
}
