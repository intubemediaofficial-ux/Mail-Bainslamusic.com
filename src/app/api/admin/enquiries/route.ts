import { prisma } from "@/lib/db";
import { ok } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.enquiry.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return ok(rows);
}
