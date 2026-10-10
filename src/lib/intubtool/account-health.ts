import { prisma } from "@/lib/db";
import { getSettings, gmailAuthMode, gmailConfigured, type ToolSettings } from "./settings";
import { getAccessToken } from "./google-oauth";
import { newMessageId, sendMail, verifySmtp } from "./mailer";

/** ownerKey used in AccountEvent / BlastAccount for the admin (global) Gmail. */
export const GLOBAL_KEY = "global";
const SYSTEM_KEY = "system";

export const ownerKeyOf = (owner: string | null) => owner ?? GLOBAL_KEY;
export const ownerOf = (key: string) => (key === GLOBAL_KEY ? null : key);

export type EventType = "disconnected" | "reconnected" | "blocked" | "health_ok" | "health_fail" | "oauth_fallback" | "reconnect_link" | "alert";

export async function logEvent(owner: string | null, email: string, type: EventType, detail?: string) {
  await prisma.accountEvent.create({ data: { ownerKey: ownerKeyOf(owner), email: email || "—", type, detail: detail?.slice(0, 500) || null } }).catch(() => undefined);
}

/* ───────────────────────── raw per-owner state (outside SETTING_KEYS, like imap_last_uid) ───────────────────────── */

const H_STATUS = "gmail_health_status";
const H_AT = "gmail_health_at";
const H_ERROR = "gmail_health_error";
const H_LAST_DATE = "health_last_date";

async function putRaw(owner: string | null, key: string, value: string) {
  if (owner) await prisma.userSetting.upsert({ where: { userId_key: { userId: owner, key } }, update: { value }, create: { userId: owner, key, value } });
  else await prisma.toolSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

async function getRaw(owner: string | null, keys: string[]): Promise<Record<string, string>> {
  const rows = owner
    ? await prisma.userSetting.findMany({ where: { userId: owner, key: { in: keys } }, select: { key: true, value: true } })
    : await prisma.toolSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export type Health = { status: "ok" | "fail" | "none" | "unknown"; at: string | null; error: string | null };

export async function readHealth(owner: string | null): Promise<Health> {
  const r = await getRaw(owner, [H_STATUS, H_AT, H_ERROR]);
  const status = r[H_STATUS];
  return { status: status === "ok" || status === "fail" || status === "none" ? status : "unknown", at: r[H_AT] || null, error: r[H_ERROR] || null };
}

async function writeHealth(owner: string | null, h: Omit<Health, "at">) {
  await Promise.all([putRaw(owner, H_STATUS, h.status), putRaw(owner, H_AT, new Date().toISOString()), putRaw(owner, H_ERROR, h.error || "")]);
}

/* ───────────────────────── owners ───────────────────────── */

export type OwnerInfo = { owner: string | null; ownerKey: string; userEmail: string; name: string | null };

/** Admin (global Gmail) first, then every approved member. */
export async function allOwners(): Promise<OwnerInfo[]> {
  const users = await prisma.user.findMany({ where: { status: "approved" }, select: { id: true, email: true, name: true, role: true }, orderBy: { createdAt: "asc" } });
  const admin = users.find((u) => u.role === "admin");
  return [
    { owner: null, ownerKey: GLOBAL_KEY, userEmail: admin?.email || "", name: "Admin" },
    ...users.filter((u) => u.role !== "admin").map((u) => ({ owner: u.id, ownerKey: u.id, userEmail: u.email, name: u.name })),
  ];
}

export async function adminEmails() {
  const admins = await prisma.user.findMany({ where: { role: "admin", status: "approved" }, select: { email: true } });
  return admins.map((a) => a.email);
}

/** First Gmail account (admin first, then members) that can send — used for alerts / reconnect links. */
export async function pickSender(exclude: string | null | undefined = undefined): Promise<ToolSettings | null> {
  for (const o of await allOwners()) {
    if (exclude !== undefined && o.owner === exclude) continue;
    const s = await getSettings(o.owner);
    if (gmailConfigured(s)) return s;
  }
  return null;
}

/* ───────────────────────── admin alerts (email + WhatsApp via CallMeBot) ───────────────────────── */

type Alert = { subject: string; text: string; exclude?: string | null };
const queue: Alert[] = [];
let draining = false;

/**
 * Tell the admin something happened (account disconnected / blocked / health failures).
 * Email goes to `alert_email` (fallback: every admin user) from the first working Gmail; WhatsApp through CallMeBot when configured.
 * Queued so an alert raised while another alert is being sent (e.g. the sending account itself fails) is not lost.
 */
export async function notifyAdmin(subject: string, text: string, opts: { exclude?: string | null } = {}) {
  queue.push({ subject, text, exclude: opts.exclude });
  if (draining) return;
  draining = true;
  try {
    while (queue.length) await deliver(queue.shift()!);
  } finally {
    draining = false;
  }
}

async function deliver(a: Alert) {
  const g = await getSettings(null);
  const to = (g.alert_email || (await adminEmails()).join(", ")).trim();
  let email = false;
  let whatsapp = false;
  let err = "";
  if (to) {
    for (const o of await allOwners()) {
      if (a.exclude !== undefined && o.owner === a.exclude) continue;
      const s = await getSettings(o.owner);
      if (!gmailConfigured(s)) continue;
      try {
        await sendMail({ to, subject: a.subject, text: a.text, messageId: newMessageId("bainslamusic.com"), fromName: "IntubTool alerts" }, s);
        email = true;
        break;
      } catch (e) {
        err = (e as Error).message;
      }
    }
  }
  if (g.alert_whatsapp_phone && g.alert_whatsapp_apikey) {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(g.alert_whatsapp_phone.replace(/[^\d+]/g, ""))}&text=${encodeURIComponent(`${a.subject}\n${a.text}`.slice(0, 1500))}&apikey=${encodeURIComponent(g.alert_whatsapp_apikey)}`;
    whatsapp = await fetch(url, { cache: "no-store" }).then((r) => r.ok).catch(() => false);
  }
  await prisma.accountEvent
    .create({ data: { ownerKey: SYSTEM_KEY, email: to || "—", type: "alert", detail: `${a.subject} · email ${email ? "sent" : to ? `failed${err ? `: ${err.slice(0, 120)}` : ""}` : "no recipient"} · WhatsApp ${whatsapp ? "sent" : g.alert_whatsapp_phone ? "failed" : "off"}`.slice(0, 500) } })
    .catch(() => undefined);
  return { email, whatsapp };
}

/** Sends a test alert and reports what worked (used by the Settings "Send test alert" button). */
export async function testAlert() {
  return deliver({ subject: "[IntubTool] Test alert", text: `This is a test from IntubTool account alerts (${new Date().toLocaleString()}). If you got this, disconnect/block alerts will reach you here.` });
}

/* ───────────────────────── health check ───────────────────────── */

export type CheckResult = OwnerInfo & Health & { email: string };

/**
 * Verifies one account can actually sign in: refreshes the Google token (OAuth) and opens an SMTP session.
 * An expired/revoked Google token is cleared + alerted by getAccessToken itself.
 */
export async function checkAccount(owner: string | null): Promise<Health & { email: string }> {
  const s = await getSettings(owner);
  const email = s.gmail_oauth_email || s.gmail_user || "";
  if (!gmailConfigured(s)) {
    await writeHealth(owner, { status: "none", error: null });
    return { status: "none", at: new Date().toISOString(), error: null, email };
  }
  try {
    if (gmailAuthMode(s) === "oauth") await getAccessToken(s);
    await verifySmtp(s);
    await writeHealth(owner, { status: "ok", error: null });
    await logEvent(owner, email, "health_ok");
    return { status: "ok", at: new Date().toISOString(), error: null, email };
  } catch (e) {
    const msg = (e as Error).message || "check failed";
    await writeHealth(owner, { status: "fail", error: msg });
    await logEvent(owner, email, "health_fail", msg);
    return { status: "fail", at: new Date().toISOString(), error: msg, email };
  }
}

/** Checks every connected account; with `alert` the admin gets one summary of the failures. */
export async function runHealthCheck(opts: { alert?: boolean } = {}): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const o of await allOwners()) {
    const s = await getSettings(o.owner);
    if (!gmailConfigured(s)) continue;
    out.push({ ...o, ...(await checkAccount(o.owner)) });
  }
  const failed = out.filter((r) => r.status === "fail");
  if (opts.alert && failed.length) {
    await notifyAdmin(
      `[IntubTool] ${failed.length} Gmail account${failed.length > 1 ? "s" : ""} need attention`,
      [`Daily health check (${new Date().toLocaleString()}) — these accounts could not sign in:`, "", ...failed.map((f) => `• ${f.email} (${f.name || f.userEmail}): ${f.error}`), "", "Fix: open IntubTool → Multi-account Send → Accounts health, or ask the member to reconnect in Settings → Gmail."].join("\n")
    );
  }
  return out;
}

/** Scheduler hook: runs once a day at `health_check_hour`. */
export async function healthStep() {
  const g = await getSettings(null);
  const hour = Math.min(23, Math.max(0, Number(g.health_check_hour) || 8));
  const now = new Date();
  if (now.getHours() < hour) return;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const last = (await getRaw(null, [H_LAST_DATE]))[H_LAST_DATE];
  if (last === today) return;
  await putRaw(null, H_LAST_DATE, today);
  await runHealthCheck({ alert: true });
}

/* ───────────────────────── overview (Accounts health page) ───────────────────────── */

export type AccountOverview = OwnerInfo & {
  gmailEmail: string;
  authMode: "oauth" | "password" | "both" | "none";
  connected: boolean;
  health: Health;
  sentToday: number;
  sent30: number;
  bounced30: number;
  failed30: number;
  bouncePct: number;
  blockedUntil: string | null;
  blocks30: number;
  lastError: { at: string; message: string } | null;
  events: { type: string; detail: string | null; createdAt: string }[];
};

export async function accountsOverview(): Promise<AccountOverview[]> {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86400000);
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const owners = await allOwners();
  return Promise.all(
    owners.map(async (o) => {
      const s = await getSettings(o.owner);
      const gmailEmail = s.gmail_oauth_email || s.gmail_user || "";
      const authMode: AccountOverview["authMode"] = s.gmail_refresh_token && s.gmail_app_password ? "both" : s.gmail_refresh_token ? "oauth" : s.gmail_app_password && s.gmail_user ? "password" : "none";
      const campaign = { is: { ownerId: o.owner } };
      const [health, bToday, cToday, b30, c30, bBounced, cBounced, bFailed, cFailed, blocks30, accounts, lastFail, events] = await Promise.all([
        readHealth(o.owner),
        prisma.blastMessage.count({ where: { ownerKey: o.ownerKey, status: "sent", sentAt: { gte: today } } }),
        prisma.emailMessage.count({ where: { campaign, status: "sent", sentAt: { gte: today } } }),
        prisma.blastMessage.count({ where: { ownerKey: o.ownerKey, status: { in: ["sent", "bounced"] }, sentAt: { gte: since30 } } }),
        prisma.emailMessage.count({ where: { campaign, status: { in: ["sent", "bounced"] }, sentAt: { gte: since30 } } }),
        prisma.blastMessage.count({ where: { ownerKey: o.ownerKey, status: "bounced", sentAt: { gte: since30 } } }),
        prisma.emailMessage.count({ where: { campaign, status: "bounced", sentAt: { gte: since30 } } }),
        prisma.blastMessage.count({ where: { ownerKey: o.ownerKey, status: "failed", sentAt: { gte: since30 } } }),
        prisma.emailMessage.count({ where: { campaign, status: "failed", sentAt: { gte: since30 } } }),
        prisma.accountEvent.count({ where: { ownerKey: o.ownerKey, type: "blocked", createdAt: { gte: since30 } } }),
        prisma.blastAccount.findMany({ where: { ownerKey: o.ownerKey }, select: { blockedUntil: true } }),
        prisma.blastMessage.findFirst({ where: { ownerKey: o.ownerKey, status: "failed" }, orderBy: { sentAt: "desc" }, select: { sentAt: true, error: true } }),
        prisma.accountEvent.findMany({ where: { ownerKey: o.ownerKey }, orderBy: { createdAt: "desc" }, take: 8, select: { type: true, detail: true, createdAt: true } }),
      ]);
      const cFail = await prisma.emailMessage.findFirst({ where: { campaign, status: "failed" }, orderBy: { sentAt: "desc" }, select: { sentAt: true, error: true } });
      const fails = [lastFail, cFail].filter((x): x is { sentAt: Date; error: string | null } => !!x).sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
      const blocked = accounts.map((a) => a.blockedUntil).filter((d): d is Date => !!d && d > now).sort((a, b) => b.getTime() - a.getTime())[0] || null;
      const sent30 = b30 + c30;
      const bounced30 = bBounced + cBounced;
      return {
        ...o,
        gmailEmail,
        authMode,
        connected: gmailConfigured(s),
        health,
        sentToday: bToday + cToday,
        sent30,
        bounced30,
        failed30: bFailed + cFailed,
        bouncePct: sent30 ? Math.round((bounced30 / sent30) * 100) : 0,
        blockedUntil: blocked ? blocked.toISOString() : null,
        blocks30,
        lastError: fails[0] ? { at: fails[0].sentAt.toISOString(), message: fails[0].error || "send failed" } : null,
        events: events.map((e) => ({ type: e.type, detail: e.detail, createdAt: e.createdAt.toISOString() })),
      };
    })
  );
}

/** Recent system-wide alert log (for the Accounts health page). */
export async function recentAlerts(take = 20) {
  const rows = await prisma.accountEvent.findMany({ where: { type: { in: ["alert", "disconnected", "blocked", "reconnected", "reconnect_link", "oauth_fallback"] } }, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
