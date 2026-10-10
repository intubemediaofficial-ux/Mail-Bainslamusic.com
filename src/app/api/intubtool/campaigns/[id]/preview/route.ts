import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/intubtool/settings";
import { buildEmail } from "@/lib/intubtool/campaign-runner";
import { aiSpamReview } from "@/lib/intubtool/ai";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { campaignWhere, getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: { id: string } };

/** body: { leadId?: string; step?: number; ai?: boolean; aiReview?: boolean } */
export async function POST(req: Request, { params }: Ctx) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = (await readJson<{ leadId?: string; step?: number; ai?: boolean; aiReview?: boolean }>(req)) || {};
  const c = await prisma.campaign.findFirst({ where: campaignWhere(scope, params.id), include: { steps: { orderBy: { order: "asc" } } } });
  if (!c) return fail("Not found", 404);
  const step = c.steps[b.step ?? 0];
  if (!step) return fail("Step not found");
  const visible = leadWhere(new URLSearchParams(), scope);
  const lead =
    (b.leadId ? await prisma.lead.findFirst({ where: { AND: [{ id: b.leadId }, visible] } }) : null) ||
    (await prisma.campaignLead.findFirst({ where: { campaignId: c.id }, include: { lead: true } }))?.lead ||
    (await prisma.lead.findFirst({ where: { AND: [{ email: { not: null } }, visible] } }));
  if (!lead) return fail("No lead available to preview with – add a lead first");
  const s = await getSettings(c.ownerId);
  try {
    const mail = await buildEmail(c, step, lead, s, { skipAi: !b.ai });
    let ai: Awaited<ReturnType<typeof aiSpamReview>> | null = null;
    if (b.aiReview && s.ai_api_key) ai = await aiSpamReview(mail.subject, mail.text).catch(() => null);
    return ok({ lead: { id: lead.id, fullName: lead.fullName, company: lead.company, email: lead.email }, subject: mail.subject, text: mail.text, html: mail.html, aiPersonalized: mail.aiPersonalized, spam: mail.health.spam, health: mail.health, personal: c.personalMode, aiReview: ai });
  } catch (e) {
    return fail((e as Error).message);
  }
}
