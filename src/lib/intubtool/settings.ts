import crypto from "crypto";
import { prisma } from "@/lib/db";

export const SECRET_KEYS = [
  "salesql_api_key",
  "salesql_web_token",
  "linkedin_li_at",
  "gmail_app_password",
  "google_client_secret",
  "gmail_refresh_token",
  "ai_api_key",
  "alert_whatsapp_apikey",
] as const;

export const SETTING_KEYS = [
  ...SECRET_KEYS,
  "gmail_user",
  "gmail_oauth_email",
  "google_client_id",
  "from_name",
  "bcc_email",
  "reply_to",
  "ai_base_url",
  "ai_model",
  "public_base_url",
  "linkedin_daily_page_limit",
  "linkedin_min_delay_ms",
  "linkedin_max_delay_ms",
  "default_daily_limit",
  "imap_poll_minutes",
  "unsubscribe_text",
  "signature",
  "alert_email",
  "alert_whatsapp_phone",
  "health_check_hour",
  "booking_title",
  "booking_intro",
  "booking_duration_min",
  "booking_days",
  "booking_start_hour",
  "booking_end_hour",
] as const;

/** keys every member has their own copy of (Gmail connection + sender identity); everything else is admin/global */
export const USER_KEYS = [
  "gmail_user",
  "gmail_app_password",
  "gmail_refresh_token",
  "gmail_oauth_email",
  "from_name",
  "bcc_email",
  "reply_to",
  "signature",
  "unsubscribe_text",
  "default_daily_limit",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type UserKey = (typeof USER_KEYS)[number];
/** `_owner`: user id whose Gmail/sender settings these are; null = global (admin) */
export type ToolSettings = Record<SettingKey, string> & { _owner: string | null };

export const isUserKey = (k: string): k is UserKey => (USER_KEYS as readonly string[]).includes(k);

const ENV_FALLBACK: Partial<Record<SettingKey, string | undefined>> = {
  salesql_api_key: process.env.SALESQL_API_KEY,
  salesql_web_token: process.env.SALESQL_WEB_TOKEN,
  linkedin_li_at: process.env.LINKEDIN_LI_AT,
  gmail_user: process.env.GMAIL_USER,
  gmail_app_password: process.env.GMAIL_APP_PASSWORD,
  google_client_id: process.env.GOOGLE_CLIENT_ID,
  google_client_secret: process.env.GOOGLE_CLIENT_SECRET,
  ai_api_key: process.env.AI_API_KEY,
  ai_base_url: process.env.AI_BASE_URL,
  ai_model: process.env.AI_MODEL,
  public_base_url: process.env.NEXTAUTH_URL,
};

const DEFAULTS: Partial<ToolSettings> = {
  ai_base_url: "https://api.openai.com/v1",
  ai_model: "gpt-4o-mini",
  linkedin_daily_page_limit: "120",
  linkedin_min_delay_ms: "3500",
  linkedin_max_delay_ms: "8000",
  default_daily_limit: "40",
  imap_poll_minutes: "10",
  health_check_hour: "8",
  booking_title: "Book a call with Bainsla Music",
  booking_intro: "Pick a time that suits you. We'll call you on WhatsApp/phone or share a Google Meet link.",
  booking_duration_min: "30",
  booking_days: "1,2,3,4,5,6",
  booking_start_hour: "11",
  booking_end_hour: "19",
  unsubscribe_text: "If you'd prefer not to hear from me again, just reply \"unsubscribe\" or click here: {{unsubscribe_url}}",
};

const isSecret = (k: string): k is (typeof SECRET_KEYS)[number] => (SECRET_KEYS as readonly string[]).includes(k);

function cipherKey() {
  const src = process.env.NEXTAUTH_SECRET || "kvspt-intubtool";
  return crypto.createHash("sha256").update(src).digest();
}

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `enc:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(value: string) {
  if (!value.startsWith("enc:")) return value;
  const [, iv, tag, data] = value.split(":");
  const d = crypto.createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/**
 * Effective settings. `owner` = null → global/admin settings.
 * `owner` = user id → global keys from ToolSetting, but every USER_KEY comes only from that user's
 * UserSetting rows (never the admin's Gmail / BCC / signature).
 */
export async function getSettings(owner: string | null = null): Promise<ToolSettings> {
  const [rows, userRows] = await Promise.all([
    prisma.toolSetting.findMany(),
    owner ? prisma.userSetting.findMany({ where: { userId: owner } }) : Promise.resolve([]),
  ]);
  const out = { _owner: owner } as ToolSettings;
  for (const k of SETTING_KEYS) out[k] = (owner && isUserKey(k) ? "" : ENV_FALLBACK[k]) || DEFAULTS[k] || "";
  for (const r of rows) {
    if (!(SETTING_KEYS as readonly string[]).includes(r.key)) continue;
    if (owner && isUserKey(r.key)) continue;
    const v = isSecret(r.key) ? decrypt(r.value) : r.value;
    if (v) out[r.key as SettingKey] = v;
  }
  for (const r of userRows) {
    if (!isUserKey(r.key)) continue;
    const v = isSecret(r.key) ? decrypt(r.value) : r.value;
    if (v) out[r.key] = v;
  }
  return out;
}

export async function getSetting(key: SettingKey, owner: string | null = null) {
  return (await getSettings(owner))[key];
}

/** Persist one key in the right store for the scope (encrypts secrets). Empty value deletes. */
export function putSetting(owner: string | null, key: SettingKey, value: string) {
  const stored = value && isSecret(key) ? encrypt(value) : value;
  if (owner) {
    if (!isUserKey(key)) throw new Error(`${key} is not a per-user setting`);
    if (!stored) return prisma.userSetting.deleteMany({ where: { userId: owner, key } });
    return prisma.userSetting.upsert({ where: { userId_key: { userId: owner, key } }, update: { value: stored }, create: { userId: owner, key, value: stored } });
  }
  if (!stored) return prisma.toolSetting.deleteMany({ where: { key } });
  return prisma.toolSetting.upsert({ where: { key }, update: { value: stored }, create: { key, value: stored } });
}

/** Gmail is usable when either Google OAuth is connected or an App Password is stored. */
export function gmailConfigured(s: ToolSettings) {
  return !!s.gmail_user && !!(s.gmail_refresh_token || s.gmail_app_password);
}

export function gmailAuthMode(s: ToolSettings): "oauth" | "password" | null {
  if (!s.gmail_user) return null;
  if (s.gmail_refresh_token) return "oauth";
  if (s.gmail_app_password) return "password";
  return null;
}

export const mask = (v: string) => (v ? (v.length <= 8 ? "••••••••" : `${v.slice(0, 4)}••••••••${v.slice(-4)}`) : "");

/**
 * Settings safe to send to the browser: secrets are replaced with a mask + "set" flag.
 * Members only receive their USER_KEYS (plus whether the shared Google OAuth client exists).
 */
export async function getPublicSettings(owner: string | null = null) {
  const s = await getSettings(owner);
  const values: Record<string, string> = {};
  const secrets: Record<string, { set: boolean; masked: string }> = {};
  for (const k of SETTING_KEYS) {
    if (owner && !isUserKey(k)) continue;
    if (isSecret(k)) secrets[k] = { set: !!s[k], masked: mask(s[k]) };
    else values[k] = s[k];
  }
  return { values, secrets, scope: owner ? "user" : "global", googleClientReady: !!(s.google_client_id && s.google_client_secret) };
}

/** Save settings for a scope; members can only write USER_KEYS (others silently ignored). */
export async function saveSettings(input: Record<string, unknown>, owner: string | null = null) {
  const ops = [];
  for (const [k, raw] of Object.entries(input)) {
    if (!(SETTING_KEYS as readonly string[]).includes(k) || typeof raw !== "string") continue;
    const key = k as SettingKey;
    if (owner && !isUserKey(key)) continue;
    const value = raw.trim();
    if (isSecret(key)) {
      if (value === "") continue; // empty secret input = leave unchanged
      ops.push(putSetting(owner, key, value === "__clear__" ? "" : value));
    } else {
      ops.push(putSetting(owner, key, value));
    }
  }
  if (ops.length) await prisma.$transaction(ops);
  return ops.length;
}
