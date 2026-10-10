import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { findListByName, listContactLists } from "@/lib/intubtool/lists";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  return ok({ lists: await listContactLists(scope) });
}

/** body: { name: string; description?: string } */
export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const name = str(b.name, 120);
  if (!name) return fail("List name is required");
  const dup = await findListByName(scope, name);
  if (dup) return fail("A list with this name already exists", 409);
  const list = await prisma.contactList.create({ data: { name, description: str(b.description, 500) || null, ownerId: scope.owner } });
  return ok({ list: { ...list, count: 0 } }, 201);
}
