import { prisma } from "@/lib/db";
import type { Campaign, CampaignStep, Lead } from "@prisma/client";
import { getSettings, gmailConfigured, type ToolSettings } from "./settings";
import { leadVars, renderTemplate, textToHtml } from "./template";
import { MailConfigError, newMessageId, sendMail, trackingPixel, unsubscribeUrl } from "./mailer";
import { mailAttachments, parseAttachments } from "./attachments";
import { personalizeEmail } from "./ai";
import { mailHealth, type MailHealth } from "./spam";

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Gmail refused the mail because the *account* is over its own sending quota (not a problem with this lead). */
export const isProviderRateLimit = (msg: string) => /5\.4\.5|Daily user sending limit|sending limit exceeded|4\.7\.0.*(rate|limit|Too many)|421[- ]4\.7|Too many login attempts/i.test(msg);
const RATE_LIMIT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function inSendWindow(c: Campaign, now = new Date()) {
  const h = now.getHours();
  if (c.sendWindowStart === c.sendWindowEnd) return true;
  if (c.sendWindowStart < c.sendWindowEnd) return h >= c.sendWindowStart && h < c.sendWindowEnd;
  return h >= c.sendWindowStart || h < c.sendWindowEnd; // overnight window
}

export type RenderedEmail = {
  subject: string;
  text: string;
  /** undefined in personal mode — the mail goes out text-only */
  html?: string;
  aiPersonalized: boolean;
  spamScore: number;
  health: MailHealth;
  inReplyTo?: string | null;
  /** List-Unsubscribe URL to send, or null in personal mode */
  listUnsubscribe: string | null;
};

/** Builds the final email for a lead + step (variables, AI personalization, unsubscribe line, tracking pixel). In personal mode: text-only, no pixel, no unsubscribe footer/header. */
export async function buildEmail(
  campaign: Campaign,
  step: CampaignStep,
  lead: Lead,
  s: ToolSettings,
  opts: { messageDbId?: string; firstMessage?: { messageId: string; subject: string } | null; skipAi?: boolean }
): Promise<RenderedEmail> {
  const unsub = unsubscribeUrl(s, lead.unsubToken);
  const vars = leadVars(lead, { unsubscribe_url: unsub, signature: s.signature || "", sender_name: campaign.fromName || s.from_name || "" });

  let subject = renderTemplate(step.subject, vars).trim();
  let body = renderTemplate(step.body, vars).trim();
  let aiPersonalized = false;

  if (campaign.aiPersonalize && !opts.skipAi && s.ai_api_key) {
    try {
      const p = await personalizeEmail({ subject, body, lead, instructions: campaign.aiInstructions });
      subject = p.subject.trim() || subject;
      body = p.body.trim() || body;
      aiPersonalized = true;
    } catch {
      aiPersonalized = false;
    }
  }

  let inReplyTo: string | null = null;
  if (step.order > 0 && opts.firstMessage) {
    inReplyTo = opts.firstMessage.messageId;
    if (!subject) subject = opts.firstMessage.subject.startsWith("Re:") ? opts.firstMessage.subject : `Re: ${opts.firstMessage.subject}`;
  }

  const personal = campaign.personalMode;
  if (!personal && !/unsubscribe|opt[- ]?out/i.test(body) && s.unsubscribe_text) body += `\n\n${renderTemplate(s.unsubscribe_text, vars)}`;
  body = body.replace(/\{\{\s*unsubscribe_url\s*\}\}/g, unsub);

  const text = body;
  const pixel = !personal && campaign.trackOpens;
  let html: string | undefined;
  if (!personal) {
    html = textToHtml(body);
    if (pixel && opts.messageDbId) html += trackingPixel(s, opts.messageDbId);
  }

  const firstName = vars.first_name || "";
  const health = mailHealth(subject, text, {
    personal,
    pixel,
    unsubHeader: !personal,
    attachments: parseAttachments(step.attachments).length,
    firstNameUsed: /\{\{\s*(first_name|name|full_name)\s*\}\}/.test(step.body) || (!!firstName && text.includes(firstName)),
  });

  return { subject, text, html, aiPersonalized, spamScore: health.spam.score, health, inReplyTo, listUnsubscribe: personal ? null : unsub };
}

async function sendToLead(campaign: Campaign & { steps: CampaignStep[] }, cl: { id: string; leadId: string; currentStep: number }, s: ToolSettings) {
  const lead = await prisma.lead.findUnique({ where: { id: cl.leadId } });
  if (!lead || !lead.email || lead.unsubscribed) {
    await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: lead?.unsubscribed ? "unsubscribed" : "failed", nextSendAt: null } });
    return "skipped" as const;
  }
  const steps = [...campaign.steps].sort((a, b) => a.order - b.order);
  const step = steps[cl.currentStep];
  if (!step) {
    await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "completed", nextSendAt: null } });
    return "completed" as const;
  }
  const firstMessage =
    step.order > 0
      ? await prisma.emailMessage.findFirst({ where: { campaignId: campaign.id, leadId: lead.id, stepOrder: 0, status: { not: "failed" } }, orderBy: { sentAt: "asc" } })
      : null;

  const messageId = newMessageId((s.gmail_user.split("@")[1] || "kvspt.com").toLowerCase());
  const record = await prisma.emailMessage.create({
    data: { campaignId: campaign.id, leadId: lead.id, stepOrder: step.order, messageId, toEmail: lead.email, subject: "", bodyHtml: "", bodyText: "", status: "sent" },
  });

  try {
    const mail = await buildEmail(campaign, step, lead, s, { messageDbId: record.id, firstMessage });
    await sendMail(
      {
        to: lead.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        messageId,
        fromName: campaign.fromName || s.from_name,
        replyTo: campaign.replyTo || s.reply_to,
        cc: campaign.cc,
        bcc: campaign.bcc || s.bcc_email,
        inReplyTo: mail.inReplyTo,
        listUnsubscribe: mail.listUnsubscribe ?? undefined,
        attachments: await mailAttachments(step.attachments),
      },
      s
    );
    await prisma.emailMessage.update({
      where: { id: record.id },
      data: { subject: mail.subject, bodyHtml: mail.html ?? "", bodyText: mail.text, spamScore: mail.spamScore, aiPersonalized: mail.aiPersonalized, sentAt: new Date() },
    });
    const next = steps[cl.currentStep + 1];
    await prisma.campaignLead.update({
      where: { id: cl.id },
      data: {
        currentStep: cl.currentStep + 1,
        lastSentAt: new Date(),
        status: next ? "active" : "completed",
        nextSendAt: next ? new Date(Date.now() + Math.max(0, next.delayDays) * 86400000) : null,
      },
    });
    return "sent" as const;
  } catch (e) {
    const msg = (e as Error).message || "send failed";
    await prisma.emailMessage.update({ where: { id: record.id }, data: { status: "failed", error: msg.slice(0, 500) } });
    if (e instanceof MailConfigError || /invalid login|EAUTH|535|Username and Password not accepted/i.test(msg)) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "paused" } });
      const h = await import("./account-health");
      await h.notifyAdmin(
        `[IntubTool] Campaign "${campaign.name}" paused: Gmail login failed`,
        [`Account: ${s.gmail_oauth_email || s.gmail_user || "not connected"}`, `Error: ${msg.slice(0, 400)}`, `When: ${new Date().toLocaleString()}`, ``, `Reconnect Gmail in Settings, then Resume the campaign.`].join("\n"),
        { exclude: campaign.ownerId }
      );
      return "paused" as const;
    }
    if (isProviderRateLimit(msg)) {
      // account-wide quota: keep every pending lead of this owner's campaigns and retry after the cooldown
      const resumeAt = new Date(Date.now() + RATE_LIMIT_COOLDOWN_MS);
      await prisma.campaignLead.updateMany({
        where: { campaign: { ownerId: campaign.ownerId, status: "running" }, status: { in: ["pending", "active"] } },
        data: { nextSendAt: resumeAt },
      });
      return "cooldown" as const;
    }
    await prisma.campaignLead.update({ where: { id: cl.id }, data: { status: "failed", nextSendAt: null } });
    return "failed" as const;
  }
}

/** One scheduler tick: sends at most one email per running campaign (gap + daily limit + window enforced). */
export async function campaignTick() {
  const campaigns = await prisma.campaign.findMany({ where: { status: "running" }, include: { steps: true } });
  if (!campaigns.length) return;
  const now = new Date();

  // each campaign sends through its owner's Gmail (ownerId null → global/admin account) with that owner's daily limit
  const owners = new Map<string | null, { s: ToolSettings; today: number; limit: number } | null>();
  const ownerCtx = async (ownerId: string | null) => {
    if (owners.has(ownerId)) return owners.get(ownerId)!;
    const s = await getSettings(ownerId);
    if (!gmailConfigured(s)) {
      owners.set(ownerId, null);
      return null;
    }
    const today = await prisma.emailMessage.count({ where: { sentAt: { gte: startOfToday() }, status: { not: "failed" }, campaign: { ownerId } } });
    const ctx = { s, today, limit: Number(s.default_daily_limit) || 0 };
    owners.set(ownerId, ctx);
    return ctx;
  };

  for (const c of campaigns) {
    if (!inSendWindow(c, now)) continue;
    const o = await ownerCtx(c.ownerId);
    if (!o) {
      // owner has no Gmail connected → pause so the user sees why nothing goes out
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "paused" } });
      continue;
    }
    const { s } = o;
    if (o.limit && o.today >= o.limit) continue;
    const sentToday = await prisma.emailMessage.count({ where: { campaignId: c.id, sentAt: { gte: startOfToday() }, status: { not: "failed" } } });
    if (sentToday >= c.dailyLimit) continue;
    const last = await prisma.emailMessage.findFirst({ where: { campaignId: c.id }, orderBy: { sentAt: "desc" }, select: { sentAt: true } });
    if (last && now.getTime() - last.sentAt.getTime() < c.minGapSeconds * 1000) continue;

    const cl = await prisma.campaignLead.findFirst({
      where: { campaignId: c.id, status: { in: ["pending", "active"] }, OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }] },
      orderBy: [{ nextSendAt: "asc" }, { createdAt: "asc" }],
    });
    if (!cl) {
      const remaining = await prisma.campaignLead.count({ where: { campaignId: c.id, status: { in: ["pending", "active"] } } });
      if (remaining === 0) await prisma.campaign.update({ where: { id: c.id }, data: { status: "completed" } });
      continue;
    }
    if ((await sendToLead(c, cl, s)) === "sent") o.today++;
  }
}
