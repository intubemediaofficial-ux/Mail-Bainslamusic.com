import { ok, fail, readJson, str, bool, int } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { effectiveQuota, parseTemplates, syncBlastAccounts } from "@/lib/intubtool/blast-runner";
import { adminBlast, blastStats } from "../_lib";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export async function GET(_: Request, { params }: Ctx) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const accounts = await syncBlastAccounts(r.blast.id);
  const now = new Date();
  const perAccount = await Promise.all(
    accounts.map(async (a) => {
      const [sent, replied, bounced, queued, today] = await Promise.all([
        prisma.blastMessage.count({ where: { accountId: a.id, status: "sent", kind: "initial" } }),
        prisma.blastLead.count({ where: { accountId: a.id, status: "replied" } }),
        prisma.blastLead.count({ where: { accountId: a.id, status: "bounced" } }),
        prisma.blastLead.count({ where: { accountId: a.id, status: "queued" } }),
        prisma.blastMessage.count({ where: { accountId: a.id, status: "sent", sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      ]);
      return { ...a, effectiveQuota: effectiveQuota(a, now), blocked: !!(a.blockedUntil && a.blockedUntil > now), stats: { sent, replied, bounced, queued, today } };
    })
  );
  return ok({ ...r.blast, templateList: parseTemplates(r.blast.templates), accounts: perAccount, stats: await blastStats(r.blast.id) });
}

export async function PUT(req: Request, { params }: Ctx) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const hour = (v: unknown, fb: number) => Math.min(24, Math.max(0, int(v, fb)));
  let templates: string | undefined;
  if (Array.isArray(b.templates)) {
    const list = (b.templates as unknown[])
      .map((t) => (t && typeof t === "object" ? { subject: str((t as { subject?: unknown }).subject, 300), body: str((t as { body?: unknown }).body, 20000) } : null))
      .filter((t): t is { subject: string; body: string } => !!t && (!!t.subject || !!t.body));
    templates = JSON.stringify(list.length ? list : [{ subject: "", body: "" }]);
  }
  const autoRunHour = b.autoRunHour === null || b.autoRunHour === "" ? null : typeof b.autoRunHour === "number" ? hour(b.autoRunHour, 10) : undefined;
  const blast = await prisma.blast.update({
    where: { id: r.blast.id },
    data: {
      name: str(b.name, 120) || r.blast.name,
      ...(templates !== undefined ? { templates } : {}),
      followUpEnabled: bool(b.followUpEnabled, r.blast.followUpEnabled),
      followUpDays: Math.max(1, int(b.followUpDays, r.blast.followUpDays)),
      followUpSubject: typeof b.followUpSubject === "string" ? str(b.followUpSubject, 300) : r.blast.followUpSubject,
      followUpBody: typeof b.followUpBody === "string" ? str(b.followUpBody, 20000) : r.blast.followUpBody,
      gapMinSeconds: Math.max(5, int(b.gapMinSeconds, r.blast.gapMinSeconds)),
      gapMaxSeconds: Math.max(5, int(b.gapMaxSeconds, r.blast.gapMaxSeconds)),
      sendWindowStart: hour(b.sendWindowStart, r.blast.sendWindowStart),
      sendWindowEnd: hour(b.sendWindowEnd, r.blast.sendWindowEnd),
      ...(autoRunHour !== undefined ? { autoRunHour } : {}),
      trackOpens: bool(b.trackOpens, r.blast.trackOpens),
      trackClicks: bool(b.trackClicks, r.blast.trackClicks),
      verifyBeforeSend: bool(b.verifyBeforeSend, r.blast.verifyBeforeSend),
      summaryEmail: typeof b.summaryEmail === "string" ? str(b.summaryEmail, 200) || null : r.blast.summaryEmail,
      summaryHour: hour(b.summaryHour, r.blast.summaryHour),
    },
  });
  return ok(blast);
}

export async function DELETE(_: Request, { params }: Ctx) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  await prisma.blast.delete({ where: { id: r.blast.id } });
  return ok({ deleted: true });
}
