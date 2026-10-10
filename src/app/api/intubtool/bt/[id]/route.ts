import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Open-tracking pixel for multi-account send mails: /api/intubtool/bt/<messageId>.gif */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id.replace(/\.gif$/i, "");
  if (id && !/prefetch|preload/i.test(req.headers.get("user-agent") || "")) {
    prisma.blastMessage
      .findUnique({ where: { id }, select: { firstOpenedAt: true } })
      .then((m) => m && prisma.blastMessage.update({ where: { id }, data: { openCount: { increment: 1 }, ...(m.firstOpenedAt ? {} : { firstOpenedAt: new Date() }) } }))
      .catch(() => undefined);
  }
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Content-Length": String(GIF.length), "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", Pragma: "no-cache", Expires: "0" } });
}
