import { prisma } from "@/lib/db";
import { getSettings } from "./settings";
import { pickBestEmail, pickBestPhone, salesql, SalesqlError } from "./salesql";
import { normalizeLinkedinUrl } from "./linkedin";

export type EnrichOutcome = { leadId: string; status: "cached" | "done" | "not_found" | "error" | "skipped"; message?: string };

/**
 * Database-first enrichment:
 *  1. If the lead already has email/phone → return cached (no credit used).
 *  2. Else look for another lead in our DB with same LinkedIn URL / name+company that has contact data → copy it.
 *  3. Else call SalesQL (uses credits) and store the result.
 */
export async function enrichLead(leadId: string, opts?: { force?: boolean }): Promise<EnrichOutcome> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { leadId, status: "error", message: "Lead not found" };

  if (!opts?.force && (lead.email || lead.phone)) {
    if (lead.enrichStatus === "queued" || lead.enrichStatus === "none")
      await prisma.lead.update({ where: { id: lead.id }, data: { enrichStatus: "done", enrichError: null } });
    return { leadId, status: "cached", message: "Already in database" };
  }

  // 2. local match
  const url = normalizeLinkedinUrl(lead.linkedinUrl);
  const twin = await prisma.lead.findFirst({
    where: {
      id: { not: lead.id },
      OR: [
        ...(url ? [{ linkedinUrl: url }] : []),
        { AND: [{ fullName: { equals: lead.fullName } }, { company: { contains: lead.company.split(/\s+/)[0] } }] },
      ],
      NOT: [{ email: null, phone: null }],
    },
  });
  if (twin && !opts?.force) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        email: lead.email || twin.email,
        phone: lead.phone || twin.phone,
        emails: lead.emails || twin.emails,
        phones: lead.phones || twin.phones,
        emailStatus: lead.emailStatus || twin.emailStatus,
        enrichStatus: "done",
        enrichedAt: new Date(),
        enrichError: null,
      },
    });
    return { leadId, status: "cached", message: "Matched from database" };
  }

  // 3. SalesQL
  const settings = await getSettings();
  if (!settings.salesql_api_key) return { leadId, status: "error", message: "SalesQL API key not set (Settings)" };
  if (!url && !(lead.fullName && (lead.companyDomain || lead.company))) return { leadId, status: "skipped", message: "Need LinkedIn URL or name + company" };

  try {
    const person = await salesql.enrichPerson(settings.salesql_api_key, {
      linkedin_url: url,
      full_name: url ? undefined : lead.fullName,
      organization_domain: url ? undefined : lead.companyDomain || undefined,
      organization_name: url || lead.companyDomain ? undefined : lead.company,
    });
    const email = pickBestEmail(person.emails);
    const phone = pickBestPhone(person.phones);
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        email: email?.email?.toLowerCase() || lead.email,
        emailStatus: email?.status || lead.emailStatus,
        emails: person.emails?.length ? JSON.stringify(person.emails) : lead.emails,
        phone: phone?.phone || lead.phone,
        phones: person.phones?.length ? JSON.stringify(person.phones) : lead.phones,
        title: lead.title || person.title || null,
        headline: lead.headline || person.headline || null,
        location: lead.location || [person.location?.city, person.location?.country].filter(Boolean).join(", ") || null,
        linkedinUrl: lead.linkedinUrl || normalizeLinkedinUrl(person.linkedin_url) || null,
        companyDomain: lead.companyDomain || person.organization?.website_domain || null,
        firstName: lead.firstName || person.first_name || null,
        lastName: lead.lastName || person.last_name || null,
        enrichStatus: email || phone ? "done" : "not_found",
        enrichError: null,
        enrichedAt: new Date(),
        enrichRaw: JSON.stringify(person).slice(0, 20000),
      },
    });
    return { leadId, status: email || phone ? "done" : "not_found", message: email || phone ? undefined : "SalesQL has no email/phone for this person" };
  } catch (e) {
    const err = e as SalesqlError;
    const status = err.status === 404 ? "not_found" : "error";
    await prisma.lead.update({
      where: { id: lead.id },
      data: { enrichStatus: status, enrichError: err.message, enrichedAt: new Date() },
    });
    return { leadId, status, message: err.message };
  }
}

/** Enrich many leads sequentially (SalesQL rate-limits aggressively). Stops early on auth/credit errors. */
export async function enrichLeads(ids: string[], opts?: { force?: boolean }) {
  const results: EnrichOutcome[] = [];
  for (const id of ids) {
    const r = await enrichLead(id, opts);
    results.push(r);
    if (r.status === "error" && /invalid|plan|credit|Unauthorized|rate limit/i.test(r.message || "")) {
      for (const rest of ids.slice(results.length)) results.push({ leadId: rest, status: "skipped", message: "Stopped: " + r.message });
      break;
    }
    if (r.status !== "cached") await new Promise((res) => setTimeout(res, 1200));
  }
  return results;
}
