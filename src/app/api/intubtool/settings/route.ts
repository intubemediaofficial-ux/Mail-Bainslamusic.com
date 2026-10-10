import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { getPublicSettings, saveSettings } from "@/lib/intubtool/settings";
import { ensureScheduler, schedulerStatus } from "@/lib/intubtool/scheduler";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  ensureScheduler();
  return ok({ ...(await getPublicSettings(scope.owner)), scheduler: scope.admin ? schedulerStatus() : undefined, admin: scope.admin });
}

export async function PUT(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail("Invalid payload");
  const n = await saveSettings(body, scope.owner);
  return ok({ updated: n });
}
