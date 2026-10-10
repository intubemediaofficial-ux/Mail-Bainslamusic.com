import { ok, fail, readJson } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { adminEmails, logEvent, ownerOf, pickSender } from "@/lib/intubtool/account-health";
import { baseUrl, newMessageId, sendMail } from "@/lib/intubtool/mailer";
import { getSettings } from "@/lib/intubtool/settings";
import { denied } from "../../blasts/_lib";

export const dynamic = "force-dynamic";

/** POST { ownerKey } → emails the member a link that signs them in and opens Settings → Gmail with “Connect with Google” auto-started. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return denied();
  const b = await readJson<{ ownerKey?: string }>(req);
  if (!b?.ownerKey) return fail("ownerKey required");
  const owner = ownerOf(b.ownerKey);
  const user = owner ? await prisma.user.findUnique({ where: { id: owner }, select: { email: true, name: true } }) : null;
  if (owner && !user) return fail("User not found", 404);
  const g = await getSettings(null);
  const to = owner ? user!.email : (g.alert_email || (await adminEmails()).join(", ")).trim();
  if (!to) return fail("No email address to send the link to");
  const s = await getSettings(owner);
  const gmailEmail = s.gmail_oauth_email || s.gmail_user || "your Gmail";
  const sender = await pickSender(owner);
  if (!sender) return fail("No working Gmail account available to send the link from — connect one first (Settings → Gmail or App Password).");
  const link = `${baseUrl(g)}/intubtool/login?callbackUrl=${encodeURIComponent("/intubtool/settings?connect=1")}`;
  const name = user?.name || user?.email || "there";
  await sendMail(
    {
      to,
      subject: `IntubTool: please reconnect ${gmailEmail}`,
      text: [
        `Hi ${name},`,
        ``,
        `The Gmail account ${gmailEmail} is no longer connected to IntubTool, so no emails can be sent from it.`,
        ``,
        `Reconnect in one click (sign in with your IntubTool login if asked, then approve Google access):`,
        link,
        ``,
        `If Google shows “Google hasn’t verified this app”, click Advanced → Go to kvspt.com → Allow.`,
        ``,
        `— IntubTool (${admin.email})`,
      ].join("\n"),
      messageId: newMessageId("kvspt.com"),
      fromName: "IntubTool",
      replyTo: admin.email,
    },
    sender
  );
  await logEvent(owner, gmailEmail, "reconnect_link", `Sent to ${to} by ${admin.email}`);
  return ok({ message: `Reconnect link sent to ${to}` });
}
