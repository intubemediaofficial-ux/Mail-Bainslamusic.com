import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeLinkedinUrl } from "./linkedin";

export type LeadInput = {
  company: string;
  fullName: string;
  title?: string | null;
  headline?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  category?: string | null;
  source: "linkedin" | "salesql" | "salesql_sync" | "web" | "import" | "manual";
  email?: string | null;
  phone?: string | null;
  companyDomain?: string | null;
  companyUrl?: string | null;
  notes?: string | null;
  jobId?: string | null;
  emails?: unknown[] | null;
  phones?: unknown[] | null;
  /** contact list to add the (new or merged) lead to */
  listId?: string | null;
  /** SalesQL contact uid (set by SalesQL sync); matched before LinkedIn URL */
  salesqlUid?: string | null;
  salesqlSyncedAt?: Date | null;
  /** owner of a newly created lead (null = shared/admin pool) */
  ownerId?: string | null;
  /** owners whose existing leads may be merged into; null/undefined = any owner */
  matchOwners?: (string | null)[] | null;
};

const ownersWhere = (owners?: (string | null)[] | null): Prisma.LeadWhereInput => (owners ? { OR: owners.map((ownerId) => ({ ownerId })) } : {});

export const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] || null, lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Find an existing lead by LinkedIn URL, else by email, else by name + company (fuzzy). */
export async function findExistingLead(
  q: { salesqlUid?: string | null; linkedinUrl?: string | null; email?: string | null; fullName?: string | null; company?: string | null },
  owners?: (string | null)[] | null
) {
  const scope = ownersWhere(owners);
  if (q.salesqlUid) {
    const hit = await prisma.lead.findFirst({ where: { ...scope, salesqlUid: q.salesqlUid } });
    if (hit) return hit;
  }
  const url = normalizeLinkedinUrl(q.linkedinUrl);
  if (url) {
    const hit = await prisma.lead.findFirst({ where: { ...scope, linkedinUrl: url } });
    if (hit) return hit;
  }
  if (q.email) {
    const hit = await prisma.lead.findFirst({ where: { ...scope, email: { equals: q.email.trim().toLowerCase() } } });
    if (hit) return hit;
  }
  if (q.fullName && q.company) {
    const candidates = await prisma.lead.findMany({ where: { ...scope, fullName: { contains: q.fullName.trim().split(/\s+/)[0] } }, take: 50 });
    const wantName = norm(q.fullName);
    const wantCo = norm(q.company);
    return (
      candidates.find((c) => norm(c.fullName) === wantName && (norm(c.company) === wantCo || norm(c.company).includes(wantCo) || wantCo.includes(norm(c.company)))) ||
      null
    );
  }
  return null;
}

/** Union of comma-separated categories (case-insensitive, keeps first spelling). */
export function mergeCategory(existing: string | null, incoming?: string | null) {
  if (!incoming) return existing;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of `${existing || ""},${incoming}`.split(",")) {
    const s = raw.trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out.length ? out.join(", ") : existing;
}

/** Insert or merge a lead. Never overwrites existing email/phone with empty values. */
export async function upsertLead(input: LeadInput) {
  const linkedinUrl = normalizeLinkedinUrl(input.linkedinUrl) ?? null;
  const email = input.email?.trim().toLowerCase() || null;
  const existing = await findExistingLead({ salesqlUid: input.salesqlUid, linkedinUrl, email, fullName: input.fullName, company: input.company }, input.matchOwners);
  const { firstName, lastName } = splitName(input.fullName);

  if (existing) {
    const lead = await prisma.lead.update({
      where: { id: existing.id },
      data: {
        salesqlUid: input.salesqlUid ?? existing.salesqlUid,
        salesqlSyncedAt: input.salesqlSyncedAt ?? existing.salesqlSyncedAt,
        title: existing.title || input.title || null,
        headline: existing.headline || input.headline || null,
        location: existing.location || input.location || null,
        linkedinUrl: existing.linkedinUrl || linkedinUrl,
        companyDomain: existing.companyDomain || input.companyDomain || null,
        companyUrl: existing.companyUrl || input.companyUrl || null,
        category: mergeCategory(existing.category, input.category),
        email: existing.email || email,
        phone: existing.phone || input.phone?.trim() || null,
        notes: existing.notes || input.notes || null,
        emails: existing.emails || (input.emails?.length ? JSON.stringify(input.emails) : null),
        phones: existing.phones || (input.phones?.length ? JSON.stringify(input.phones) : null),
        jobId: input.jobId ?? existing.jobId,
        enrichStatus: existing.enrichStatus === "none" && (existing.email || email || existing.phone || input.phone) ? "done" : existing.enrichStatus,
      },
    });
    await addToList(lead.id, input.listId);
    return { lead, created: false };
  }

  const lead = await prisma.lead.create({
    data: {
      company: input.company.trim(),
      companyDomain: input.companyDomain || null,
      companyUrl: input.companyUrl || null,
      fullName: input.fullName.trim(),
      firstName,
      lastName,
      title: input.title || null,
      headline: input.headline || null,
      location: input.location || null,
      linkedinUrl,
      category: input.category || null,
      source: input.source,
      salesqlUid: input.salesqlUid || null,
      salesqlSyncedAt: input.salesqlSyncedAt || null,
      email,
      phone: input.phone?.trim() || null,
      notes: input.notes || null,
      emails: input.emails?.length ? JSON.stringify(input.emails) : null,
      phones: input.phones?.length ? JSON.stringify(input.phones) : null,
      jobId: input.jobId || null,
      ownerId: input.ownerId ?? null,
      enrichStatus: email || input.phone ? "done" : "none",
    },
  });
  await addToList(lead.id, input.listId);
  return { lead, created: true };
}

async function addToList(leadId: string, listId?: string | null) {
  if (!listId) return;
  await prisma.contactListLead.upsert({ where: { listId_leadId: { listId, leadId } }, update: {}, create: { listId, leadId } });
}

/** Check if the given keywords match a title/headline (case-insensitive, any keyword). */
export function matchCategory(text: string | undefined | null, keywords: string[]) {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const k of keywords) {
    const kk = k.toLowerCase().trim();
    if (kk && t.includes(kk)) return k;
  }
  return null;
}
