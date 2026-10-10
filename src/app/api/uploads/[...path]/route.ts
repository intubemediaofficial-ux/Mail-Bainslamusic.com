import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const rel = params.path.join("/");
  if (rel.includes("..") || rel.includes("\0")) return new NextResponse("Not found", { status: 404 });
  const abs = path.join(UPLOAD_DIR, rel);
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) return new NextResponse("Not found", { status: 404 });
  const type = TYPES[path.extname(abs).toLowerCase()];
  if (!type) return new NextResponse("Not found", { status: 404 });
  try {
    const buf = await readFile(abs);
    return new NextResponse(buf, {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
