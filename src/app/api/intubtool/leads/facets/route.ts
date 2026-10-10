import { ok, fail } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { leadWhere, UNCATEGORIZED } from "@/lib/intubtool/lead-query";
import { listWhere } from "@/lib/intubtool/lists";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

/**
 * Facet counts for the lead picker. Each facet is computed with every filter
 * applied except its own dimension (so ticking a company still shows the other companies).
 */
export async function GET(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const sp = new URL(req.url).searchParams;
  const without = (key: string) => {
    const c = new URLSearchParams(sp);
    c.delete(key);
    return leadWhere(c, scope);
  };
  const [total, companies, categories, listRows, lists] = await Promise.all([
    prisma.lead.count({ where: leadWhere(sp, scope) }),
    prisma.lead.groupBy({ by: ["company"], where: without("co"), _count: { _all: true }, orderBy: [{ _count: { company: "desc" } }, { company: "asc" }], take: 500 }),
    prisma.lead.groupBy({ by: ["category"], where: without("cat"), _count: { _all: true }, orderBy: { _count: { category: "desc" } }, take: 200 }),
    prisma.contactListLead.groupBy({ by: ["listId"], where: { lead: without("li") }, _count: { _all: true } }),
    prisma.contactList.findMany({ where: listWhere(scope), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const listCount = new Map(listRows.map((r) => [r.listId, r._count._all]));
  const cats = new Map<string, number>();
  for (const c of categories) {
    const k = c.category?.trim() ? c.category : UNCATEGORIZED;
    cats.set(k, (cats.get(k) ?? 0) + c._count._all);
  }
  return ok({
    total,
    companies: companies.map((c) => ({ value: c.company, count: c._count._all })),
    categories: Array.from(cats, ([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
    lists: lists.map((l) => ({ value: l.id, label: l.name, count: listCount.get(l.id) ?? 0 })),
  });
}
