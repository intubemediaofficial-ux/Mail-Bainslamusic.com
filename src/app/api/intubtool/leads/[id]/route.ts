import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { normalizeLinkedinUrl } from "@/lib/intubtool/linkedin";
import { splitName } from "@/lib/intubtool/leads";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { getScope, type Scope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

const one = (id: string, scope: Scope) => ({ AND: [{ id }, leadWhere(new URLSearchParams(), scope)] });

export async function GET(_: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const lead = await prisma.lead.findFirst({ where: one(params.id, scope), include: { messages: { orderBy: { sentAt: "desc" }, take: 20 }, campaignLeads: { include: { campaign: { select: { id: true, name: true } } } } } });
  if (!lead) return fail("Not found", 404);
  return ok(lead);
}

export async function PUT(req: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const exists = await prisma.lead.findFirst({ where: one(params.id, scope) });
  if (!exists) return fail("Not found", 404);
  const fullName = str(b.fullName, 200) || exists.fullName;
  const email = str(b.email, 200).toLowerCase() || null;
  const lead = await prisma.lead.update({
    where: { id: params.id },
    data: {
      fullName,
      ...splitName(fullName),
      company: str(b.company, 200) || exists.company,
      title: str(b.title, 300) || null,
      location: str(b.location, 200) || null,
      linkedinUrl: normalizeLinkedinUrl(str(b.linkedinUrl, 500)) || null,
      email,
      phone: str(b.phone, 60) || null,
      category: str(b.category, 200) || null,
      notes: str(b.notes, 4000) || null,
      unsubscribed: typeof b.unsubscribed === "boolean" ? b.unsubscribed : exists.unsubscribed,
      enrichStatus: email || str(b.phone) ? (exists.enrichStatus === "none" ? "done" : exists.enrichStatus) : exists.enrichStatus,
    },
  });
  return ok(lead);
}

export async function DELETE(_: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const r = await prisma.lead.deleteMany({ where: scope.admin ? one(params.id, scope) : { id: params.id, ownerId: scope.user.id } });
  if (!r.count) return fail("Not found or read-only (shared lead)", 404);
  return ok({ deleted: true });
}
