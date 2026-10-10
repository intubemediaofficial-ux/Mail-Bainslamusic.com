import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Open-tracking pixel: /api/intubtool/t/<messageDbId>.gif */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id.replace(/\.gif$/i, "");
  const ua = req.headers.get("user-agent") || "";
  // Gmail image proxy fetches at send time too; still count but the sender's own BCC open is filtered by UA heuristics elsewhere
  if (id && !/prefetch|preload/i.test(ua)) {
    prisma.emailMessage
      .update({ where: { id }, data: { openCount: { increment: 1 }, lastOpenedAt: new Date(), firstOpenedAt: undefined } })
      .then(async (m) => {
        if (!m.firstOpenedAt) await prisma.emailMessage.update({ where: { id }, data: { firstOpenedAt: new Date() } });
      })
      .catch(() => undefined);
  }
  return new Response(GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
