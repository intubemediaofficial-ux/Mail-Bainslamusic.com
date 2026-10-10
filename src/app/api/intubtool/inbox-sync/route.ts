import { ok, fail } from "@/app/api/admin/_lib";
import { syncInbox } from "@/lib/intubtool/mailer";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  try {
    const r = await syncInbox(scope.owner);
    return ok({ ...r, message: `Scanned ${r.scanned} · ${r.replies} replies · ${r.bounces} bounces · ${r.unsubscribes} unsubscribes` });
  } catch (e) {
    return fail((e as Error).message);
  }
}
