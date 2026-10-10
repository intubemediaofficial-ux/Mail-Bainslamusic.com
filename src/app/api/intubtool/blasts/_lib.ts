import { fail } from "@/app/api/admin/_lib";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const denied = () => fail("Admin only", 403);

export async function adminBlast(id: string) {
  const admin = await requireAdmin();
  if (!admin) return { error: denied() } as const;
  const blast = await prisma.blast.findUnique({ where: { id } });
  if (!blast) return { error: fail("Not found", 404) } as const;
  return { admin, blast } as const;
}

export async function blastStats(blastId: string) {
  const [total, pending, queued, sent, replied, bounced, unsubscribed, failed, skipped, hold, invalid, opened, clicked, followUps, sentToday] = await Promise.all([
    prisma.blastLead.count({ where: { blastId } }),
    prisma.blastLead.count({ where: { blastId, status: "pending" } }),
    prisma.blastLead.count({ where: { blastId, status: "queued" } }),
    prisma.blastLead.count({ where: { blastId, sentAt: { not: null } } }),
    prisma.blastLead.count({ where: { blastId, status: "replied" } }),
    prisma.blastLead.count({ where: { blastId, status: "bounced" } }),
    prisma.blastLead.count({ where: { blastId, status: "unsubscribed" } }),
    prisma.blastLead.count({ where: { blastId, status: "failed" } }),
    prisma.blastLead.count({ where: { blastId, status: "skipped" } }),
    prisma.blastLead.count({ where: { blastId, status: "hold" } }),
    prisma.blastLead.count({ where: { blastId, status: "invalid" } }),
    prisma.blastMessage.count({ where: { blastId, openCount: { gt: 0 } } }),
    prisma.blastMessage.count({ where: { blastId, clickCount: { gt: 0 } } }),
    prisma.blastMessage.count({ where: { blastId, kind: "followup", status: "sent" } }),
    prisma.blastMessage.count({ where: { blastId, status: "sent", sentAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
  ]);
  return { total, pending, queued, sent, replied, bounced, unsubscribed, failed, skipped, hold, invalid, opened, clicked, followUps, sentToday };
}
