import type { Prisma } from "@prisma/client";
import { ok, fail } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { gmailConfigured } from "@/lib/intubtool/settings";
import { salesql, type SalesqlAllowance } from "@/lib/intubtool/salesql";
import { ensureScheduler, schedulerStatus } from "@/lib/intubtool/scheduler";
import { startOfToday } from "@/lib/intubtool/campaign-runner";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { campaignWhere, getScope, scopeSettings } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

let allowanceCache: { at: number; value: SalesqlAllowance | null; error?: string } | null = null;

export async function GET() {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  ensureScheduler();
  const s = await scopeSettings(scope);
  const lead = leadWhere(new URLSearchParams(), scope);
  const own = scope.readOwners ? { OR: scope.readOwners.map((ownerId) => ({ ownerId })) } : {};
  const camp = campaignWhere(scope);
  const msg: Prisma.EmailMessageWhereInput = scope.admin ? {} : { campaign: { ownerId: scope.user.id } };
  const [leads, withEmail, withPhone, companies, jobsRunning, campaignsRunning, sentToday, sentTotal, opened, replied, bounced, queuedEnrich, recentJobs, recentLeads] = await Promise.all([
    prisma.lead.count({ where: lead }),
    prisma.lead.count({ where: { ...lead, email: { not: null } } }),
    prisma.lead.count({ where: { ...lead, phone: { not: null } } }),
    prisma.lead.groupBy({ by: ["company"], where: lead }).then((r) => r.length),
    prisma.searchJob.count({ where: { ...own, status: { in: ["queued", "running"] } } }),
    prisma.campaign.count({ where: { ...camp, status: "running" } }),
    prisma.emailMessage.count({ where: { ...msg, status: "sent", sentAt: { gte: startOfToday() } } }),
    prisma.emailMessage.count({ where: { ...msg, status: "sent" } }),
    prisma.emailMessage.count({ where: { ...msg, openCount: { gt: 0 } } }),
    prisma.emailMessage.count({ where: { ...msg, repliedAt: { not: null } } }),
    prisma.emailMessage.count({ where: { ...msg, status: "bounced" } }),
    prisma.lead.count({ where: { ...lead, enrichStatus: "queued" } }),
    prisma.searchJob.findMany({ where: own, orderBy: { createdAt: "desc" }, take: 5, include: { _count: { select: { leads: true } } } }),
    prisma.lead.findMany({ where: lead, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, fullName: true, company: true, title: true, email: true, phone: true, source: true, createdAt: true } }),
  ]);

  let allowance: SalesqlAllowance | null = null;
  let allowanceError: string | undefined;
  if (scope.admin && s.salesql_api_key) {
    if (allowanceCache && Date.now() - allowanceCache.at < 5 * 60_000) {
      allowance = allowanceCache.value;
      allowanceError = allowanceCache.error;
    } else {
      try {
        allowance = await salesql.allowance(s.salesql_api_key);
      } catch (e) {
        allowanceError = (e as Error).message;
      }
      allowanceCache = { at: Date.now(), value: allowance, error: allowanceError };
    }
  }

  return ok({
    leads: { total: leads, withEmail, withPhone, companies, queuedEnrich },
    jobsRunning,
    campaignsRunning,
    email: { sentToday, sentTotal, opened, replied, bounced, dailyLimit: Number(s.default_daily_limit) || 0 },
    configured: { salesql: !!s.salesql_api_key, linkedin: !!s.linkedin_li_at, gmail: gmailConfigured(s), ai: !!s.ai_api_key },
    salesql: scope.admin ? { allowance, error: allowanceError } : null,
    scheduler: scope.admin ? schedulerStatus() : null,
    recentJobs,
    recentLeads,
    admin: scope.admin,
    user: { name: scope.user.name, email: scope.user.email, shareData: scope.user.shareData },
  });
}
