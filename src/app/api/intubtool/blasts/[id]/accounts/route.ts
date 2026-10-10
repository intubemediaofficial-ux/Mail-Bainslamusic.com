import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { adminBlast } from "../../_lib";

export const dynamic = "force-dynamic";

type Patch = { id: string; enabled?: boolean; quota?: number; order?: number; warmup?: boolean; warmupStart?: number; warmupStep?: number; warmupEveryDays?: number; unblock?: boolean; label?: string };

/** Per-account settings: include on/off, quota (how many leads this account takes per run), order (#), warm-up, unblock. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const b = await readJson<{ accounts?: Patch[] }>(req);
  if (!b || !Array.isArray(b.accounts)) return fail("Invalid payload");
  const n = (v: unknown, fb: number, min = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.trunc(v)) : fb);
  for (const p of b.accounts) {
    if (!p?.id) continue;
    const a = await prisma.blastAccount.findFirst({ where: { id: p.id, blastId: r.blast.id } });
    if (!a) continue;
    const enabled = typeof p.enabled === "boolean" ? p.enabled : a.enabled;
    await prisma.blastAccount.update({
      where: { id: a.id },
      data: {
        enabled,
        quota: n(p.quota, a.quota, 0),
        order: n(p.order, a.order, 1),
        warmup: typeof p.warmup === "boolean" ? p.warmup : a.warmup,
        warmupStart: n(p.warmupStart, a.warmupStart, 1),
        warmupStep: n(p.warmupStep, a.warmupStep, 1),
        warmupEveryDays: n(p.warmupEveryDays, a.warmupEveryDays, 1),
        ...(typeof p.label === "string" ? { label: p.label.trim().slice(0, 100) || null } : {}),
        ...(p.unblock ? { blockedUntil: null, lastError: null } : {}),
        ...(typeof p.warmup === "boolean" && p.warmup && !a.warmup ? { warmupStartedAt: null } : {}),
      },
    });
    // switching an account off hands its queued leads back to the pool
    if (!enabled && a.enabled) await prisma.blastLead.updateMany({ where: { blastId: r.blast.id, accountId: a.id, status: "queued" }, data: { status: "pending", accountId: null } });
  }
  // renumber 1..n by order
  const all = await prisma.blastAccount.findMany({ where: { blastId: r.blast.id }, orderBy: [{ order: "asc" }, { id: "asc" }] });
  await Promise.all(all.map((a, i) => (a.order === i + 1 ? null : prisma.blastAccount.update({ where: { id: a.id }, data: { order: i + 1 } }))));
  return ok({ saved: b.accounts.length });
}
