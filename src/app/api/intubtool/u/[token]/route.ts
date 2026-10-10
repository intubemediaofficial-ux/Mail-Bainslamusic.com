import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const page = (title: string, msg: string) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b14;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.c{max-width:420px;padding:32px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:#12121f;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:rgba(255,255,255,.6);margin:0}</style></head>
<body><div class="c"><h1>${title}</h1><p>${msg}</p></div></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );

async function unsubscribe(token: string) {
  const lead = await prisma.lead.findUnique({ where: { unsubToken: token } });
  if (!lead) return page("Link not valid", "This unsubscribe link is invalid or has expired.");
  await prisma.lead.update({ where: { id: lead.id }, data: { unsubscribed: true } });
  await prisma.campaignLead.updateMany({ where: { leadId: lead.id, status: { in: ["pending", "active"] } }, data: { status: "unsubscribed", nextSendAt: null } });
  return page("You're unsubscribed", `${lead.email || "This address"} will not receive any further emails from us.`);
}

export async function GET(_: Request, { params }: { params: { token: string } }) {
  return unsubscribe(params.token);
}

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post). */
export async function POST(_: Request, { params }: { params: { token: string } }) {
  return unsubscribe(params.token);
}
