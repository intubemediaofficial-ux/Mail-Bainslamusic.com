import { ok } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { adminBlast } from "../../_lib";

export const dynamic = "force-dynamic";

/** Unified reply inbox for this list: every lead that replied, newest first, with the reply snippet and which account it came through. */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const rows = await prisma.blastLead.findMany({
    where: { blastId: r.blast.id, OR: [{ status: "replied" }, { status: "unsubscribed" }, { repliedAt: { not: null } }] },
    orderBy: { repliedAt: "desc" },
    include: { account: { select: { order: true, email: true } }, messages: { where: { repliedAt: { not: null } }, orderBy: { repliedAt: "desc" }, take: 1, select: { subject: true, replySnippet: true, repliedAt: true, fromEmail: true } } },
    take: 1000,
  });
  return ok(rows);
}
