import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Scope } from "./scope";

export type ListSummary = { id: string; name: string; description: string | null; count: number; createdAt: Date; updatedAt: Date; ownerId: string | null };

export const listWhere = (scope: Scope): Prisma.ContactListWhereInput => (scope.readOwners ? { OR: scope.readOwners.map((ownerId) => ({ ownerId })) } : {});

export async function listContactLists(scope: Scope): Promise<ListSummary[]> {
  const rows = await prisma.contactList.findMany({ where: listWhere(scope), orderBy: { name: "asc" }, include: { _count: { select: { leads: true } } } });
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, count: r._count.leads, createdAt: r.createdAt, updatedAt: r.updatedAt, ownerId: r.ownerId }));
}

/** A list the scope may use (read + add leads). */
export async function getList(scope: Scope, id: string) {
  return prisma.contactList.findFirst({ where: { id, ...listWhere(scope) } });
}

/** Case-insensitive name match (SQLite `equals` is case-sensitive) among the scope's lists. */
export async function findListByName(scope: Scope, name: string, excludeId?: string) {
  const n = name.trim().toLowerCase();
  const all = await prisma.contactList.findMany({ where: listWhere(scope), select: { id: true, name: true } });
  return all.find((l) => l.name.toLowerCase() === n && l.id !== excludeId) ?? null;
}

/** Find a list by exact (case-insensitive) name or create it for the scope's owner. */
export async function ensureList(scope: Scope, name: string) {
  const n = name.trim();
  const hit = await findListByName(scope, n);
  return hit ?? prisma.contactList.create({ data: { name: n, ownerId: scope.owner }, select: { id: true, name: true } });
}

export async function addLeadsToList(listId: string, leadIds: string[]) {
  if (!leadIds.length) return 0;
  const existing = await prisma.contactListLead.findMany({ where: { listId, leadId: { in: leadIds } }, select: { leadId: true } });
  const have = new Set(existing.map((e) => e.leadId));
  const data = leadIds.filter((id) => !have.has(id)).map((leadId) => ({ listId, leadId }));
  if (!data.length) return 0;
  const r = await prisma.contactListLead.createMany({ data });
  return r.count;
}

export async function removeLeadsFromList(listId: string, leadIds: string[]) {
  if (!leadIds.length) return 0;
  const r = await prisma.contactListLead.deleteMany({ where: { listId, leadId: { in: leadIds } } });
  return r.count;
}
