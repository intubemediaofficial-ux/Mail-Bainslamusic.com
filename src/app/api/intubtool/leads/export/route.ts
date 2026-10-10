import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { leadWhere } from "@/lib/intubtool/lead-query";
import { toCsv } from "@/lib/intubtool/csv";
import { getList } from "@/lib/intubtool/lists";
import { getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

const COLS: [string, string][] = [
  ["Company", "company"],
  ["Full Name", "fullName"],
  ["First Name", "firstName"],
  ["Last Name", "lastName"],
  ["Title", "title"],
  ["Category", "category"],
  ["Lists", "lists"],
  ["Location", "location"],
  ["Email", "email"],
  ["Email Status", "emailStatus"],
  ["Phone", "phone"],
  ["LinkedIn URL", "linkedinUrl"],
  ["Company Domain", "companyDomain"],
  ["Company LinkedIn", "companyUrl"],
  ["All Emails", "emails"],
  ["All Phones", "phones"],
  ["Source", "source"],
  ["Enrich Status", "enrichStatus"],
  ["Unsubscribed", "unsubscribed"],
  ["Notes", "notes"],
  ["Added", "createdAt"],
];

const flattenJson = (v: string | null, key: string) => {
  if (!v) return "";
  try {
    const arr = JSON.parse(v) as Record<string, string>[];
    return arr.map((x) => x[key] + (x.type ? ` (${x.type}${x.status ? ", " + x.status : ""})` : "")).join("; ");
  } catch {
    return v;
  }
};

export async function GET(req: Request) {
  const scope = await getScope();
  if (!scope) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const fmt = sp.get("format") === "xlsx" ? "xlsx" : "csv";
  const leads = await prisma.lead.findMany({ where: leadWhere(sp, scope), orderBy: [{ company: "asc" }, { fullName: "asc" }], take: 20000, include: { lists: { select: { list: { select: { name: true } } } } } });
  const rows = leads.map((l) =>
    COLS.map(([, k]) => {
      if (k === "lists") return l.lists.map((m) => m.list.name).join("; ");
      const v = l[k as keyof typeof l];
      if (k === "emails") return flattenJson(l.emails, "email");
      if (k === "phones") return flattenJson(l.phones, "phone");
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (typeof v === "boolean") return v ? "yes" : "";
      return v == null ? "" : String(v);
    })
  );
  const listName = sp.get("list") && sp.get("list") !== "none" ? (await getList(scope, sp.get("list")!))?.name : null;
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `intubtool-${listName ? listName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "leads"}-${stamp}`;

  if (fmt === "csv") {
    const csv = toCsv(COLS.map(([h]) => h), rows);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.columns = COLS.map(([h, k]) => ({ header: h, key: k, width: k === "fullName" || k === "company" || k === "title" ? 28 : k === "linkedinUrl" || k === "emails" ? 40 : 18 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: `${ws.getColumn(COLS.length).letter}1` };
  for (const r of rows) ws.addRow(r);
  // group by company visually: one sheet per company is overkill, but a summary sheet helps
  const summary = wb.addWorksheet("By Company");
  summary.columns = [
    { header: "Company", key: "c", width: 32 },
    { header: "Leads", key: "n", width: 10 },
    { header: "With Email", key: "e", width: 12 },
    { header: "With Phone", key: "p", width: 12 },
  ];
  summary.getRow(1).font = { bold: true };
  const byCo = new Map<string, { n: number; e: number; p: number }>();
  for (const l of leads) {
    const s = byCo.get(l.company) || { n: 0, e: 0, p: 0 };
    s.n++;
    if (l.email) s.e++;
    if (l.phone) s.p++;
    byCo.set(l.company, s);
  }
  byCo.forEach((s, c) => summary.addRow({ c, ...s }));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
