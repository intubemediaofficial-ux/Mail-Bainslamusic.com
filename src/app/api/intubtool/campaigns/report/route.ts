import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/intubtool/csv";
import { campaignWhere, getScope } from "@/lib/intubtool/scope";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";
const when = (d: Date | null) => (d ? d.toLocaleString("en-IN", { timeZone: TZ, hour12: true }) : "");

const MSG_COLS: [string, number][] = [
  ["Campaign", 26], ["Email", 34], ["Name", 26], ["Title", 30], ["Company", 30], ["Phone", 18], ["LinkedIn", 40],
  ["Step", 6], ["Subject", 40], ["Sent At (IST)", 22], ["Status", 10], ["Opens", 7], ["First Opened (IST)", 22],
  ["Replied At (IST)", 22], ["Reply Snippet", 60], ["Bounced At (IST)", 22], ["Bounce Reason", 50], ["Error", 40],
];

const SUMMARY_COLS: [string, number][] = [
  ["Campaign", 28], ["Owner", 28], ["Status", 12], ["Daily Limit", 11], ["Leads", 8], ["Pending", 9], ["Total Sent", 11],
  ["Delivered", 11], ["Bounced", 10], ["Replied", 10], ["No Response", 12], ["Failed", 8], ["Opened (unique)", 15], ["Reply %", 9], ["Bounce %", 9], ["Created (IST)", 22],
];

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export async function GET(req: Request) {
  const scope = await getScope();
  if (!scope) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("campaign") || undefined;
  const fmt = sp.get("format") === "csv" ? "csv" : "xlsx";
  const view = sp.get("view"); // csv only: all | replied | bounced | noresponse

  const campaigns = await prisma.campaign.findMany({
    where: campaignWhere(scope, id),
    orderBy: { createdAt: "asc" },
    include: { owner: { select: { email: true } }, _count: { select: { leads: true } } },
  });
  if (id && !campaigns.length) return new Response("Not found", { status: 404 });
  const ids = campaigns.map((c) => c.id);
  const [messages, pending] = await Promise.all([
    prisma.emailMessage.findMany({
      where: { campaignId: { in: ids } },
      orderBy: { sentAt: "asc" },
      include: { campaign: { select: { name: true } }, lead: { select: { fullName: true, title: true, company: true, phone: true, linkedinUrl: true } } },
    }),
    prisma.campaignLead.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, status: { in: ["pending", "active"] } }, _count: true }),
  ]);
  const pendingBy = new Map(pending.map((p) => [p.campaignId, p._count]));

  const replied = messages.filter((m) => m.repliedAt);
  const bounced = messages.filter((m) => m.status === "bounced");
  // one row per recipient (latest mail) who was delivered to but never replied or bounced
  const byRecipient = new Map<string, (typeof messages)[number][]>();
  for (const m of messages) {
    const k = `${m.campaignId}|${m.toEmail.toLowerCase()}`;
    byRecipient.set(k, [...(byRecipient.get(k) || []), m]);
  }
  const noResponse = Array.from(byRecipient.values())
    .filter((ms) => ms.some((m) => m.status === "sent") && !ms.some((m) => m.repliedAt || m.status === "bounced"))
    .map((ms) => ms[ms.length - 1]);

  const msgRow = (m: (typeof messages)[number]) => [
    m.campaign?.name || "", m.toEmail, m.lead?.fullName || "", m.lead?.title || "", m.lead?.company || "", m.lead?.phone || "", m.lead?.linkedinUrl || "",
    m.stepOrder + 1, m.subject, when(m.sentAt), m.repliedAt ? "replied" : m.status, m.openCount, when(m.firstOpenedAt),
    when(m.repliedAt), m.replySnippet || "", when(m.bouncedAt), m.bounceReason || "", m.error || "",
  ];
  const summaryRow = (c: (typeof campaigns)[number]) => {
    const ms = messages.filter((m) => m.campaignId === c.id);
    const sent = ms.filter((m) => m.status !== "failed").length;
    const bounced = ms.filter((m) => m.status === "bounced").length;
    const replied = ms.filter((m) => m.repliedAt).length;
    return [
      c.name, c.owner?.email || "admin", c.status, c.dailyLimit, c._count.leads, pendingBy.get(c.id) || 0, sent,
      sent - bounced, bounced, replied, noResponse.filter((m) => m.campaignId === c.id).length, ms.length - sent, ms.filter((m) => m.openCount > 0).length, pct(replied, sent), pct(bounced, sent), when(c.createdAt),
    ];
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `intubtool-${id ? campaigns[0].name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "campaigns"}-report-${stamp}`;

  if (fmt === "csv") {
    const rows = view === "replied" ? replied : view === "bounced" ? bounced : view === "noresponse" ? noResponse : messages;
    const csv = toCsv(MSG_COLS.map(([h]) => h), rows.map(msgRow));
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}${view ? "-" + view : ""}.csv"` } });
  }

  const wb = new ExcelJS.Workbook();
  const addSheet = (name: string, cols: [string, number][], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: `${ws.getColumn(cols.length).letter}1` };
    for (const r of rows) ws.addRow(r);
  };
  addSheet("Campaigns", SUMMARY_COLS, campaigns.map(summaryRow));
  addSheet("Replied", MSG_COLS, replied.map(msgRow));
  addSheet("Bounced", MSG_COLS, bounced.map(msgRow));
  addSheet("No Response", MSG_COLS, noResponse.map(msgRow));
  addSheet("All Sent", MSG_COLS, messages.map(msgRow));

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
