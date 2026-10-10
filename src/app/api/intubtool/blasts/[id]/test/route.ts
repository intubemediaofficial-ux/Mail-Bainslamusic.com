import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/intubtool/settings";
import { newMessageId, sendMail } from "@/lib/intubtool/mailer";
import { renderBlastMail, variantFor } from "@/lib/intubtool/blast-runner";
import { adminBlast } from "../../_lib";

export const dynamic = "force-dynamic";

/** Sends the template (as account #N would) to a test address, using the first lead of the list (or a dummy) for variables. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const r = await adminBlast(params.id);
  if ("error" in r) return r.error;
  const b = await readJson<{ accountId?: string; to?: string; kind?: "initial" | "followup" }>(req);
  const to = (b?.to || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return fail("Enter a valid test email");
  const account = b?.accountId ? await prisma.blastAccount.findFirst({ where: { id: b.accountId, blastId: r.blast.id } }) : await prisma.blastAccount.findFirst({ where: { blastId: r.blast.id, enabled: true }, orderBy: { order: "asc" } });
  if (!account) return fail("No sender account selected");
  const lead =
    (await prisma.blastLead.findFirst({ where: { blastId: r.blast.id }, orderBy: { serial: "asc" } })) ||
    ({ id: "test", blastId: r.blast.id, serial: 0, email: to, fullName: "Test Person", firstName: "Test", company: "Example Co", title: "Founder", phone: null, extra: null, status: "pending", statusNote: null, verifyStatus: "none", vip: false, replyTag: null, notes: null, accountId: null, sentAt: null, followUpAt: null, followUpSentAt: null, repliedAt: null, bouncedAt: null, unsubToken: "test", createdAt: new Date(), updatedAt: new Date() } as const);
  const s = await getSettings(account.ownerId);
  try {
    const mail = await renderBlastMail(r.blast, account, { ...lead }, s, b?.kind === "followup" ? "followup" : "initial", variantFor(r.blast, account));
    if (!mail.subject || !mail.text) return fail("Template is empty");
    await sendMail({ to, subject: `[TEST #${account.order}] ${mail.subject}`, html: mail.html, text: mail.text, messageId: newMessageId("kvspt.com"), fromName: s.from_name || account.label, replyTo: s.reply_to }, s);
    return ok({ message: `Test sent to ${to} from #${account.order} ${account.email}` });
  } catch (e) {
    return fail((e as Error).message);
  }
}
