import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { startBlast, syncBlastAccounts, verifyPending } from "@/lib/intubtool/blast-runner";
import { kick } from "@/lib/intubtool/scheduler";
import { adminBlast } from "../../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const b = await readJson<{ action?: string }>(req);
  const action = b?.action;
  try {
    switch (action) {
      case "start": {
        const res = await startBlast(r.blast.id);
        kick("mail");
        const summary = res.ranges.map((x) => `#${x.order} ${x.email}: ${x.from}–${x.to} (${x.count})`).join(" · ");
        return ok({ ...res, message: res.allocated ? `Allocated ${res.allocated} leads — ${summary}` : res.pending ? "Nothing allocated (accounts blocked or quotas already filled)" : "No pending leads left — all done" });
      }
      case "pause":
        await prisma.blast.update({ where: { id: r.blast.id }, data: { status: "paused" } });
        return ok({ message: "Paused — nothing more goes out until you resume" });
      case "resume": {
        const queued = await prisma.blastLead.count({ where: { blastId: r.blast.id, status: "queued" } });
        if (queued) {
          await prisma.blast.update({ where: { id: r.blast.id }, data: { status: "running" } });
          kick("mail");
          return ok({ message: `Resumed — ${queued} queued leads continue` });
        }
        const res = await startBlast(r.blast.id);
        kick("mail");
        return ok({ ...res, message: `Resumed — allocated ${res.allocated} new leads` });
      }
      case "stop": {
        // give every queued lead back to the pool (progress of sent mails is kept)
        const n = await prisma.blastLead.updateMany({ where: { blastId: r.blast.id, status: "queued" }, data: { status: "pending", accountId: null } });
        await prisma.blast.update({ where: { id: r.blast.id }, data: { status: "idle" } });
        return ok({ message: `Stopped — ${n.count} queued leads returned to pending` });
      }
      case "verify": {
        const res = await verifyPending(r.blast.id);
        return ok({ ...res, message: `Checked ${res.checked} emails — ${res.invalid} invalid, ${res.risky} risky` });
      }
      case "sync-accounts": {
        const accounts = await syncBlastAccounts(r.blast.id);
        return ok({ message: `${accounts.filter((a) => a.connected).length} connected Gmail accounts` });
      }
      default:
        return fail("Unknown action");
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}
