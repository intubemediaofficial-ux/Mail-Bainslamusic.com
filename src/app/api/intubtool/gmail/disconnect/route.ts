import { ok, fail } from "@/app/api/admin/_lib";
import { disconnect } from "@/lib/intubtool/google-oauth";
import { getScope, scopeSettings } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

export async function POST() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  await disconnect(await scopeSettings(scope));
  return ok({ disconnected: true });
}
