import { ok, fail } from "@/app/api/admin/_lib";
import { getScope } from "@/lib/intubtool/scope";
import { listLabels, listMessages } from "@/lib/intubtool/gmail-inbox";
import { MailConfigError } from "@/lib/intubtool/mailer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const u = new URL(req.url);
  const path = (u.searchParams.get("path") || "").slice(0, 300);
  const page = Math.max(1, Number(u.searchParams.get("page")) || 1);
  const q = (u.searchParams.get("q") || "").slice(0, 300).trim();
  try {
    if (!path) return ok(await listLabels(scope.owner));
    return ok(await listMessages(scope.owner, path, page, q));
  } catch (e) {
    return fail(e instanceof MailConfigError ? e.message : `Gmail error: ${(e as Error).message}`.slice(0, 300), 400);
  }
}
