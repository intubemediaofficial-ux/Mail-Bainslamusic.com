import { prisma } from "@/lib/db";
import { asRole, asStatus, currentUser, type SessionUser } from "@/lib/auth";
import { getSettings } from "./settings";

/**
 * Data/settings scope for the signed-in user.
 *  - admin  → owner = null (global settings, shared data pool); sees every owner's data.
 *  - member → owner = user id; sees own data (+ shared/null-owner data when `shareData` is on).
 */
export type Scope = {
  user: SessionUser;
  admin: boolean;
  /** settings owner: null = global */
  owner: string | null;
  /** owner ids this user may read; null = everything (admin) */
  readOwners: (string | null)[] | null;
};

export async function getScope(): Promise<Scope | null> {
  const user = await currentUser();
  if (!user) return null;
  return scopeFor(user);
}

/** Scope for background work on behalf of an owner id (null → the shared/admin pool, sees everything). */
export async function scopeForOwner(ownerId: string | null): Promise<Scope> {
  const u = ownerId ? await prisma.user.findUnique({ where: { id: ownerId } }) : null;
  if (!ownerId || !u) return { user: SYSTEM, admin: true, owner: null, readOwners: null };
  return scopeFor({ id: u.id, email: u.email, name: u.name ?? u.email, role: asRole(u.role), status: asStatus(u.status), shareData: u.shareData });
}

const SYSTEM: SessionUser = { id: "", email: "system", name: "system", role: "admin", status: "approved", shareData: true };

export function scopeFor(user: SessionUser): Scope {
  const admin = user.role === "admin";
  return {
    user,
    admin,
    owner: admin ? null : user.id,
    readOwners: admin ? null : user.shareData ? [user.id, null] : [user.id],
  };
}

/**
 * Prisma `where` fragment restricting a model with `ownerId` to what this scope may read.
 * Returned as an AND-able object so it composes with a query's own OR/AND.
 */
export function ownerFilter(scope: Scope): { AND: { OR: { ownerId: string | null }[] }[] } | Record<string, never> {
  if (scope.readOwners === null) return {};
  return { AND: [{ OR: scope.readOwners.map((ownerId) => ({ ownerId })) }] };
}

/**
 * Campaigns are never shared: a member only sees campaigns they own (they send via the member's Gmail);
 * admin sees all. Legacy campaigns (ownerId null) belong to the admin pool.
 */
export function campaignWhere(scope: Scope, id?: string): { id?: string; ownerId?: string } {
  return { ...(id ? { id } : {}), ...(scope.admin ? {} : { ownerId: scope.user.id }) };
}

/** Owner id newly created records get. */
export const writeOwner = (scope: Scope) => scope.owner;

/** Settings for the scope's owner (member's own Gmail etc., or global for admin). */
export const scopeSettings = (scope: Scope) => getSettings(scope.owner);
