import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSettings, gmailAuthMode, type ToolSettings } from "./settings";
import { getAccessToken } from "./google-oauth";
import { markBlastLead } from "./blast-runner";

export class MailConfigError extends Error {}

export function requireGmail(s: ToolSettings) {
  const mode = gmailAuthMode(s);
  if (!mode) throw new MailConfigError("Gmail not connected — use “Connect with Google” (or add an App Password) in Settings.");
  return { user: (mode === "oauth" && s.gmail_oauth_email) || s.gmail_user, mode };
}

/** OAuth connected AND an App Password saved → the password is the backup when Google sign-in fails. */
export const hasPasswordBackup = (s: ToolSettings) => gmailAuthMode(s) === "oauth" && !!s.gmail_app_password;

const isAuthError = (msg: string) => /invalid login|EAUTH|535|Username and Password not accepted|invalid_grant|Invalid credentials|AUTHENTICATIONFAILED|access expired/i.test(msg);

async function recordFallback(s: ToolSettings, why: string) {
  const h = await import("./account-health");
  await h.logEvent(s._owner, s.gmail_oauth_email || s.gmail_user, "oauth_fallback", `Google sign-in failed, used App Password instead: ${why}`.slice(0, 400));
}

/** Resolves SMTP/IMAP credentials: XOAUTH2 access token when connected with Google, else App Password. */
async function gmailAuth(s: ToolSettings, forcePassword = false) {
  const { user, mode } = requireGmail(s);
  if (mode === "oauth" && !forcePassword) {
    try {
      return { user, accessToken: await getAccessToken(s) };
    } catch (e) {
      if (!s.gmail_app_password) throw e;
      await recordFallback(s, (e as Error).message);
    }
  }
  return { user, pass: s.gmail_app_password };
}

export async function smtpTransport(s: ToolSettings, forcePassword = false) {
  const a = await gmailAuth(s, forcePassword);
  const auth = "accessToken" in a ? { type: "OAuth2" as const, user: a.user, accessToken: a.accessToken } : { user: a.user, pass: a.pass };
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth });
}

/** Runs an SMTP operation; if Google rejects the OAuth login and an App Password exists, retries with the password. */
async function withSmtp<T>(s: ToolSettings, fn: (t: nodemailer.Transporter) => Promise<T>): Promise<T> {
  try {
    return await fn(await smtpTransport(s));
  } catch (e) {
    const msg = (e as Error).message || "";
    if (!hasPasswordBackup(s) || !isAuthError(msg)) throw e;
    await recordFallback(s, msg);
    return fn(await smtpTransport(s, true));
  }
}

export const newMessageId = (domain: string) => `<${crypto.randomUUID()}@${domain}>`;

export function baseUrl(s: ToolSettings) {
  return (s.public_base_url || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function trackingPixel(s: ToolSettings, messageDbId: string) {
  return `<img src="${baseUrl(s)}/api/intubtool/t/${messageDbId}.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
}

export function unsubscribeUrl(s: ToolSettings, token: string) {
  return `${baseUrl(s)}/api/intubtool/u/${token}`;
}

export type SendInput = {
  to: string;
  subject: string;
  /** omit to send text-only (personal mode) */
  html?: string;
  text: string;
  messageId: string;
  fromName?: string | null;
  replyTo?: string | null;
  cc?: string | null;
  bcc?: string | null;
  inReplyTo?: string | null;
  listUnsubscribe?: string;
  attachments?: { filename: string; path: string; contentType: string }[];
};

export async function sendMail(input: SendInput, settings?: ToolSettings) {
  const s = settings ?? (await getSettings());
  const { user } = requireGmail(s);
  const info = await withSmtp(s, (transport) => transport.sendMail({
    from: input.fromName ? `"${input.fromName.replace(/"/g, "")}" <${user}>` : user,
    to: input.to,
    cc: input.cc || undefined,
    bcc: input.bcc || undefined,
    replyTo: input.replyTo || undefined,
    subject: input.subject,
    text: input.text,
    html: input.html || undefined,
    messageId: input.messageId,
    inReplyTo: input.inReplyTo || undefined,
    references: input.inReplyTo || undefined,
    attachments: input.attachments?.length ? input.attachments : undefined,
    headers: input.listUnsubscribe ? { "List-Unsubscribe": `<${input.listUnsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
  }));
  return { accepted: info.accepted as string[], rejected: info.rejected as string[], response: info.response as string };
}

export async function verifySmtp(s?: ToolSettings) {
  const settings = s ?? (await getSettings());
  await withSmtp(settings, (t) => t.verify());
  return true;
}

/* ───────────────────────── IMAP: replies + bounces ───────────────────────── */

const SYNC_KEY = "imap_last_uid";

export async function imapClient(s: ToolSettings) {
  const auth = await gmailAuth(s);
  return new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth, logger: false });
}

export async function verifyImap(s?: ToolSettings) {
  const settings = s ?? (await getSettings());
  const client = await imapClient(settings);
  await client.connect();
  await client.logout();
  return true;
}

const norm = (id?: string | null) => (id || "").trim();

/**
 * Scans recent inbox mail for replies / bounces to campaign messages and updates EmailMessage + CampaignLead.
 * Uses IMAP UID cursor so each run only looks at new mail.
 * owner = null → global/admin Gmail account, otherwise that user's connected account.
 */
export async function syncInbox(owner: string | null = null): Promise<{ scanned: number; replies: number; bounces: number; unsubscribes: number }> {
  const s = await getSettings(owner);
  requireGmail(s);
  const client = await imapClient(s);
  const stats = { scanned: 0, replies: 0, bounces: 0, unsubscribes: 0 };

  const cursorRow = owner
    ? await prisma.userSetting.findUnique({ where: { userId_key: { userId: owner, key: SYNC_KEY } } })
    : await prisma.toolSetting.findUnique({ where: { key: SYNC_KEY } });
  let lastUid = Number(cursorRow?.value || 0);

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailbox = client.mailbox;
      if (!mailbox || typeof mailbox === "boolean") return stats;
      let range: string;
      if (!lastUid) {
        // first run: only look at the last ~200 messages
        const start = Math.max(1, mailbox.exists - 200);
        range = `${start}:*`;
      } else range = `${lastUid + 1}:*`;

      // only messages sent from this inbox's account: the owner's campaigns (+ campaign-less test mails for the global account)
      const ours = await prisma.emailMessage.findMany({
        where: { status: { not: "failed" }, ...(owner ? { campaign: { ownerId: owner } } : { OR: [{ campaignId: null }, { campaign: { ownerId: null } }] }) },
        select: { id: true, messageId: true, toEmail: true, leadId: true, campaignId: true, repliedAt: true, bouncedAt: true },
        orderBy: { sentAt: "desc" },
        take: 5000,
      });
      const byMsgId = new Map(ours.map((m) => [norm(m.messageId), m]));
      const byEmail = new Map<string, typeof ours>();
      for (const m of ours) {
        const k = m.toEmail.toLowerCase();
        if (!byEmail.has(k)) byEmail.set(k, []);
        byEmail.get(k)!.push(m);
      }
      // multi-account send mails that went out through this same Gmail account
      const blastOurs = await prisma.blastMessage.findMany({
        where: { ownerKey: owner ?? "global", status: { not: "failed" } },
        select: { id: true, messageId: true, toEmail: true, leadId: true, repliedAt: true, bouncedAt: true },
        orderBy: { sentAt: "desc" },
        take: 5000,
      });
      const blastByMsgId = new Map(blastOurs.map((m) => [norm(m.messageId), m]));
      const blastByEmail = new Map<string, typeof blastOurs>();
      for (const m of blastOurs) {
        const k = m.toEmail.toLowerCase();
        if (!blastByEmail.has(k)) blastByEmail.set(k, []);
        blastByEmail.get(k)!.push(m);
      }

      for await (const msg of client.fetch(lastUid ? { uid: range } : range, { uid: true, envelope: true, source: true }, lastUid ? { uid: true } : undefined)) {
        if (msg.uid <= lastUid) continue;
        lastUid = Math.max(lastUid, msg.uid);
        stats.scanned++;
        if (!msg.source) continue;
        const parsed: ParsedMail = await simpleParser(msg.source);
        const from = (parsed.from?.value?.[0]?.address || "").toLowerCase();
        const refs = new Set<string>([
          ...(Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []),
          ...(parsed.inReplyTo ? [parsed.inReplyTo] : []),
        ].map(norm));
        const text = (parsed.text || "").slice(0, 4000);
        const isBounce =
          /mailer-daemon|postmaster|mail delivery subsystem/i.test(from) ||
          /delivery status notification|undeliverable|delivery (has )?failed|address not found|couldn't be delivered/i.test(parsed.subject || "");

        // find which of our messages this refers to
        let target = Array.from(refs).map((r) => byMsgId.get(r)).find(Boolean);
        if (!target && isBounce) {
          const m = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
          for (const addr of m) {
            const list = byEmail.get(addr.toLowerCase());
            if (list?.length) {
              target = list[0];
              break;
            }
          }
          if (!target) {
            const idm = (parsed.text || parsed.html || "").toString().match(/<[^<>@\s]+@[^<>\s]+>/g) || [];
            target = idm.map((r) => byMsgId.get(norm(r))).find(Boolean);
          }
        }
        if (!target && !isBounce && from) {
          const list = byEmail.get(from);
          if (list?.length) target = list[0];
        }
        if (!target) {
          const bt = await matchBlast(refs, from, isBounce, text, parsed, blastByMsgId, blastByEmail);
          if (bt) {
            if (isBounce) {
              if (!bt.bouncedAt) {
                stats.bounces++;
                const reason = ((parsed.text || "").match(/(5\d\d[ -]\d\.\d\.\d[^\n]*|user unknown[^\n]*|does not exist[^\n]*|not found[^\n]*|rejected[^\n]*)/i)?.[0] || parsed.subject || "Bounced").slice(0, 300);
                await prisma.blastMessage.update({ where: { id: bt.id }, data: { status: "bounced", bouncedAt: parsed.date || new Date(), bounceReason: reason } });
                await markBlastLead(bt.leadId, "bounced", parsed.date || new Date());
              }
            } else {
              const unsubscribe = /\bunsubscribe\b|\bremove me\b|\bstop\b|\bnot interested\b|\bopt[- ]?out\b/i.test(text.split(/\r?\n(On .* wrote:|From:)/)[0] || text);
              if (!bt.repliedAt) {
                stats.replies++;
                await prisma.blastMessage.update({ where: { id: bt.id }, data: { repliedAt: parsed.date || new Date(), replySnippet: text.split(/\r?\nOn .* wrote:/)[0].slice(0, 500) } });
              }
              if (unsubscribe) stats.unsubscribes++;
              await markBlastLead(bt.leadId, unsubscribe ? "unsubscribed" : "replied", parsed.date || new Date());
            }
          }
          continue;
        }

        if (isBounce) {
          if (!target.bouncedAt) {
            stats.bounces++;
            const reason = ((parsed.text || "").match(/(5\d\d[ -]\d\.\d\.\d[^\n]*|user unknown[^\n]*|does not exist[^\n]*|not found[^\n]*|rejected[^\n]*)/i)?.[0] || parsed.subject || "Bounced").slice(0, 300);
            await prisma.emailMessage.update({ where: { id: target.id }, data: { status: "bounced", bouncedAt: parsed.date || new Date(), bounceReason: reason } });
            if (target.campaignId && target.leadId)
              await prisma.campaignLead.updateMany({ where: { campaignId: target.campaignId, leadId: target.leadId }, data: { status: "bounced", nextSendAt: null } });
          }
          continue;
        }

        // genuine reply
        const unsubscribe = /\bunsubscribe\b|\bremove me\b|\bstop\b|\bnot interested\b|\bopt[- ]?out\b/i.test(text.split(/\r?\n(On .* wrote:|From:)/)[0] || text);
        if (!target.repliedAt) {
          stats.replies++;
          await prisma.emailMessage.update({
            where: { id: target.id },
            data: { repliedAt: parsed.date || new Date(), replySnippet: text.split(/\r?\nOn .* wrote:/)[0].slice(0, 500) },
          });
        }
        if (target.leadId) {
          if (unsubscribe) {
            stats.unsubscribes++;
            await prisma.lead.update({ where: { id: target.leadId }, data: { unsubscribed: true } });
            await prisma.campaignLead.updateMany({ where: { leadId: target.leadId, status: { in: ["pending", "active"] } }, data: { status: "unsubscribed", nextSendAt: null } });
          } else if (target.campaignId) {
            const camp = await prisma.campaign.findUnique({ where: { id: target.campaignId }, select: { stopOnReply: true } });
            if (camp?.stopOnReply)
              await prisma.campaignLead.updateMany({ where: { campaignId: target.campaignId, leadId: target.leadId, status: { in: ["pending", "active"] } }, data: { status: "replied", nextSendAt: null } });
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  if (owner)
    await prisma.userSetting.upsert({ where: { userId_key: { userId: owner, key: SYNC_KEY } }, update: { value: String(lastUid) }, create: { userId: owner, key: SYNC_KEY, value: String(lastUid) } });
  else await prisma.toolSetting.upsert({ where: { key: SYNC_KEY }, update: { value: String(lastUid) }, create: { key: SYNC_KEY, value: String(lastUid) } });
  return stats;
}

type BlastRef = { id: string; messageId: string; toEmail: string; leadId: string; repliedAt: Date | null; bouncedAt: Date | null };

function matchBlast(refs: Set<string>, from: string, isBounce: boolean, text: string, parsed: ParsedMail, byMsgId: Map<string, BlastRef>, byEmail: Map<string, BlastRef[]>): BlastRef | undefined {
  let target = Array.from(refs).map((r) => byMsgId.get(r)).find(Boolean);
  if (!target && isBounce) {
    for (const addr of text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []) {
      const list = byEmail.get(addr.toLowerCase());
      if (list?.length) {
        target = list[0];
        break;
      }
    }
    if (!target) {
      const idm = (parsed.text || parsed.html || "").toString().match(/<[^<>@\s]+@[^<>\s]+>/g) || [];
      target = idm.map((r) => byMsgId.get(norm(r))).find(Boolean);
    }
  }
  if (!target && !isBounce && from) target = byEmail.get(from)?.[0];
  return target;
}
