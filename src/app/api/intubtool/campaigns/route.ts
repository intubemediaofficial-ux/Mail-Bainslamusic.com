import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { campaignData, stepsData } from "@/lib/intubtool/campaign-input";
import { prisma } from "@/lib/db";
import { campaignWhere, getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const campaigns = await prisma.campaign.findMany({
    where: campaignWhere(scope),
    orderBy: { createdAt: "desc" },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { leads: true, messages: true } }, owner: { select: { id: true, name: true, email: true } } },
  });
  const stats = await Promise.all(
    campaigns.map(async (c) => {
      const [sent, opened, replied, bounced, pending] = await Promise.all([
        prisma.emailMessage.count({ where: { campaignId: c.id, status: "sent" } }),
        prisma.emailMessage.count({ where: { campaignId: c.id, openCount: { gt: 0 } } }),
        prisma.campaignLead.count({ where: { campaignId: c.id, status: "replied" } }),
        prisma.emailMessage.count({ where: { campaignId: c.id, status: "bounced" } }),
        prisma.campaignLead.count({ where: { campaignId: c.id, status: { in: ["pending", "active"] } } }),
      ]);
      return { ...c, stats: { sent, opened, replied, bounced, pending } };
    })
  );
  return ok(stats);
}

export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const data = campaignData(b);
  if (!data.name) return fail("Campaign name is required");
  const steps = stepsData(b.steps);
  if (!steps.length) return fail("Add at least one email step with subject and body");
  const c = await prisma.campaign.create({ data: { ...data, ownerId: scope.owner, steps: { create: steps } }, include: { steps: true } });
  return ok(c, 201);
}
