import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { enrichLeads } from "@/lib/intubtool/enrich";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { kick } from "@/lib/intubtool/scheduler";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * body: { ids?: string[]; filter?: string (querystring); force?: boolean; mode?: "now" | "queue" }
 *  - "now"   : enrich up to 20 leads synchronously and return per-lead outcomes (DB-first, SalesQL only when missing)
 *  - "queue" : mark leads as queued; background scheduler processes them
 */
export async function POST(req: Request) {
  const b = await readJson<{ ids?: string[]; filter?: string; force?: boolean; mode?: string }>(req);
  if (!b) return fail("Invalid payload");
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  let ids = Array.isArray(b.ids) ? b.ids.filter((x) => typeof x === "string") : [];
  if (!ids.length && typeof b.filter === "string") {
    const rows = await prisma.lead.findMany({ where: leadWhere(new URLSearchParams(b.filter), scope), select: { id: true }, take: 2000 });
    ids = rows.map((r) => r.id);
  }
  if (ids.length) {
    const visible = await prisma.lead.findMany({ where: { AND: [{ id: { in: ids } }, leadWhere(new URLSearchParams(), scope)] }, select: { id: true } });
    ids = visible.map((r) => r.id);
  }
  if (!ids.length) return fail("No leads selected");

  if (b.mode === "queue" || ids.length > 20) {
    const where = { id: { in: ids }, ...(b.force ? {} : { AND: [{ email: null }, { phone: null }] }) };
    const toQueue = await prisma.lead.updateMany({ where, data: { enrichStatus: "queued", enrichError: null } });
    const cached = ids.length - toQueue.count;
    kick("enrich");
    return ok({ queued: toQueue.count, cached, message: `${cached} already have contact data (no credits used) · ${toQueue.count} queued for SalesQL` });
  }

  const results = await enrichLeads(ids, { force: !!b.force });
  const summary = results.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  return ok({ results, summary });
}
