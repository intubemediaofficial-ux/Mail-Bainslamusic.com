import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Click tracking redirect: /api/intubtool/bc/<messageId>?u=<url> */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url).searchParams.get("u") || "";
  const safe = /^https?:\/\//i.test(url) ? url : "/";
  if (params.id) {
    prisma.blastMessage
      .findUnique({ where: { id: params.id }, select: { firstClickedAt: true } })
      .then((m) => m && prisma.blastMessage.update({ where: { id: params.id }, data: { clickCount: { increment: 1 }, ...(m.firstClickedAt ? {} : { firstClickedAt: new Date() }) } }))
      .catch(() => undefined);
  }
  return Response.redirect(safe, 302);
}
