import { ok, fail, readJson, str, int } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { kick } from "@/lib/intubtool/scheduler";
import { getList } from "@/lib/intubtool/lists";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

const cleanList = (v: unknown, max: number) =>
  Array.from(
    new Set(
      (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\r?\n|,/) : [])
        .map((x) => String(x).trim())
        .filter(Boolean)
    )
  ).slice(0, max);

export async function GET() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const where = scope.readOwners ? { OR: scope.readOwners.map((ownerId) => ({ ownerId })) } : {};
  const jobs = await prisma.searchJob.findMany({ where, orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { leads: true } } } });
  return ok(jobs);
}

export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const body = await readJson(req);
  if (!body) return fail("Invalid payload");
  const listId = str(body.listId, 100) || null;
  if (listId && !(await getList(scope, listId))) return fail("List not found", 404);
  const mode = body.mode === "title" ? "title" : "company";
  const companies = mode === "title" ? [] : cleanList(body.companies, 200);
  const keywords = cleanList(body.keywords, 20);
  if (mode === "company" && !companies.length) return fail("Add at least one company");
  if (!keywords.length) return fail("Add at least one keyword / designation");
  const source = mode === "title" ? "salesql" : body.source === "linkedin" ? "linkedin" : "salesql";
  const rawFilters = (body.filters && typeof body.filters === "object" ? body.filters : {}) as Record<string, unknown>;
  const filters = {
    countries: cleanList(rawFilters.countries, 20),
    regions: cleanList(rawFilters.regions, 20),
    industries: cleanList(rawFilters.industries, 20),
    hasEmail: rawFilters.hasEmail === true,
    hasPhone: rawFilters.hasPhone === true,
    strictTitle: rawFilters.strictTitle !== false,
  };
  const filterLabel = [...filters.countries, ...filters.regions, ...filters.industries].slice(0, 2).join(", ");
  const job = await prisma.searchJob.create({
    data: {
      name:
        str(body.name, 120) ||
        (mode === "title" ? `${keywords.slice(0, 3).join(", ")}${filterLabel ? ` · ${filterLabel}` : ""}` : `${companies.length} companies · ${keywords.slice(0, 3).join(", ")}`),
      companies: JSON.stringify(companies),
      keywords: JSON.stringify(keywords),
      source,
      mode,
      filters: mode === "title" ? JSON.stringify(filters) : null,
      maxPerCompany: Math.min(mode === "title" ? 2000 : source === "salesql" ? 500 : 100, Math.max(1, int(body.maxPerCompany, 25))),
      listId,
      ownerId: scope.owner,
    },
  });
  kick("search");
  return ok(job, 201);
}
