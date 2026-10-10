import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { findExistingLead } from "@/lib/intubtool/leads";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

/**
 * Check our own database before spending credits.
 * body: { items: [{ linkedinUrl?, email?, fullName?, company? }] }
 * returns per item: { found: boolean, lead?: {...}, hasEmail, hasPhone }
 */
export async function POST(req: Request) {
  const b = await readJson<{ items?: { linkedinUrl?: string; email?: string; fullName?: string; company?: string }[] }>(req);
  if (!b?.items?.length) return fail("items required");
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const out = [];
  for (const it of b.items.slice(0, 500)) {
    const lead = await findExistingLead(it, scope.readOwners);
    out.push({
      query: it,
      found: !!lead,
      hasEmail: !!lead?.email,
      hasPhone: !!lead?.phone,
      lead: lead
        ? { id: lead.id, fullName: lead.fullName, company: lead.company, title: lead.title, email: lead.email, phone: lead.phone, linkedinUrl: lead.linkedinUrl, source: lead.source, emails: lead.emails, phones: lead.phones }
        : null,
    });
  }
  const found = out.filter((o) => o.found).length;
  return ok({ results: out, found, missing: out.length - found, withContact: out.filter((o) => o.hasEmail || o.hasPhone).length });
}
