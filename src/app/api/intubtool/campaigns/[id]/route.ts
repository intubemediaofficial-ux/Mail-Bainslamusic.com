import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { campaignData, stepsData } from "@/lib/intubtool/campaign-input";
import { campaignWhere, getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export async function GET(_: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const c = await prisma.campaign.findFirst({
    where: campaignWhere(scope, params.id),
    include: {
      steps: { orderBy: { order: "asc" } },
      leads: { include: { lead: { select: { id: true, fullName: true, company: true, title: true, email: true, unsubscribed: true } } }, orderBy: { createdAt: "desc" }, take: 500 },
      messages: { orderBy: { sentAt: "desc" }, take: 200, include: { lead: { select: { fullName: true, company: true } } } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  if (!c) return fail("Not found", 404);
  const [sent, opened, replied, bounced, pending, failed] = await Promise.all([
    prisma.emailMessage.count({ where: { campaignId: c.id, status: "sent" } }),
    prisma.emailMessage.count({ where: { campaignId: c.id, openCount: { gt: 0 } } }),
    prisma.campaignLead.count({ where: { campaignId: c.id, status: "replied" } }),
    prisma.emailMessage.count({ where: { campaignId: c.id, status: "bounced" } }),
    prisma.campaignLead.count({ where: { campaignId: c.id, status: { in: ["pending", "active"] } } }),
    prisma.emailMessage.count({ where: { campaignId: c.id, status: "failed" } }),
  ]);
  return ok({ ...c, stats: { sent, opened, replied, bounced, pending, failed } });
}

export async function PUT(req: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const exists = await prisma.campaign.findFirst({ where: campaignWhere(scope, params.id) });
  if (!exists) return fail("Not found", 404);
  const data = campaignData(b);
  if (!data.name) return fail("Campaign name is required");
  const steps = stepsData(b.steps);
  if (!steps.length) return fail("Add at least one email step");
  const c = await prisma.$transaction(async (tx) => {
    await tx.campaignStep.deleteMany({ where: { campaignId: params.id } });
    return tx.campaign.update({ where: { id: params.id }, data: { ...data, steps: { create: steps } }, include: { steps: { orderBy: { order: "asc" } } } });
  });
  return ok(c);
}

export async function DELETE(_: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  await prisma.campaign.deleteMany({ where: campaignWhere(scope, params.id) });
  return ok({ deleted: true });
}
