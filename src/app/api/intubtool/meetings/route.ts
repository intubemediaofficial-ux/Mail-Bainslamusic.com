import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

const STATUSES = ["requested", "confirmed", "done", "cancelled", "no_show"];

export async function GET() {
  const scope = await getScope();
  if (!scope?.admin) return fail("Forbidden", 403);
  const meetings = await prisma.meeting.findMany({ orderBy: { slotAt: "desc" }, take: 300 });
  return ok(meetings);
}

export async function PATCH(req: Request) {
  const scope = await getScope();
  if (!scope?.admin) return fail("Forbidden", 403);
  const b = await readJson(req);
  const id = str(b?.id, 100);
  const status = str(b?.status, 20);
  if (!id || !STATUSES.includes(status)) return fail("Invalid payload");
  const m = await prisma.meeting.update({ where: { id }, data: { status } });
  return ok(m);
}
