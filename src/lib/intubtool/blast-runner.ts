import { prisma } from "@/lib/db";
import type { Blast, BlastAccount, BlastLead } from "@prisma/client";
import { getSettings, gmailConfigured, type ToolSettings } from "./settings";
import { renderTemplate, textToHtml, type TemplateVars } from "./template";
import { bookingLink } from "./booking";
import { MailConfigError, baseUrl, newMessageId, sendMail } from "./mailer";
import { isProviderRateLimit } from "./campaign-runner";
import { verifyMany } from "./email-verify";

export type BlastTemplate = { subject: string; body: string };

export function parseTemplates(json: string): BlastTemplate[] {
  try {
    const a = JSON.parse(json) as unknown;
    return Array.isArray(a) ? a.filter((t): t is BlastTemplate => !!t && typeof t === "object" && typeof (t as BlastTemplate).subject === "string" && typeof (t as BlastTemplate).body === "string") : [];
  } catch {
    return [];
  }
}

const BLOCK_MS = 24 * 60 * 60 * 1000;
export const GLOBAL_KEY = "global";

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export function inBlastWindow(b: Blast, now = new Date()) {
  const h = now.getHours();
  if (b.sendWindowStart === b.sendWindowEnd) return true;
  if (b.sendWindowStart < b.sendWindowEnd) return h >= b.sendWindowStart && h < b.sendWindowEnd;
  return h >= b.sendWindowStart || h < b.sendWindowEnd;
}

/* ───────────────────────── sender accounts ───────────────────────── */

export type SenderCandidate = { ownerKey: string; ownerId: string | null; email: string; label: string };

/** Every Gmail account connected anywhere in the tool: the admin/global one + each approved member's. */
export async function senderCandidates(): Promise<SenderCandidate[]> {
  const out: SenderCandidate[] = [];
  const g = await getSettings(null);
  if (gmailConfigured(g)) out.push({ ownerKey: GLOBAL_KEY, ownerId: null, email: g.gmail_oauth_email || g.gmail_user, label: g.from_name || "Admin" });
  const users = await prisma.user.findMany({ where: { status: "approved" }, select: { id: true, email: true, name: true }, orderBy: { createdAt: "asc" } });
  for (const u of users) {
    const s = await getSettings(u.id);
    if (!gmailConfigured(s)) continue;
    out.push({ ownerKey: u.id, ownerId: u.id, email: s.gmail_oauth_email || s.gmail_user, label: s.from_name || u.name || u.email });
  }
  return out;
}

export type AccountRow = BlastAccount & { connected: boolean };

/** Adds newly connected Gmail accounts to the blast (numbered after the existing ones) and returns all of them in order. */
export async function syncBlastAccounts(blastId: string): Promise<AccountRow[]> {
  const [cands, existing] = await Promise.all([senderCandidates(), prisma.blastAccount.findMany({ where: { blastId }, orderBy: { order: "asc" } })]);
  const have = new Map(existing.map((a) => [a.ownerKey, a]));
  let order = existing.reduce((m, a) => Math.max(m, a.order), 0);
  for (const c of cands) {
    const a = have.get(c.ownerKey);
    if (a) {
      if (a.email !== c.email || a.label !== c.label) await prisma.blastAccount.update({ where: { id: a.id }, data: { email: c.email, label: c.label } });
    } else await prisma.blastAccount.create({ data: { blastId, ownerKey: c.ownerKey, ownerId: c.ownerId, email: c.email, label: c.label, order: ++order } });
  }
  const connected = new Set(cands.map((c) => c.ownerKey));
  const all = await prisma.blastAccount.findMany({ where: { blastId }, orderBy: { order: "asc" } });
  return all.map((a) => ({ ...a, connected: connected.has(a.ownerKey) }));
}

/** Warm-up: quota ramps from warmupStart by warmupStep every warmupEveryDays, capped at quota. */
export function effectiveQuota(a: BlastAccount, now = new Date()) {
  if (!a.warmup) return a.quota;
  const started = a.warmupStartedAt ?? now;
  const days = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 86400000));
  const steps = Math.floor(days / Math.max(1, a.warmupEveryDays));
  return Math.max(0, Math.min(a.quota, a.warmupStart + steps * a.warmupStep));
}

/* ───────────────────────── suppression / dedupe ───────────────────────── */

const chunk = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/**
 * Addresses that replied, bounced or unsubscribed anywhere (any blast, any campaign) → never mailed again from any account.
 * Returns email → reason.
 */
export async function suppressedSet(emails: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = Array.from(new Set(emails.map((e) => e.toLowerCase())));
  for (const part of chunk(list, 400)) {
    const [bl, bm, em, leads] = await Promise.all([
      prisma.blastLead.findMany({ where: { email: { in: part }, status: { in: ["replied", "bounced", "unsubscribed"] } }, select: { email: true, status: true } }),
      prisma.blastMessage.findMany({ where: { toEmail: { in: part }, OR: [{ status: "bounced" }, { repliedAt: { not: null } }] }, select: { toEmail: true, status: true } }),
      prisma.emailMessage.findMany({ where: { toEmail: { in: part }, OR: [{ status: "bounced" }, { repliedAt: { not: null } }] }, select: { toEmail: true, status: true } }),
      prisma.lead.findMany({ where: { email: { in: part }, unsubscribed: true }, select: { email: true } }),
    ]);
    for (const m of em) out.set(m.toEmail.toLowerCase(), m.status === "bounced" ? "bounced earlier (campaign)" : "replied earlier (campaign)");
    for (const m of bm) out.set(m.toEmail.toLowerCase(), m.status === "bounced" ? "bounced earlier" : "replied earlier");
    for (const l of bl) out.set(l.email, `${l.status} earlier`);
    for (const l of leads) if (l.email) out.set(l.email.toLowerCase(), "unsubscribed");
  }
  return out;
}

/** Addresses already mailed before (any blast except `exceptBlastId`, or any campaign) → email → where. */
export async function alreadyContactedSet(emails: string[], exceptBlastId?: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = Array.from(new Set(emails.map((e) => e.toLowerCase())));
  for (const part of chunk(list, 400)) {
    const [bl, em] = await Promise.all([
      prisma.blastLead.findMany({ where: { email: { in: part }, ...(exceptBlastId ? { blastId: { not: exceptBlastId } } : {}) }, select: { email: true, blast: { select: { name: true } } } }),
      prisma.emailMessage.findMany({ where: { toEmail: { in: part }, status: { not: "failed" } }, select: { toEmail: true, campaign: { select: { name: true } } } }),
    ]);
    for (const m of em) out.set(m.toEmail.toLowerCase(), `campaign “${m.campaign?.name || "test"}”`);
    for (const l of bl) out.set(l.email, `list “${l.blast.name}”`);
  }
  return out;
}

/* ───────────────────────── verification ───────────────────────── */

export async function verifyPending(blastId: string, limit = 2000) {
  const leads = await prisma.blastLead.findMany({ where: { blastId, verifyStatus: "none", status: { in: ["pending", "hold", "queued"] } }, select: { id: true, email: true }, take: limit });
  if (!leads.length) return { checked: 0, invalid: 0, risky: 0 };
  const res = await verifyMany(leads);
  let invalid = 0;
  let risky = 0;
  for (const l of leads) {
    const r = res.get(l)!;
    if (r.status === "invalid") invalid++;
    if (r.status === "risky") risky++;
    await prisma.blastLead.update({
      where: { id: l.id },
      data: { verifyStatus: r.status, ...(r.status === "invalid" ? { status: "invalid", statusNote: r.note, accountId: null } : {}) },
    });
  }
  return { checked: leads.length, invalid, risky };
}

/* ───────────────────────── Start = allocate ranges ───────────────────────── */

export type StartResult = { allocated: number; queued: number; pending: number; status: string; ranges: { order: number; email: string; from: number; to: number; count: number }[] };

/**
 * Hands the next unsent serial ranges to the enabled accounts in order:
 * #1 gets the next `quota` pending leads, #2 the following ones, … Progress persists in BlastLead.accountId/status,
 * so the next Start continues from the first still-pending serial.
 */
export async function startBlast(blastId: string, opts: { auto?: boolean } = {}): Promise<StartResult> {
  const blast = await prisma.blast.findUnique({ where: { id: blastId } });
  if (!blast) throw new Error("Not found");
  const templates = parseTemplates(blast.templates);
  if (!templates.length || !templates[0].subject.trim() || !templates[0].body.trim()) throw new Error("Add at least one email template (subject + body) in Content first");
  const now = new Date();
  const accounts = (await syncBlastAccounts(blastId)).filter((a) => a.enabled && a.connected && (!a.blockedUntil || a.blockedUntil <= now));
  if (!accounts.length) throw new Error("No enabled, connected (and not blocked) sender account available");

  if (blast.verifyBeforeSend) await verifyPending(blastId);

  const ranges: StartResult["ranges"] = [];
  let allocated = 0;
  let exhausted = false;
  for (const a of accounts) {
    if (exhausted) break;
    const quota = effectiveQuota(a, now);
    const queuedAlready = await prisma.blastLead.count({ where: { blastId, accountId: a.id, status: "queued" } });
    const want = quota - queuedAlready;
    if (want <= 0) continue;

    const picked: BlastLead[] = [];
    let after = 0;
    while (picked.length < want) {
      const batch = await prisma.blastLead.findMany({
        where: { blastId, status: "pending", verifyStatus: { not: "invalid" }, serial: { gt: after } },
        orderBy: { serial: "asc" },
        take: Math.max(20, want * 2),
      });
      if (!batch.length) {
        exhausted = true;
        break;
      }
      after = batch[batch.length - 1].serial;
      const sup = await suppressedSet(batch.map((b) => b.email));
      for (const l of batch) {
        const why = sup.get(l.email);
        if (why) {
          await prisma.blastLead.update({ where: { id: l.id }, data: { status: "skipped", statusNote: `Suppressed: ${why}` } });
          continue;
        }
        picked.push(l);
        if (picked.length >= want) break;
      }
    }
    if (!picked.length) continue;
    await prisma.blastLead.updateMany({ where: { id: { in: picked.map((p) => p.id) } }, data: { status: "queued", accountId: a.id } });
    await prisma.blastAccount.update({
      where: { id: a.id },
      data: { rangeStart: picked[0].serial, rangeEnd: picked[picked.length - 1].serial, lastError: null, ...(a.warmup && !a.warmupStartedAt ? { warmupStartedAt: now } : {}) },
    });
    ranges.push({ order: a.order, email: a.email, from: picked[0].serial, to: picked[picked.length - 1].serial, count: picked.length });
    allocated += picked.length;
  }

  const [queued, pending] = await Promise.all([
    prisma.blastLead.count({ where: { blastId, status: "queued" } }),
    prisma.blastLead.count({ where: { blastId, status: "pending" } }),
  ]);
  const status = queued ? "running" : pending ? "idle" : "completed";
  await prisma.blast.update({ where: { id: blastId }, data: { status, lastRunAt: now, ...(opts.auto ? { lastAutoRunDate: todayKey(now) } : {}) } });
  return { allocated, queued, pending, status, ranges };
}

/* ───────────────────────── building + sending one mail ───────────────────────── */

const slugKey = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export function blastVars(lead: BlastLead, extra: TemplateVars = {}): TemplateVars {
  const first = lead.firstName || lead.fullName.split(/\s+/)[0] || "";
  const vars: TemplateVars = {};
  if (lead.extra) {
    try {
      const o = JSON.parse(lead.extra) as Record<string, string>;
      for (const [k, v] of Object.entries(o)) if (typeof v === "string") vars[slugKey(k)] = v;
    } catch {
      /* ignore */
    }
  }
  return { ...vars, first_name: first, name: first, full_name: lead.fullName, company: lead.company || "", title: lead.title || "", email: lead.email, phone: lead.phone || "", ...extra };
}

function rewriteLinks(html: string, trackBase: string, skip: string) {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (m, url: string) => (url === skip || url.includes("/api/intubtool/") ? m : `href="${trackBase}?u=${encodeURIComponent(url)}"`));
}

const randGap = (b: Blast) => {
  const lo = Math.max(5, b.gapMinSeconds);
  const hi = Math.max(lo, b.gapMaxSeconds);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
};

export type Rendered = { subject: string; text: string; html: string; inReplyTo: string | null; unsub: string };

export async function renderBlastMail(b: Blast, a: BlastAccount, lead: BlastLead, s: ToolSettings, kind: "initial" | "followup", variant: number, messageDbId?: string): Promise<Rendered> {
  const templates = parseTemplates(b.templates);
  const tpl: BlastTemplate = kind === "initial" ? templates[variant] || templates[0] || { subject: "", body: "" } : { subject: b.followUpSubject, body: b.followUpBody };
  const first = kind === "followup" ? await prisma.blastMessage.findFirst({ where: { leadId: lead.id, kind: "initial", status: { not: "failed" } }, orderBy: { sentAt: "asc" } }) : null;
  const base = baseUrl(s);
  const unsub = `${base}/api/intubtool/bu/${lead.unsubToken}`;
  const vars = blastVars(lead, { sender_name: s.from_name || a.label || "", sender_email: a.email, signature: s.signature || "", unsubscribe_url: unsub, booking_link: bookingLink(s, lead.email, lead.fullName) });
  let subject = renderTemplate(tpl.subject, vars).trim();
  let body = renderTemplate(tpl.body, vars).trim();
  if (kind === "followup" && first && !subject) subject = first.subject.startsWith("Re:") ? first.subject : `Re: ${first.subject}`;
  if (!/unsubscribe|opt[- ]?out/i.test(body) && s.unsubscribe_text) body += `\n\n${renderTemplate(s.unsubscribe_text, vars)}`;
  body = body.replace(/\{\{\s*unsubscribe_url\s*\}\}/g, unsub);
  let html = textToHtml(body);
  if (messageDbId) {
    if (b.trackClicks) html = rewriteLinks(html, `${base}/api/intubtool/bc/${messageDbId}`, unsub);
    if (b.trackOpens) html += `<img src="${base}/api/intubtool/bt/${messageDbId}.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
  }
  return { subject, text: body, html, inReplyTo: first?.messageId ?? null, unsub };
}

export const variantFor = (b: Blast, a: BlastAccount) => {
  const n = parseTemplates(b.templates).length;
  return n ? (Math.max(1, a.order) - 1) % n : 0;
};

async function sendOne(b: Blast, a: BlastAccount, lead: BlastLead, kind: "initial" | "followup") {
  const now = new Date();
  const s = await getSettings(a.ownerId);
  const variant = kind === "initial" ? variantFor(b, a) : 0;
  const messageId = newMessageId((a.email.split("@")[1] || "bainslamusic.com").toLowerCase());
  const rec = await prisma.blastMessage.create({
    data: { blastId: b.id, leadId: lead.id, accountId: a.id, ownerKey: a.ownerKey, fromEmail: a.email, kind, variant, messageId, toEmail: lead.email, subject: "", bodyText: "", status: "sent" },
  });
  try {
    const mail = await renderBlastMail(b, a, lead, s, kind, variant, rec.id);
    if (!mail.subject || !mail.text) throw new Error(kind === "followup" ? "Follow-up body is empty" : "Template is empty");
    await sendMail(
      { to: lead.email, subject: mail.subject, html: mail.html, text: mail.text, messageId, fromName: s.from_name || a.label, replyTo: s.reply_to, bcc: s.bcc_email, inReplyTo: mail.inReplyTo, listUnsubscribe: mail.unsub },
      s
    );
    await prisma.blastMessage.update({ where: { id: rec.id }, data: { subject: mail.subject, bodyText: mail.text, sentAt: new Date() } });
    await prisma.blastAccount.update({ where: { id: a.id }, data: { nextAllowedAt: new Date(Date.now() + randGap(b) * 1000), lastError: null } });
    if (kind === "initial")
      await prisma.blastLead.update({
        where: { id: lead.id },
        data: { status: "sent", sentAt: now, statusNote: null, followUpAt: b.followUpEnabled ? new Date(now.getTime() + Math.max(1, b.followUpDays) * 86400000) : null },
      });
    else await prisma.blastLead.update({ where: { id: lead.id }, data: { followUpSentAt: now } });
    return "sent" as const;
  } catch (e) {
    const msg = (e as Error).message || "send failed";
    await prisma.blastMessage.update({ where: { id: rec.id }, data: { status: "failed", error: msg.slice(0, 500) } });
    const accountProblem = e instanceof MailConfigError || /invalid login|EAUTH|535|Username and Password not accepted|invalid_grant/i.test(msg) || isProviderRateLimit(msg);
    if (accountProblem) {
      // this Gmail account is blocked/over quota: pause it for 24h and hand its queued leads back to the pool; other accounts keep going
      await prisma.blastAccount.update({ where: { id: a.id }, data: { blockedUntil: new Date(now.getTime() + BLOCK_MS), lastError: msg.slice(0, 300), nextAllowedAt: null } });
      await prisma.blastLead.updateMany({ where: { blastId: b.id, accountId: a.id, status: "queued" }, data: { status: "pending", accountId: null } });
      const h = await import("./account-health");
      await h.logEvent(a.ownerId, a.email, "blocked", `${b.name}: ${msg.slice(0, 300)}`);
      await h.notifyAdmin(
        `[Bainsla Mail Tool] Account #${a.order} ${a.email} blocked for 24h`,
        [`List: ${b.name}`, `Account: #${a.order} ${a.email}`, `Gmail said: ${msg.slice(0, 400)}`, `When: ${now.toLocaleString()}`, ``, `Its queued leads went back to the pool; other accounts keep sending. Unblock earlier from Multi-account Send → Accounts.`].join("\n"),
        { exclude: a.ownerId }
      );
      return "blocked" as const;
    }
    await prisma.blastAccount.update({ where: { id: a.id }, data: { nextAllowedAt: new Date(Date.now() + Math.max(30, b.gapMinSeconds) * 1000), lastError: msg.slice(0, 300) } });
    if (kind === "initial") await prisma.blastLead.update({ where: { id: lead.id }, data: { status: "failed", statusNote: msg.slice(0, 300) } });
    else await prisma.blastLead.update({ where: { id: lead.id }, data: { followUpSentAt: now, statusNote: `Follow-up failed: ${msg.slice(0, 250)}` } });
    return "failed" as const;
  }
}

/* ───────────────────────── scheduler step ───────────────────────── */

async function autoRun(b: Blast, now: Date) {
  if (b.autoRunHour == null || now.getHours() < b.autoRunHour) return;
  const today = todayKey(now);
  if (b.lastAutoRunDate === today) return;
  await prisma.blast.update({ where: { id: b.id }, data: { lastAutoRunDate: today } });
  if (b.status === "idle" || b.status === "completed") await startBlast(b.id, { auto: true }).catch(() => undefined);
}

async function dailySummary(b: Blast, now: Date) {
  if (!b.summaryEmail || now.getHours() < b.summaryHour) return;
  const today = todayKey(now);
  if (b.lastSummaryDate === today) return;
  await prisma.blast.update({ where: { id: b.id }, data: { lastSummaryDate: today } });
  const since = startOfDay();
  const [accounts, msgs, replies, bounces, pending, queued, total] = await Promise.all([
    prisma.blastAccount.findMany({ where: { blastId: b.id }, orderBy: { order: "asc" } }),
    prisma.blastMessage.findMany({ where: { blastId: b.id, sentAt: { gte: since } }, select: { accountId: true, status: true, kind: true } }),
    prisma.blastLead.count({ where: { blastId: b.id, repliedAt: { gte: since } } }),
    prisma.blastLead.count({ where: { blastId: b.id, bouncedAt: { gte: since } } }),
    prisma.blastLead.count({ where: { blastId: b.id, status: "pending" } }),
    prisma.blastLead.count({ where: { blastId: b.id, status: "queued" } }),
    prisma.blastLead.count({ where: { blastId: b.id } }),
  ]);
  const sent = msgs.filter((m) => m.status === "sent");
  const lines = [
    `Multi-account send — ${b.name} — ${today}`,
    ``,
    `Sent today: ${sent.length} (${sent.filter((m) => m.kind === "followup").length} follow-ups) · Failed: ${msgs.filter((m) => m.status === "failed").length}`,
    `Replies today: ${replies} · Bounces today: ${bounces}`,
    `Remaining: ${pending} pending + ${queued} queued of ${total} · Status: ${b.status}`,
    ``,
    `Per account:`,
    ...accounts.map((a) => {
      const n = sent.filter((m) => m.accountId === a.id).length;
      const flag = !a.enabled ? " (off)" : a.blockedUntil && a.blockedUntil > now ? ` (BLOCKED: ${a.lastError || "Gmail limit"})` : "";
      return `  #${a.order} ${a.email}: ${n} sent${a.rangeStart ? ` · last range ${a.rangeStart}–${a.rangeEnd}` : ""}${flag}`;
    }),
  ];
  const sender = accounts.find((a) => a.enabled && (!a.blockedUntil || a.blockedUntil <= now)) || accounts[0];
  const s = await getSettings(sender?.ownerId ?? null);
  if (!gmailConfigured(s)) return;
  await sendMail({ to: b.summaryEmail, subject: `[Bainsla Mail Tool] ${b.name}: ${sent.length} sent, ${replies} replies, ${bounces} bounces today`, text: lines.join("\n"), messageId: newMessageId("bainslamusic.com") }, s).catch(() => undefined);
}

/** One scheduler tick: every enabled, unblocked account whose gap elapsed sends one mail (follow-ups due first, then its queued range). */
export async function blastTick() {
  const now = new Date();
  const blasts = await prisma.blast.findMany({ where: { status: { not: "draft" } } });
  for (const b of blasts) {
    await autoRun(b, now).catch(() => undefined);
    await dailySummary(b, now).catch(() => undefined);
    if (b.status === "paused" || !inBlastWindow(b, now)) continue;
    const accounts = await prisma.blastAccount.findMany({ where: { blastId: b.id, enabled: true }, orderBy: { order: "asc" } });
    for (const a of accounts) {
      if (a.blockedUntil && a.blockedUntil > now) continue;
      if (a.nextAllowedAt && a.nextAllowedAt > now) continue;
      let lead: BlastLead | null = null;
      let kind: "initial" | "followup" = "initial";
      if (b.followUpEnabled && b.followUpBody.trim()) {
        lead = await prisma.blastLead.findFirst({
          where: { blastId: b.id, accountId: a.id, status: "sent", followUpAt: { lte: now }, followUpSentAt: null, repliedAt: null, bouncedAt: null },
          orderBy: { followUpAt: "asc" },
        });
        if (lead) kind = "followup";
      }
      if (!lead && b.status === "running") lead = await prisma.blastLead.findFirst({ where: { blastId: b.id, accountId: a.id, status: "queued" }, orderBy: { serial: "asc" } });
      if (!lead) continue;
      await sendOne(b, a, lead, kind);
    }
    if (b.status === "running") {
      const queued = await prisma.blastLead.count({ where: { blastId: b.id, status: "queued" } });
      if (!queued) {
        const pending = await prisma.blastLead.count({ where: { blastId: b.id, status: "pending" } });
        await prisma.blast.update({ where: { id: b.id }, data: { status: pending ? "idle" : "completed" } });
      }
    }
  }
}

/** Reply / bounce / unsubscribe bookkeeping shared by IMAP sync and the unsubscribe link. */
export async function markBlastLead(leadId: string, what: "replied" | "bounced" | "unsubscribed", at = new Date()) {
  const data =
    what === "replied"
      ? { status: "replied", repliedAt: at, followUpAt: null }
      : what === "bounced"
        ? { status: "bounced", bouncedAt: at, followUpAt: null, accountId: undefined }
        : { status: "unsubscribed", followUpAt: null };
  await prisma.blastLead.update({ where: { id: leadId }, data });
}
