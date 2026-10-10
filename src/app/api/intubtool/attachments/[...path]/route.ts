import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { safeAttachmentPath } from "@/lib/intubtool/attachments";
import { getScope } from "@/lib/intubtool/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Downloads a previously uploaded campaign attachment. Members can only fetch files attached to their own campaigns. */
export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const scope = await getScope();
  if (!scope) return new NextResponse("Unauthorized", { status: 401 });
  const rel = params.path.join("/");
  const abs = safeAttachmentPath(rel);
  if (!abs) return new NextResponse("Not found", { status: 404 });
  if (!scope.admin) {
    const owned = await prisma.campaignStep.findFirst({
      where: { campaign: { ownerId: scope.user.id }, attachments: { contains: JSON.stringify(rel) } },
      select: { id: true },
    });
    if (!owned) return new NextResponse("Not found", { status: 404 });
  }
  try {
    const buf = await readFile(abs);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${path.basename(abs)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
