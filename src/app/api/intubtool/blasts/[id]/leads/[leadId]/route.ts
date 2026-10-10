import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { adminBlast } from "../../../_lib";

export const dynamic = "force-dynamic";

/** Per-lead notes / hot-cold tag / VIP. */
export async function PUT(req: Request, { params }: { params: { id: string; leadId: string } }) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const lead = await prisma.blastLead.findFirst({ where: { id: params.leadId, blastId: r.blast.id } });
  if (!lead) return fail("Not found", 404);
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const tag = b.replyTag === null ? null : ["hot", "cold"].includes(String(b.replyTag)) ? String(b.replyTag) : undefined;
  const updated = await prisma.blastLead.update({
    where: { id: lead.id },
    data: {
      ...(tag !== undefined ? { replyTag: tag } : {}),
      ...(typeof b.notes === "string" ? { notes: str(b.notes, 5000) || null } : {}),
      ...(typeof b.vip === "boolean" ? { vip: b.vip } : {}),
      ...(typeof b.phone === "string" ? { phone: str(b.phone, 40) || null } : {}),
    },
  });
  return ok(updated);
}
