import ExcelJS from "exceljs";
import { parseCsv } from "./csv";

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return typeof v.text === "string" ? v.text : cellText(v.text as ExcelJS.CellValue);
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("hyperlink" in v) return String(v.hyperlink);
  }
  return String(v);
};

/** Reads CSV or XLSX into a matrix of strings (first sheet only for XLSX). */
export async function readSpreadsheet(file: { name: string; buffer: Buffer }): Promise<string[][]> {
  const lower = file.name.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || file.buffer.subarray(0, 2).toString("binary") === "PK";
  if (!isXlsx) return parseCsv(file.buffer.toString("utf8"));

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as ExcelJS.CellValue[]; // 1-based
    const out: string[] = [];
    for (let i = 1; i < vals.length; i++) out.push(cellText(vals[i]).trim());
    if (out.some(Boolean)) rows.push(out);
  });
  return rows;
}
