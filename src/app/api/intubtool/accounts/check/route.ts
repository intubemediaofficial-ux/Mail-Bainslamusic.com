import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { requireAdmin } from "@/lib/auth";
import { checkAccount, ownerOf, runHealthCheck } from "@/lib/intubtool/account-health";
import { denied } from "../../blasts/_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST { ownerKey } → check one account; POST {} → check all (manual run, no alert). */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return denied();
  const b = await readJson<{ ownerKey?: string }>(req);
  if (b?.ownerKey) {
    const r = await checkAccount(ownerOf(b.ownerKey));
    if (r.status === "none") return fail("No Gmail connected for this account");
    return ok({ ...r, message: r.status === "ok" ? `${r.email}: sign-in OK` : `${r.email}: ${r.error}` });
  }
  const results = await runHealthCheck();
  const failed = results.filter((r) => r.status === "fail").length;
  return ok({ results, message: `${results.length} account${results.length === 1 ? "" : "s"} checked · ${results.length - failed} OK · ${failed} failed` });
}
