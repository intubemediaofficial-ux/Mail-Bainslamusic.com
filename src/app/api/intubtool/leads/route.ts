import type { Prisma } from "@prisma/client";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { upsertLead } from "@/lib/intubtool/leads";
import { addLeadsToList, getList, listContactLists } from "@/lib/intubtool/lists";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const take = Math.min(200, Math.max(10, Number(sp.get("limit") || 50)));
  const where = leadWhere(sp, scope);
  const sort = sp.get("sort") || "createdAt";
  const orderBy: Prisma.LeadOrderByWithRelationInput[] =
    sort === "company" ? [{ company: "asc" }, { fullName: "asc" }] : sort === "name" ? [{ fullName: "asc" }] : [{ createdAt: "desc" }];
  // company sidebar counts follow the active list filter (not the text/company filters)
  const all = leadWhere(new URLSearchParams(), scope);
  const companyWhere: Prisma.LeadWhereInput = where.lists ? { ...all, lists: where.lists } : all;
  const [total, rows, companies, lists, allTotal] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({ where, orderBy, skip: (page - 1) * take, take, include: { lists: { select: { list: { select: { id: true, name: true } } } } } }),
    prisma.lead.groupBy({ by: ["company"], where: companyWhere, _count: { _all: true }, orderBy: { _count: { company: "desc" } }, take: 300 }),
    listContactLists(scope),
    prisma.lead.count({ where: all }),
  ]);
  const leads = rows.map(({ lists: memberships, ...l }) => ({ ...l, lists: memberships.map((m) => m.list) }));
  return ok({ total, page, limit: take, leads, companies: companies.map((c) => ({ company: c.company, count: c._count._all })), lists, allTotal });
}

/** Manually add a single lead. */
export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const fullName = str(b.fullName, 200);
  const company = str(b.company, 200);
  if (!fullName || !company) return fail("Name and company are required");
  const { lead, created } = await upsertLead({
    fullName,
    company,
    title: str(b.title, 300) || null,
    linkedinUrl: str(b.linkedinUrl, 500) || null,
    email: str(b.email, 200) || null,
    phone: str(b.phone, 60) || null,
    location: str(b.location, 200) || null,
    category: str(b.category, 200) || null,
    notes: str(b.notes, 2000) || null,
    source: "manual",
    ownerId: scope.owner,
    matchOwners: scope.readOwners,
  });
  const listId = str(b.listId, 100);
  if (listId && (await getList(scope, listId))) await addLeadsToList(listId, [lead.id]);
  return ok({ lead, created }, created ? 201 : 200);
}
