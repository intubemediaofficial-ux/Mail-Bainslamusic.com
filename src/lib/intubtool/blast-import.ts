import { prisma } from "@/lib/db";
import { autoMap, type ImportMapping } from "./csv";
import { alreadyContactedSet, suppressedSet, verifyPending } from "./blast-runner";

export type ParsedRow = { email: string; fullName: string; firstName?: string; company?: string; title?: string; phone?: string; extra: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Maps spreadsheet rows to blast leads; every unmapped column is kept in `extra` (usable as {{column_name}}). */
export function parseBlastRows(headers: string[], rows: string[][], mapping: ImportMapping): { parsed: ParsedRow[]; noEmail: number; duplicateInFile: number } {
  const get = (r: string[], i?: number) => (i == null || i < 0 ? "" : (r[i] || "").trim());
  const STORED: (keyof ImportMapping)[] = ["email", "fullName", "firstName", "lastName", "company", "title", "phone"];
  const mapped = new Set(STORED.map((k) => mapping[k]).filter((v): v is number => v != null && v >= 0));
  const seen = new Set<string>();
  const parsed: ParsedRow[] = [];
  let noEmail = 0;
  let duplicateInFile = 0;
  for (const r of rows) {
    let email = get(r, mapping.email).toLowerCase();
    if (!email) {
      // fall back to the first cell that looks like an email
      email = (r.find((c) => EMAIL_RE.test((c || "").trim())) || "").trim().toLowerCase();
    }
    if (!email || !EMAIL_RE.test(email)) {
      noEmail++;
      continue;
    }
    if (seen.has(email)) {
      duplicateInFile++;
      continue;
    }
    seen.add(email);
    const first = get(r, mapping.firstName);
    const last = get(r, mapping.lastName);
    const fullName = get(r, mapping.fullName) || `${first} ${last}`.trim();
    const extra: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (!mapped.has(i) && h && r[i]) extra[h.trim()] = (r[i] || "").trim();
    });
    parsed.push({ email, fullName, firstName: first || fullName.split(/\s+/)[0] || undefined, company: get(r, mapping.company) || undefined, title: get(r, mapping.title) || undefined, phone: get(r, mapping.phone) || undefined, extra });
  }
  return { parsed, noEmail, duplicateInFile };
}

export const blastMapping = (headers: string[]) => autoMap(headers);

export type ImportSummary = { added: number; alreadyInList: number; skippedContacted: number; skippedSuppressed: number; invalid: number; risky: number; firstSerial: number | null; lastSerial: number | null };

/**
 * Appends rows to the blast's database with continuing serial numbers.
 * Duplicate-check: addresses mailed before (other lists / campaigns) or that replied/bounced/unsubscribed anywhere are added as `skipped` with the reason.
 */
export async function importBlastLeads(blastId: string, parsed: ParsedRow[], opts: { dedupe: boolean; verify: boolean }): Promise<ImportSummary> {
  const existing = new Set((await prisma.blastLead.findMany({ where: { blastId }, select: { email: true } })).map((l) => l.email));
  const fresh = parsed.filter((p) => !existing.has(p.email));
  const alreadyInList = parsed.length - fresh.length;
  const [contacted, suppressed] = opts.dedupe ? await Promise.all([alreadyContactedSet(fresh.map((p) => p.email), blastId), suppressedSet(fresh.map((p) => p.email))]) : [new Map<string, string>(), new Map<string, string>()];

  const max = await prisma.blastLead.aggregate({ where: { blastId }, _max: { serial: true } });
  let serial = max._max.serial ?? 0;
  const firstSerial = fresh.length ? serial + 1 : null;
  let skippedContacted = 0;
  let skippedSuppressed = 0;
  const rows = fresh.map((p) => {
    serial++;
    const sup = suppressed.get(p.email);
    const con = contacted.get(p.email);
    let status = "pending";
    let statusNote: string | null = null;
    if (sup) {
      status = "skipped";
      statusNote = `Suppressed: ${sup}`;
      skippedSuppressed++;
    } else if (con) {
      status = "skipped";
      statusNote = `Already contacted via ${con}`;
      skippedContacted++;
    }
    return {
      blastId,
      serial,
      email: p.email,
      fullName: p.fullName,
      firstName: p.firstName ?? null,
      company: p.company ?? null,
      title: p.title ?? null,
      phone: p.phone ?? null,
      extra: Object.keys(p.extra).length ? JSON.stringify(p.extra) : null,
      status,
      statusNote,
    };
  });
  for (let i = 0; i < rows.length; i += 200) await prisma.blastLead.createMany({ data: rows.slice(i, i + 200) });

  let invalid = 0;
  let risky = 0;
  if (opts.verify && rows.length) {
    const v = await verifyPending(blastId, rows.length + 50);
    invalid = v.invalid;
    risky = v.risky;
  }
  return { added: rows.length, alreadyInList, skippedContacted, skippedSuppressed, invalid, risky, firstSerial, lastSerial: rows.length ? serial : null };
}
