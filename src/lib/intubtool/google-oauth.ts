import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSettings, putSetting, type ToolSettings } from "./settings";

/** Full mailbox scope is the only one Google accepts for SMTP/IMAP XOAUTH2. */
export const GMAIL_SCOPES = ["https://mail.google.com/", "openid", "email"];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export class GoogleOAuthError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

export function baseUrlFor(s: ToolSettings) {
  return (s.public_base_url || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export const redirectUri = (s: ToolSettings) => `${baseUrlFor(s)}/api/intubtool/gmail/callback`;

export function requireClient(s: ToolSettings) {
  if (!s.google_client_id || !s.google_client_secret) throw new GoogleOAuthError("Google OAuth Client ID + Secret not set — add them in Settings → Gmail.");
  return { clientId: s.google_client_id, clientSecret: s.google_client_secret };
}

export const STATE_COOKIE = "intub_gauth_state";

export const newState = () => crypto.randomBytes(24).toString("base64url");

export function authUrl(s: ToolSettings, state: string) {
  const { clientId } = requireClient(s);
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(s),
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (s.gmail_user) p.set("login_hint", s.gmail_user);
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error) throw new GoogleOAuthError(data.error_description || data.error || `Google token error ${res.status}`, data.error);
  return data;
}

export async function exchangeCode(s: ToolSettings, code: string) {
  const { clientId, clientSecret } = requireClient(s);
  const t = await tokenRequest({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(s), grant_type: "authorization_code" });
  if (!t.access_token) throw new GoogleOAuthError("Google did not return an access token");
  if (!t.refresh_token) throw new GoogleOAuthError("Google did not return a refresh token — remove the app at myaccount.google.com/permissions and connect again.");
  if (!(t.scope || "").includes("https://mail.google.com/")) throw new GoogleOAuthError("Mail permission was not granted — tick all checkboxes on the Google consent screen.");
  const email = await fetchEmail(t.access_token);
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in ?? 3600, email };
}

async function fetchEmail(accessToken: string) {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as { email?: string };
  if (!res.ok || !data.email) throw new GoogleOAuthError("Could not read the Google account email");
  return data.email.toLowerCase();
}

/* ─────────── access-token cache (per refresh token, process-local) ─────────── */

const cache = new Map<string, { token: string; exp: number }>();

export async function getAccessToken(s: ToolSettings): Promise<string> {
  if (!s.gmail_refresh_token) throw new GoogleOAuthError("Gmail is not connected with Google");
  const hit = cache.get(s.gmail_refresh_token);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const { clientId, clientSecret } = requireClient(s);
  let t: TokenResponse;
  try {
    t = await tokenRequest({ refresh_token: s.gmail_refresh_token, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" });
  } catch (e) {
    if (e instanceof GoogleOAuthError && e.code === "invalid_grant") {
      await markDisconnected(s._owner);
      throw new GoogleOAuthError("Google access expired or was revoked — open Settings → Gmail and click “Connect with Google” again.", e.code);
    }
    throw e;
  }
  if (!t.access_token) throw new GoogleOAuthError("Google returned no access token");
  cache.set(s.gmail_refresh_token, { token: t.access_token, exp: Date.now() + (t.expires_in ?? 3600) * 1000 });
  return t.access_token;
}

/** Store the Gmail connection for `owner` (null = global/admin). */
export async function saveConnection(owner: string | null, input: { refreshToken: string; email: string; by?: string }) {
  cache.delete(input.refreshToken);
  await prisma.$transaction([
    putSetting(owner, "gmail_refresh_token", input.refreshToken),
    putSetting(owner, "gmail_oauth_email", input.email),
    putSetting(owner, "gmail_user", input.email),
  ]);
  const h = await import("./account-health");
  await h.logEvent(owner, input.email, "reconnected", input.by ? `Connected by ${input.by}` : "Connected with Google");
}

/**
 * Clears the Google connection. When a token was actually present the event is logged and the admin is alerted
 * (email/WhatsApp) so a dead account is noticed before the next run.
 */
export async function markDisconnected(owner: string | null, reason = "Google access expired or was revoked (invalid_grant)", alert = true) {
  const s = await getSettings(owner);
  const email = s.gmail_oauth_email || s.gmail_user || "";
  const had = !!s.gmail_refresh_token;
  await prisma.$transaction([putSetting(owner, "gmail_refresh_token", ""), putSetting(owner, "gmail_oauth_email", "")]);
  if (!had) return;
  const h = await import("./account-health");
  await h.logEvent(owner, email, "disconnected", reason);
  if (!alert) return;
  const who = owner ? await prisma.user.findUnique({ where: { id: owner }, select: { email: true, name: true } }) : null;
  const backup = s.gmail_app_password ? "An App Password is saved for this account, so sending continues through it." : "No App Password backup — this account cannot send until it is reconnected.";
  await h.notifyAdmin(
    `[IntubTool] Gmail disconnected: ${email}`,
    [
      `Account: ${email}`,
      `User: ${who ? `${who.name || who.email} (${who.email})` : "Admin (global)"}`,
      `Why: ${reason}`,
      `When: ${new Date().toLocaleString()}`,
      ``,
      backup,
      ``,
      `Fix: IntubTool → Settings → Gmail → “Connect with Google” (or Multi-account Send → Accounts health → Send reconnect link / Connect).`,
    ].join("\n"),
    { exclude: owner }
  );
}

export async function disconnect(s: ToolSettings) {
  if (s.gmail_refresh_token) {
    cache.delete(s.gmail_refresh_token);
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: s.gmail_refresh_token }),
    }).catch(() => undefined);
  }
  await markDisconnected(s._owner, "Disconnected manually from Settings", false);
}
