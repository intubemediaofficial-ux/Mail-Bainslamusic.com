import { ok, fail } from "@/app/api/admin/_lib";
import { getScope } from "@/lib/intubtool/scope";
import { getMessage } from "@/lib/intubtool/gmail-inbox";
import { MailConfigError } from "@/lib/intubtool/mailer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const u = new URL(req.url);
  const path = (u.searchParams.get("path") || "").slice(0, 300);
  const uid = Number(u.searchParams.get("uid"));
  if (!path || !Number.isInteger(uid) || uid < 1) return fail("Invalid message");
  try {
    const m = await getMessage(scope.owner, path, uid);
    return m ? ok(m) : fail("Message not found", 404);
  } catch (e) {
    return fail(e instanceof MailConfigError ? e.message : `Gmail error: ${(e as Error).message}`.slice(0, 300), 400);
  }
}
