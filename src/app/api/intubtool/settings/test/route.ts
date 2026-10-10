import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { getScope, scopeSettings } from "@/lib/intubtool/scope";
import { salesql } from "@/lib/intubtool/salesql";
import { autocompleteOrganizations } from "@/lib/intubtool/salesql-mcp";
import { verifyImap, verifySmtp } from "@/lib/intubtool/mailer";
import { chat } from "@/lib/intubtool/ai";
import { LinkedInSession } from "@/lib/intubtool/linkedin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const body = await readJson<{ what: string }>(req);
  if (!scope.admin && body?.what !== "gmail") return fail("Admin only", 403);
  const s = await scopeSettings(scope);
  try {
    switch (body?.what) {
      case "salesql": {
        if (!s.salesql_api_key) return fail("SalesQL API key not set");
        const a = await salesql.allowance(s.salesql_api_key);
        let web = "web token not set (company lookup disabled)";
        if (s.salesql_web_token) {
          try {
            const hits = await autocompleteOrganizations(s.salesql_web_token, "Sony Music");
            web = hits.length ? "web token OK" : "web token OK (no results?)";
          } catch (e) {
            web = `web token FAILED: ${(e as Error).message}`;
          }
        }
        return ok({
          message: `Key valid · ${a.credits.emails_and_phones} email/phone credits · ${a.credits.verifications} verifications · resets ${new Date(a.reset_date).toLocaleDateString()} · ${web}`,
          allowance: a,
        });
      }
      case "gmail": {
        await verifySmtp(s);
        await verifyImap(s);
        return ok({ message: `Gmail SMTP + IMAP connected as ${s.gmail_user}` });
      }
      case "ai": {
        const out = await chat([{ role: "user", content: "Reply with the single word OK." }], { temperature: 0 });
        return ok({ message: `AI reachable (${s.ai_model}) → "${out.slice(0, 40)}"` });
      }
      case "linkedin": {
        if (!s.linkedin_li_at) return fail("LinkedIn li_at cookie not set");
        const session = new LinkedInSession({ liAt: s.linkedin_li_at, minDelayMs: 500, maxDelayMs: 1000, log: () => undefined });
        try {
          await session.open();
        } finally {
          await session.close();
        }
        return ok({ message: "LinkedIn session is valid" });
      }
      default:
        return fail("Unknown test");
    }
  } catch (e) {
    return fail((e as Error).message || "Test failed", 400);
  }
}
