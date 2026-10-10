import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { adminBlast } from "../../_lib";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

function where(blastId: string, sp: URLSearchParams): Prisma.BlastLeadWhereInput {
  const status = sp.get("status") || "";
  const q = (sp.get("q") || "").trim();
  const acc = sp.get("account") || "";
  return {
    blastId,
    ...(status === "contacted" ? { sentAt: { not: null } } : status ? { status } : {}),
    ...(acc ? { accountId: acc } : {}),
    ...(q ? { OR: [{ email: { contains: q } }, { fullName: { contains: q } }, { company: { contains: q } }] } : {}),
  };
}

export async function GET(req: Request, { params }: Ctx) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const size = Math.min(200, Math.max(10, Number(sp.get("size") || 50)));
  const w = where(r.blast.id, sp);
  const [total, rows] = await Promise.all([
    prisma.blastLead.count({ where: w }),
    prisma.blastLead.findMany({
      where: w,
      orderBy: { serial: "asc" },
      skip: (page - 1) * size,
      take: size,
      include: { account: { select: { id: true, order: true, email: true } }, messages: { orderBy: { sentAt: "desc" }, take: 3, select: { id: true, kind: true, status: true, sentAt: true, openCount: true, clickCount: true, repliedAt: true, replySnippet: true, bounceReason: true, error: true, variant: true } } },
    }),
  ]);
  return ok({ total, page, size, rows });
}

type Bulk = { ids?: string[]; all?: boolean; action: "hold" | "release" | "skip" | "vip" | "unvip" | "delete" | "retry"; filter?: Record<string, string> };

/** Bulk lead actions: hold (pause this lead), release (→ pending), skip, vip, delete, retry (failed → pending). */
export async function PUT(req: Request, { params }: Ctx) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const b = await readJson<Bulk>(req);
  if (!b?.action) return fail("Invalid payload");
  const sp = new URLSearchParams(b.filter || {});
  const base: Prisma.BlastLeadWhereInput = b.all ? where(r.blast.id, sp) : { blastId: r.blast.id, id: { in: (b.ids || []).slice(0, 5000) } };
  let n = 0;
  switch (b.action) {
    case "hold":
      n = (await prisma.blastLead.updateMany({ where: { ...base, status: { in: ["pending", "queued"] } }, data: { status: "hold", accountId: null } })).count;
      break;
    case "release":
    case "retry":
      n = (await prisma.blastLead.updateMany({ where: { ...base, status: { in: ["hold", "skipped", "failed", "invalid"] } }, data: { status: "pending", statusNote: null, accountId: null, ...(b.action === "retry" ? {} : { verifyStatus: "none" }) } })).count;
      break;
    case "skip":
      n = (await prisma.blastLead.updateMany({ where: { ...base, status: { in: ["pending", "queued", "hold"] } }, data: { status: "skipped", statusNote: "Skipped by admin", accountId: null } })).count;
      break;
    case "vip":
    case "unvip":
      n = (await prisma.blastLead.updateMany({ where: base, data: { vip: b.action === "vip" } })).count;
      break;
    case "delete":
      n = (await prisma.blastLead.deleteMany({ where: base })).count;
      break;
    default:
      return fail("Unknown action");
  }
  return ok({ affected: n });
}
