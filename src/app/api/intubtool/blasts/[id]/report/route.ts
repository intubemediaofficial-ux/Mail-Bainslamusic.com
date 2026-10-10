import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { adminBlast } from "../../_lib";

export const dynamic = "force-dynamic";

const fmt = (d?: Date | null) => (d ? d.toISOString().replace("T", " ").slice(0, 16) : "");

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const [accounts, leads, messages] = await Promise.all([
    prisma.blastAccount.findMany({ where: { blastId: r.blast.id }, orderBy: { order: "asc" } }),
    prisma.blastLead.findMany({ where: { blastId: r.blast.id }, orderBy: { serial: "asc" }, include: { account: { select: { order: true, email: true } } } }),
    prisma.blastMessage.findMany({ where: { blastId: r.blast.id }, orderBy: { sentAt: "asc" }, include: { lead: { select: { serial: true, fullName: true, company: true, title: true, phone: true } }, account: { select: { order: true } } } }),
  ]);
  const wb = new ExcelJS.Workbook();
  const add = (name: string, cols: string[], rows: (string | number | null | undefined)[][]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.max(12, Math.min(40, c.length + 6)) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    rows.forEach((row) => ws.addRow(row));
  };
  const byAcc = (id: string) => messages.filter((m) => m.accountId === id);
  add(
    "Accounts",
    ["#", "Email", "Label", "Included", "Quota", "Warm-up", "Last range", "Sent", "Follow-ups", "Replied", "Bounced", "Failed", "Blocked until", "Last error"],
    accounts.map((a) => {
      const ms = byAcc(a.id);
      return [
        a.order, a.email, a.label || "", a.enabled ? "yes" : "no", a.quota, a.warmup ? `${a.warmupStart} +${a.warmupStep}/${a.warmupEveryDays}d` : "",
        a.rangeStart ? `${a.rangeStart}–${a.rangeEnd}` : "", ms.filter((m) => m.kind === "initial" && m.status === "sent").length, ms.filter((m) => m.kind === "followup" && m.status === "sent").length,
        leads.filter((l) => l.accountId === a.id && l.status === "replied").length, ms.filter((m) => m.status === "bounced").length, ms.filter((m) => m.status === "failed").length, fmt(a.blockedUntil), a.lastError || "",
      ];
    })
  );
  const leadRow = (l: (typeof leads)[number]) => [
    l.serial, l.email, l.fullName, l.company || "", l.title || "", l.phone || "", l.status, l.statusNote || "", l.verifyStatus, l.vip ? "yes" : "", l.account ? `#${l.account.order} ${l.account.email}` : "",
    fmt(l.sentAt), fmt(l.followUpSentAt), fmt(l.repliedAt), fmt(l.bouncedAt), l.replyTag || "", l.notes || "", l.extra || "",
  ];
  const LEAD_COLS = ["#", "Email", "Name", "Company", "Title", "Phone", "Status", "Note", "Verify", "VIP", "Sent via", "Sent at", "Follow-up at", "Replied at", "Bounced at", "Tag", "Notes", "Extra"];
  add("Database", LEAD_COLS, leads.map(leadRow));
  add("Replied", LEAD_COLS, leads.filter((l) => l.repliedAt).map(leadRow));
  add("Bounced", LEAD_COLS, leads.filter((l) => l.status === "bounced").map(leadRow));
  add("No Response", LEAD_COLS, leads.filter((l) => l.sentAt && !l.repliedAt && l.status !== "bounced" && l.status !== "unsubscribed").map(leadRow));
  add("Pending", LEAD_COLS, leads.filter((l) => ["pending", "queued", "hold"].includes(l.status)).map(leadRow));
  add(
    "All Mails",
    ["Lead #", "To", "Name", "Company", "Account #", "From", "Kind", "Template", "Subject", "Sent at", "Status", "Opens", "Clicks", "Replied at", "Reply", "Bounced at", "Bounce reason", "Error"],
    messages.map((m) => [m.lead.serial, m.toEmail, m.lead.fullName, m.lead.company || "", m.account?.order ?? "", m.fromEmail, m.kind, m.variant + 1, m.subject, fmt(m.sentAt), m.status, m.openCount, m.clickCount, fmt(m.repliedAt), m.replySnippet || "", fmt(m.bouncedAt), m.bounceReason || "", m.error || ""])
  );
  const buf = await wb.xlsx.writeBuffer();
  const name = `multi-send-${r.blast.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"` } });
}
