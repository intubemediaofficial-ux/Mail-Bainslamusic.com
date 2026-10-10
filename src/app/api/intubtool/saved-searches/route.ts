import { ok, fail, readJson, str, int } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

const ownerWhere = (readOwners: (string | null)[] | null | undefined) => (readOwners ? { OR: readOwners.map((ownerId) => ({ ownerId })) } : {});

export async function GET() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const items = await prisma.savedSearch.findMany({ where: ownerWhere(scope.readOwners), orderBy: { createdAt: "desc" } });
  const jobIds = items.map((i) => i.lastJobId).filter((x): x is string => !!x);
  const jobs = jobIds.length
    ? await prisma.searchJob.findMany({ where: { id: { in: jobIds } }, select: { id: true, status: true, foundCount: true } })
    : [];
  return ok(items.map((i) => ({ ...i, lastJob: jobs.find((j) => j.id === i.lastJobId) || null })));
}

export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson(req);
  const job = await prisma.searchJob.findFirst({ where: { id: str(b?.jobId, 100), ...ownerWhere(scope.readOwners) } });
  if (!job) return fail("Search not found", 404);
  const intervalDays = Math.min(60, Math.max(1, int(b?.intervalDays, 7)));
  const s = await prisma.savedSearch.create({
    data: {
      ownerId: scope.owner,
      name: str(b?.name, 120) || job.name || "Saved search",
      template: JSON.stringify({
        companies: job.companies,
        keywords: job.keywords,
        source: job.source,
        mode: job.mode,
        filters: job.filters,
        maxPerCompany: job.maxPerCompany,
        listId: job.listId,
      }),
      intervalDays,
      lastRunAt: job.createdAt,
      lastJobId: job.id,
      nextRunAt: new Date(Date.now() + intervalDays * 86_400_000),
    },
  });
  return ok(s, 201);
}

export async function PATCH(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson(req);
  const cur = await prisma.savedSearch.findFirst({ where: { id: str(b?.id, 100), ...ownerWhere(scope.readOwners) } });
  if (!cur) return fail("Not found", 404);
  const data: { active?: boolean; intervalDays?: number; nextRunAt?: Date } = {};
  if (typeof b?.active === "boolean") data.active = b.active;
  if (b?.intervalDays !== undefined) data.intervalDays = Math.min(60, Math.max(1, int(b.intervalDays, 7)));
  if (b?.runNow === true) data.nextRunAt = new Date();
  return ok(await prisma.savedSearch.update({ where: { id: cur.id }, data }));
}
