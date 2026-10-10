import { NextResponse } from "next/server";
import { authUrl, newState, redirectUri, GoogleOAuthError, STATE_COOKIE } from "@/lib/intubtool/google-oauth";
import { getScope, scopeSettings } from "@/lib/intubtool/scope";
import { getSettings } from "@/lib/intubtool/settings";
import { GLOBAL_KEY, ownerOf } from "@/lib/intubtool/account-health";
import { prisma } from "@/lib/db";
import { ok, fail, readJson } from "@/app/api/admin/_lib";

export const dynamic = "force-dynamic";

/** GET → info for the Settings page (redirect URI to paste into Google Cloud Console). */
export async function GET() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const s = await scopeSettings(scope);
  return ok({ redirectUri: redirectUri(s), connected: !!s.gmail_refresh_token, email: s.gmail_oauth_email || null, clientConfigured: !!(s.google_client_id && s.google_client_secret) });
}

/**
 * POST → start the consent flow; the browser follows the returned URL.
 * Admin may pass `{ forOwner: "<user id>" | "global" }` to connect a Gmail on behalf of a member (or the global account)
 * from the Accounts health page — the token is then stored for that owner.
 */
export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const body = await readJson<{ forOwner?: string }>(req).catch(() => null);
  let target: string | undefined;
  let s = await scopeSettings(scope);
  if (body?.forOwner) {
    if (!scope.admin) return fail("Admin only", 403);
    const owner = ownerOf(body.forOwner);
    if (owner && !(await prisma.user.findFirst({ where: { id: owner, status: "approved" }, select: { id: true } }))) return fail("User not found");
    target = owner ?? GLOBAL_KEY;
    s = await getSettings(owner);
  }
  try {
    // state = initiating user id . nonce [. target owner key] — the callback refuses a token exchange under a different session
    const state = `${scope.user.id}.${newState()}${target ? `.${target}` : ""}`;
    const res = NextResponse.json({ ok: true, data: { url: authUrl(s, state) } });
    res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: redirectUri(s).startsWith("https://"), path: "/api/intubtool/gmail", maxAge: 600 });
    return res;
  } catch (e) {
    return fail(e instanceof GoogleOAuthError ? e.message : "Could not start Google sign-in");
  }
}
