import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { campaignWhere, getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

/** Add leads: body { ids?: string[]; filter?: string } */
export async function POST(req: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson<{ ids?: string[]; filter?: string }>(req);
  const c = await prisma.campaign.findFirst({ where: campaignWhere(scope, params.id) });
  if (!c) return fail("Not found", 404);
  let ids = Array.isArray(b?.ids) ? b!.ids!.filter((x) => typeof x === "string") : [];
  if (!ids.length && typeof b?.filter === "string") {
    const rows = await prisma.lead.findMany({ where: leadWhere(new URLSearchParams(b.filter), scope), select: { id: true }, take: 5000 });
    ids = rows.map((r) => r.id);
  }
  if (!ids.length) return fail("No leads selected");
  // only leads visible to this user can be added (explicit ids are re-checked against the scope)
  const eligible = await prisma.lead.findMany({ where: { AND: [{ id: { in: ids } }, leadWhere(new URLSearchParams(), scope)], email: { not: null }, unsubscribed: false }, select: { id: true } });
  let added = 0;
  for (const l of eligible) {
    const exists = await prisma.campaignLead.findUnique({ where: { campaignId_leadId: { campaignId: c.id, leadId: l.id } } });
    if (exists) continue;
    await prisma.campaignLead.create({ data: { campaignId: c.id, leadId: l.id, nextSendAt: new Date() } });
    added++;
  }
  return ok({ added, alreadyIn: eligible.length - added, skippedNoEmail: ids.length - eligible.length });
}

/** Remove leads: body { ids: string[] } (lead ids) */
export async function DELETE(req: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson<{ ids?: string[] }>(req);
  if (!b?.ids?.length) return fail("ids required");
  const c = await prisma.campaign.findFirst({ where: campaignWhere(scope, params.id), select: { id: true } });
  if (!c) return fail("Not found", 404);
  const r = await prisma.campaignLead.deleteMany({ where: { campaignId: c.id, leadId: { in: b.ids } } });
  return ok({ removed: r.count });
}
