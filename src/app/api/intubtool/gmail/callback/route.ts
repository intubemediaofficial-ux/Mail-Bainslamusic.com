import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, saveConnection, baseUrlFor, STATE_COOKIE } from "@/lib/intubtool/google-oauth";
import { getScope, scopeSettings } from "@/lib/intubtool/scope";
import { getSettings } from "@/lib/intubtool/settings";
import { ownerOf } from "@/lib/intubtool/account-health";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // the consent flow was started by a signed-in user; the connection is stored for that same user
  // (or, when an admin started it "for" another owner from Accounts health, for that owner)
  const scope = await getScope();
  const s = scope ? await scopeSettings(scope) : await getSettings();
  const q = req.nextUrl.searchParams;
  const state = q.get("state");
  const [stateUser, , target] = (state || "").split(".");
  const onBehalf = !!target;
  const back = new URL(scope ? (onBehalf ? "/intubtool/multi-send/accounts" : "/intubtool/settings") : "/intubtool/login", baseUrlFor(s));
  const done = (key: "gmail" | "gmail_error", value: string) => {
    back.searchParams.set(key, value);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/intubtool/gmail" });
    return res;
  };

  if (!scope) return done("gmail_error", "You were signed out — sign in and click Connect with Google again");
  if (q.get("error")) return done("gmail_error", q.get("error_description") || q.get("error") || "Google sign-in cancelled");
  const code = q.get("code");
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) return done("gmail_error", "Sign-in session expired — click Connect with Google again");
  if (stateUser !== scope.user.id) return done("gmail_error", "This Google sign-in was started by a different account — sign in as that user and try again");
  if (onBehalf && !scope.admin) return done("gmail_error", "Admin only");

  try {
    const t = await exchangeCode(s, code);
    await saveConnection(onBehalf ? ownerOf(target) : scope.owner, { refreshToken: t.refreshToken, email: t.email, by: onBehalf ? `admin ${scope.user.email}` : undefined });
    return done("gmail", t.email);
  } catch (e) {
    return done("gmail_error", (e as Error).message);
  }
}
