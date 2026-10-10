import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/content";

type Payload = {
  name?: string;
  email?: string;
  phone?: string;
  service?: string;
  message?: string;
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const name = body.name?.trim().slice(0, 200) ?? "";
  const email = body.email?.trim().slice(0, 200) ?? "";
  const phone = body.phone?.trim().slice(0, 50) ?? "";
  const service = body.service?.trim().slice(0, 200) ?? "";
  const message = body.message?.trim() ?? "";

  if (!name || !email || !message) {
    return NextResponse.json({ ok: false, error: "Name, email and message are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email address" }, { status: 400 });
  }
  if (message.length > 5000) {
    return NextResponse.json({ ok: false, error: "Message is too long" }, { status: 400 });
  }

  try {
    await prisma.enquiry.create({
      data: { name, email, phone: phone || null, service: service || null, message },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save your message. Please try again." }, { status: 500 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const settings = await getSettings();
    const to = process.env.CONTACT_TO_EMAIL || settings.email;
    const from = process.env.CONTACT_FROM_EMAIL || `${settings.company_name} Website <onboarding@resend.dev>`;
    const html = `
      <h2>New enquiry from ${escapeHtml(settings.company_name)} website</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(phone || "-")}</p>
      <p><strong>Service:</strong> ${escapeHtml(service || "-")}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
    `;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `Website enquiry: ${service || "General"} — ${name}`,
        html,
      }),
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
