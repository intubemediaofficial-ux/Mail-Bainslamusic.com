import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const sp = new URL(req.url).searchParams;
  const where: Prisma.EmailMessageWhereInput = scope.admin ? {} : { campaign: { ownerId: scope.user.id } };
  const campaignId = sp.get("campaignId");
  const status = sp.get("status"); // sent | failed | bounced | opened | replied
  if (campaignId) where.campaignId = campaignId;
  if (status === "opened") where.openCount = { gt: 0 };
  else if (status === "replied") where.repliedAt = { not: null };
  else if (status) where.status = status;
  const q = sp.get("q")?.trim();
  if (q) where.OR = [{ toEmail: { contains: q } }, { subject: { contains: q } }, { lead: { fullName: { contains: q } } }, { lead: { company: { contains: q } } }];
  const page = Math.max(1, Number(sp.get("page") || 1));
  const take = 50;
  const [total, messages] = await Promise.all([
    prisma.emailMessage.count({ where }),
    prisma.emailMessage.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * take,
      take,
      include: { lead: { select: { id: true, fullName: true, company: true } }, campaign: { select: { id: true, name: true } } },
    }),
  ]);
  return ok({ total, page, limit: take, messages: messages.map((m) => ({ ...m, bodyHtml: undefined })) });
}
