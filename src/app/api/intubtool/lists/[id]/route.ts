import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { findListByName, getList } from "@/lib/intubtool/lists";
import { getScope, type Scope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export async function GET(_: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const list = await prisma.contactList.findFirst({ where: { id: params.id, ...(scope.readOwners ? { OR: scope.readOwners.map((ownerId) => ({ ownerId })) } : {}) }, include: { _count: { select: { leads: true } } } });
  if (!list) return fail("Not found", 404);
  return ok({ list: { id: list.id, name: list.name, description: list.description, count: list._count.leads, createdAt: list.createdAt, updatedAt: list.updatedAt, ownerId: list.ownerId } });
}

/** Shared (admin) lists can be read by members with shareData but only renamed/deleted by admin. */
async function editable(scope: Scope, id: string) {
  const list = await getList(scope, id);
  if (!list) return null;
  if (!scope.admin && list.ownerId !== scope.user.id) return "readonly" as const;
  return list;
}

/** body: { name?: string; description?: string } */
export async function PUT(req: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const exists = await editable(scope, params.id);
  if (!exists) return fail("Not found", 404);
  if (exists === "readonly") return fail("Only the admin can edit shared lists", 403);
  const data: { name?: string; description?: string | null } = {};
  if (b.name !== undefined) {
    const name = str(b.name, 120);
    if (!name) return fail("List name is required");
    const dup = await findListByName(scope, name, params.id);
    if (dup) return fail("A list with this name already exists", 409);
    data.name = name;
  }
  if (b.description !== undefined) data.description = str(b.description, 500) || null;
  const list = await prisma.contactList.update({ where: { id: params.id }, data, include: { _count: { select: { leads: true } } } });
  return ok({ list: { id: list.id, name: list.name, description: list.description, count: list._count.leads } });
}

/** Deletes the list only — leads stay in the database. */
export async function DELETE(_: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const exists = await editable(scope, params.id);
  if (!exists) return fail("Not found", 404);
  if (exists === "readonly") return fail("Only the admin can delete shared lists", 403);
  await prisma.contactList.delete({ where: { id: params.id } });
  return ok({ deleted: true });
}
