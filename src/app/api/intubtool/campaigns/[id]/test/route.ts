import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { getSettings, gmailConfigured } from "@/lib/intubtool/settings";
import { buildEmail } from "@/lib/intubtool/campaign-runner";
import { newMessageId, sendMail } from "@/lib/intubtool/mailer";
import { mailAttachments } from "@/lib/intubtool/attachments";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { campaignWhere, getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: { id: string } };

/** Sends a test email (step 0 rendered with a sample lead) to the given address, or to the campaign owner's Gmail user. */
export async function POST(req: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = (await readJson<{ to?: string; leadId?: string; step?: number }>(req)) || {};
  const c = await prisma.campaign.findFirst({ where: campaignWhere(scope, params.id), include: { steps: { orderBy: { order: "asc" } } } });
  if (!c) return fail("Not found", 404);
  const step = c.steps[b.step ?? 0];
  if (!step) return fail("Step not found");
  const s = await getSettings(c.ownerId);
  if (!gmailConfigured(s)) return fail(c.ownerId ? "Connect your Gmail first (Settings → Gmail → Connect with Google)" : "Gmail is not configured (Settings → Gmail)");
  const to = str(b.to, 200) || s.gmail_user;
  if (!to) return fail("No recipient – configure Gmail or pass 'to'");
  const visible = leadWhere(new URLSearchParams(), scope);
  const lead =
    (b.leadId ? await prisma.lead.findFirst({ where: { AND: [{ id: b.leadId }, visible] } }) : null) ||
    (await prisma.campaignLead.findFirst({ where: { campaignId: c.id }, include: { lead: true } }))?.lead ||
    (await prisma.lead.findFirst({ where: visible }));
  if (!lead) return fail("Add at least one lead so the test can render variables");
  try {
    const mail = await buildEmail(c, step, lead, s, { skipAi: !c.aiPersonalize });
    await sendMail(
      {
        to,
        cc: c.cc,
        bcc: c.bcc || s.bcc_email,
        subject: `[TEST] ${mail.subject}`,
        html: mail.html,
        text: mail.text,
        messageId: newMessageId((s.gmail_user.split("@")[1] || "bainslamusic.com").toLowerCase()),
        fromName: c.fromName || s.from_name,
        replyTo: c.replyTo || s.reply_to,
        listUnsubscribe: mail.listUnsubscribe ?? undefined,
        attachments: await mailAttachments(step.attachments),
      },
      s
    );
    const h = mail.health;
    return ok({
      message: `Test email sent to ${to}${c.personalMode ? " (personal mode, text-only)" : ""} — spam score ${h.spam.score}, likely ${h.placement} (${h.primary}% Primary)`,
      subject: mail.subject,
      spamScore: mail.spamScore,
      health: h,
    });
  } catch (e) {
    return fail((e as Error).message);
  }
}
