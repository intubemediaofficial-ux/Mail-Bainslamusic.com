import { ok, fail } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { kick } from "@/lib/intubtool/scheduler";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { getScope, type Scope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const findJob = (scope: Scope, id: string) => prisma.searchJob.findFirst({ where: { id, ...(scope.readOwners ? { OR: scope.readOwners.map((ownerId) => ({ ownerId })) } : {}) } });

export async function GET(_: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const job = await findJob(scope, params.id);
  if (!job) return fail("Not found", 404);
  const leads = await prisma.lead.findMany({ where: { AND: [{ jobId: job.id }, leadWhere(new URLSearchParams(), scope)] }, orderBy: [{ company: "asc" }, { fullName: "asc" }] });
  return ok({ job, leads });
}

/** Cancel (running/queued) or re-queue (failed/cancelled). */
export async function PATCH(req: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const job = await findJob(scope, params.id);
  if (!job) return fail("Not found", 404);
  if (action === "cancel") {
    if (!["queued", "running"].includes(job.status)) return fail("Job is not running");
    await prisma.searchJob.update({ where: { id: job.id }, data: { status: "cancelled" } });
    return ok({ status: "cancelled" });
  }
  if (action === "retry") {
    if (!["failed", "cancelled", "done"].includes(job.status)) return fail("Job is still running");
    await prisma.searchJob.update({ where: { id: job.id }, data: { status: "queued", progress: 0, error: null, log: "", startedAt: null, finishedAt: null } });
    kick("search");
    return ok({ status: "queued" });
  }
  return fail("Unknown action");
}

export async function DELETE(_: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const job = await findJob(scope, params.id);
  if (!job) return fail("Not found", 404);
  if (job.status === "running") return fail("Cancel the job before deleting");
  await prisma.searchJob.delete({ where: { id: job.id } });
  return ok({ deleted: true });
}
