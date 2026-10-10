import { ok, fail } from "@/app/api/admin/_lib";
import { autoMap, rowsToLeads, type ImportMapping } from "@/lib/intubtool/csv";
import { readSpreadsheet } from "@/lib/intubtool/spreadsheet";
import { findExistingLead, upsertLead } from "@/lib/intubtool/leads";
import { ensureList, getList } from "@/lib/intubtool/lists";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * multipart/form-data:
 *   file      – .csv / .xlsx
 *   mode      – "preview" (default) | "import"
 *   mapping   – optional JSON of { field: columnIndex } overrides
 *   category  – optional tag applied to every imported lead
 *   listId    – optional contact list to add every imported/merged lead to
 *   listName  – alternative to listId: find-or-create a list with this name
 */
export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const form = await req.formData().catch(() => null);
  if (!form) return fail("Expected multipart form-data");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Upload a CSV or XLSX file");
  if (file.size > MAX_BYTES) return fail("File too large (max 25 MB)");
  const mode = String(form.get("mode") || "preview");
  const category = String(form.get("category") || "").trim() || undefined;
  let listId = String(form.get("listId") || "").trim() || undefined;
  const listName = String(form.get("listName") || "").trim();
  if (listId && !(await getList(scope, listId))) return fail("List not found", 404);

  let matrix: string[][];
  try {
    matrix = await readSpreadsheet({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
  } catch (e) {
    return fail(`Could not read file — is it a valid CSV/XLSX? (${(e as Error).message})`);
  }
  if (matrix.length < 2) return fail("File has no data rows");
  const [headers, ...rows] = matrix;

  let mapping: ImportMapping = autoMap(headers);
  const override = form.get("mapping");
  if (typeof override === "string" && override) {
    try {
      const o = JSON.parse(override) as Record<string, number | null>;
      for (const [k, v] of Object.entries(o)) {
        if (v == null || v < 0) delete mapping[k as keyof ImportMapping];
        else mapping = { ...mapping, [k]: v };
      }
    } catch {
      return fail("Invalid mapping JSON");
    }
  }
  if (mapping.fullName == null && (mapping.firstName == null || mapping.lastName == null))
    return ok({ headers, mapping, rows: rows.length, needsMapping: true, sample: rows.slice(0, 5), error: "Could not detect a name column – map it manually" });

  const parsed = rowsToLeads(headers, rows, mapping);

  if (mode !== "import") {
    // preview: show how many already exist locally
    let existing = 0;
    let withContact = 0;
    for (const p of parsed.slice(0, 500)) {
      if (p.email || p.phone) withContact++;
      const found = await findExistingLead({ linkedinUrl: p.linkedinUrl, email: p.email, fullName: p.fullName, company: p.company }, scope.readOwners);
      if (found) existing++;
    }
    return ok({ headers, mapping, rows: rows.length, parsed: parsed.length, existing, withContact, sample: parsed.slice(0, 8), needsMapping: false });
  }

  if (!listId && listName) listId = (await ensureList(scope, listName)).id;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  let addedToList = 0;
  for (const p of parsed) {
    try {
      const r = await upsertLead({
        ...p,
        category: p.category || category || null,
        source: "import",
        emails: p.emails,
        phones: p.phones,
        notes: p.notes || null,
        listId,
        ownerId: scope.owner,
        matchOwners: scope.readOwners,
      });
      if (listId) addedToList++;
      if (r.created) created++;
      else updated++;
    } catch (e) {
      skipped++;
      if (errors.length < 10) errors.push(`${p.fullName}: ${(e as Error).message}`);
    }
  }
  return ok({ rows: rows.length, parsed: parsed.length, created, updated, skipped, errors, mapping, listId: listId || null, addedToList });
}
