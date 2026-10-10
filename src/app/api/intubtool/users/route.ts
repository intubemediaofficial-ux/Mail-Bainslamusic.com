import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const select = { id: true, email: true, name: true, role: true, status: true, shareData: true, approvedAt: true, createdAt: true } as const;

async function withCounts(users: { id: string }[]) {
  const ids = users.map((u) => u.id);
  const [leads, lists, campaigns, gmail] = await Promise.all([
    prisma.lead.groupBy({ by: ["ownerId"], where: { ownerId: { in: ids } }, _count: { _all: true } }),
    prisma.contactList.groupBy({ by: ["ownerId"], where: { ownerId: { in: ids } }, _count: { _all: true } }),
    prisma.campaign.groupBy({ by: ["ownerId"], where: { ownerId: { in: ids } }, _count: { _all: true } }),
    prisma.userSetting.findMany({ where: { userId: { in: ids }, key: "gmail_oauth_email" }, select: { userId: true, value: true } }),
  ]);
  const byOwner = (rows: { ownerId: string | null; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.ownerId, r._count._all]));
  const l = byOwner(leads), cl = byOwner(lists), c = byOwner(campaigns);
  const g = new Map(gmail.map((r) => [r.userId, r.value]));
  return users.map((u) => ({ ...u, counts: { leads: l.get(u.id) ?? 0, lists: cl.get(u.id) ?? 0, campaigns: c.get(u.id) ?? 0 }, gmail: g.get(u.id) ?? null }));
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return fail("Admin only", 403);
  const users = await prisma.user.findMany({ select, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  return ok({ users: await withCounts(users), me: admin.id });
}

type Patch = { id?: string; action?: "approve" | "reject" | "disable" | "enable" | "make_admin" | "make_member" | "share" | "unshare" | "delete" };

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return fail("Admin only", 403);
  const b = await readJson<Patch>(req);
  if (!b?.id || !b.action) return fail("id and action required");
  const u = await prisma.user.findUnique({ where: { id: b.id }, select });
  if (!u) return fail("User not found", 404);
  const self = u.id === admin.id;
  if (self && ["reject", "disable", "make_member", "delete"].includes(b.action)) return fail("You cannot remove your own admin access");

  switch (b.action) {
    case "approve":
      await prisma.user.update({ where: { id: u.id }, data: { status: "approved", approvedAt: u.approvedAt ?? new Date() } });
      break;
    case "reject":
      await prisma.user.update({ where: { id: u.id }, data: { status: "rejected" } });
      break;
    case "disable":
      await prisma.user.update({ where: { id: u.id }, data: { status: "disabled" } });
      break;
    case "enable":
      await prisma.user.update({ where: { id: u.id }, data: { status: "approved", approvedAt: u.approvedAt ?? new Date() } });
      break;
    case "make_admin":
      await prisma.user.update({ where: { id: u.id }, data: { role: "admin", status: "approved", shareData: true, approvedAt: u.approvedAt ?? new Date() } });
      break;
    case "make_member": {
      const admins = await prisma.user.count({ where: { role: "admin", status: "approved" } });
      if (u.role === "admin" && admins <= 1) return fail("At least one approved admin must remain");
      await prisma.user.update({ where: { id: u.id }, data: { role: "member" } });
      break;
    }
    case "share":
    case "unshare":
      await prisma.user.update({ where: { id: u.id }, data: { shareData: b.action === "share" } });
      break;
    case "delete":
      if (u.role === "admin") return fail("Demote the admin to member before deleting");
      // private data goes with the user (never falls back into the shared pool)
      await prisma.$transaction([
        prisma.lead.deleteMany({ where: { ownerId: u.id } }),
        prisma.contactList.deleteMany({ where: { ownerId: u.id } }),
        prisma.searchJob.deleteMany({ where: { ownerId: u.id } }),
        prisma.user.delete({ where: { id: u.id } }),
      ]);
      return ok({ deleted: true });
    default:
      return fail("Unknown action");
  }
  const fresh = await prisma.user.findUnique({ where: { id: u.id }, select });
  return ok((await withCounts(fresh ? [fresh] : []))[0] ?? null);
}
