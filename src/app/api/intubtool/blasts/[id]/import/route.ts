import { ok, fail } from "@/app/api/admin/_lib";
import { readSpreadsheet } from "@/lib/intubtool/spreadsheet";
import { blastMapping, importBlastLeads, parseBlastRows } from "@/lib/intubtool/blast-import";
import type { ImportMapping } from "@/lib/intubtool/csv";
import { adminBlast } from "../../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** multipart: file (.csv/.xlsx), mode = preview | import, mapping (JSON overrides), dedupe ("0" to skip), verify ("0" to skip) */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const form = await req.formData().catch(() => null);
  if (!form) return fail("Expected multipart form-data");
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Upload a CSV or XLSX file");
  if (file.size > 25 * 1024 * 1024) return fail("File too large (max 25 MB)");
  let matrix: string[][];
  try {
    matrix = await readSpreadsheet({ name: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
  } catch (e) {
    return fail(`Could not read file (${(e as Error).message})`);
  }
  if (matrix.length < 2) return fail("File has no data rows");
  const [headers, ...rows] = matrix;
  let mapping: ImportMapping = blastMapping(headers);
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
  const { parsed, noEmail, duplicateInFile } = parseBlastRows(headers, rows, mapping);
  if (String(form.get("mode") || "preview") !== "import")
    return ok({ headers, mapping, rows: rows.length, parsed: parsed.length, noEmail, duplicateInFile, sample: parsed.slice(0, 8), emailDetected: mapping.email != null || parsed.length > 0 });
  if (!parsed.length) return fail("No rows with a valid email address");
  const summary = await importBlastLeads(r.blast.id, parsed, { dedupe: String(form.get("dedupe") ?? "1") !== "0", verify: String(form.get("verify") ?? (r.blast.verifyBeforeSend ? "1" : "0")) !== "0" });
  return ok({ ...summary, rows: rows.length, parsed: parsed.length, noEmail, duplicateInFile });
}
