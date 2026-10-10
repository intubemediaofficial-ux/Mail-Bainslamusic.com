import type { Prisma } from "@prisma/client";
import type { Scope } from "./scope";

/** Facet value used for leads with no category. */
export const UNCATEGORIZED = "__none__";

/** Builds the Lead filter from query params, always restricted to what `scope` may read. */
export function leadWhere(sp: URLSearchParams, scope: Scope): Prisma.LeadWhereInput {
  const q = sp.get("q")?.trim();
  const company = sp.get("company")?.trim();
  const category = sp.get("category")?.trim();
  const source = sp.get("source")?.trim();
  const has = sp.get("has")?.trim(); // email | phone | none | linkedin
  const jobId = sp.get("jobId")?.trim();
  const status = sp.get("enrich")?.trim();
  const ids = sp.get("ids")?.split(",").filter(Boolean);
  const list = sp.get("list")?.trim(); // list id | "none" (in no list)
  // multi-value facets (repeated params): co=Acme&co=Globex, cat=CEO&cat=CTO, li=<listId>&li=<listId>
  const companies = sp.getAll("co").map((s) => s.trim()).filter(Boolean);
  const categories = sp.getAll("cat").map((s) => s.trim()).filter(Boolean);
  const listIds = sp.getAll("li").map((s) => s.trim()).filter(Boolean);
  const notInCampaign = sp.get("notInCampaign")?.trim();
  const where: Prisma.LeadWhereInput = {};
  if (ids?.length) where.id = { in: ids };
  if (list === "none") where.lists = { none: {} };
  else if (list) where.lists = { some: { listId: list } };
  else if (listIds.length) where.lists = { some: { listId: { in: listIds } } };
  if (q) where.OR = [{ fullName: { contains: q } }, { company: { contains: q } }, { title: { contains: q } }, { email: { contains: q } }, { location: { contains: q } }];
  if (companies.length) where.company = { in: companies };
  else if (company) where.company = { contains: company };
  if (categories.length) {
    const hasNone = categories.includes(UNCATEGORIZED);
    const named = categories.filter((c) => c !== UNCATEGORIZED);
    where.AND = [{ OR: [...(named.length ? [{ category: { in: named } }] : []), ...(hasNone ? [{ category: null }, { category: "" }] : [])] }];
  } else if (category) where.category = { contains: category };
  if (notInCampaign) where.campaignLeads = { none: { campaignId: notInCampaign } };
  if (source) where.source = source;
  if (jobId) where.jobId = jobId;
  if (status) where.enrichStatus = status;
  if (has === "email") where.email = { not: null };
  if (has === "phone") where.phone = { not: null };
  if (has === "linkedin") where.linkedinUrl = { not: null };
  if (has === "none") where.AND = [...(where.AND as Prisma.LeadWhereInput[] | undefined ?? []), { email: null }, { phone: null }];
  if (sp.get("unsubscribed") === "0") where.unsubscribed = false;
  if (sp.get("unsubscribed") === "1") where.unsubscribed = true;
  if (scope.readOwners) where.AND = [...((where.AND as Prisma.LeadWhereInput[] | undefined) ?? []), { OR: scope.readOwners.map((ownerId) => ({ ownerId })) }];
  return where;
}
