import { ok, fail } from "@/app/api/admin/_lib";
import { getScope } from "@/lib/intubtool/scope";
import { listSenders } from "@/lib/intubtool/gmail-inbox";
import { MailConfigError } from "@/lib/intubtool/mailer";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  try {
    return ok(await listSenders(scope.owner));
  } catch (e) {
    return fail(e instanceof MailConfigError ? e.message : `Gmail error: ${(e as Error).message}`.slice(0, 300), 400);
  }
}
