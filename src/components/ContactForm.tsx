"use client";

import { useState, type FormEvent } from "react";
import { Send, Loader2, CheckCircle2, MessageCircle } from "lucide-react";
type Status = "idle" | "sending" | "sent" | "error";

export default function ContactForm({
  initialService = "",
  serviceTitles,
  companyName,
  email,
  whatsapp,
}: {
  initialService?: string;
  serviceTitles: string[];
  companyName: string;
  email: string;
  whatsapp: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    service: serviceTitles.includes(initialService) ? initialService : "",
    message: "",
  });

  const update = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const whatsappText = encodeURIComponent(
    `Hi ${companyName},\n\nName: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone}\nService: ${form.service}\n\n${form.message}`
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data: { ok: boolean; error?: string } = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong");
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "sent") {
    return (
      <div className="card flex flex-col items-center p-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-400" />
        <h3 className="mt-4 text-xl font-semibold text-white">Thank you, {form.name.split(" ")[0]}!</h3>
        <p className="mt-2 max-w-sm text-sm text-white/60">
          We have received your message and will get back to you within 24 hours at {form.email}.
        </p>
        <a
          href={`${whatsapp}?text=${whatsappText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary mt-6"
        >
          <MessageCircle className="h-4 w-4" /> Also send on WhatsApp
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-white/80">
            Full name *
          </label>
          <input id="name" required className="input" placeholder="Your name" value={form.name} onChange={update("name")} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-white/80">
            Email *
          </label>
          <input
            id="email"
            type="email"
            required
            className="input"
            placeholder="you@example.com"
            value={form.email}
            onChange={update("email")}
          />
        </div>
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-white/80">
            Phone / WhatsApp
          </label>
          <input id="phone" type="tel" className="input" placeholder="+91 98765 43210" value={form.phone} onChange={update("phone")} />
        </div>
        <div>
          <label htmlFor="service" className="mb-1.5 block text-sm font-medium text-white/80">
            Service interested in
          </label>
          <select id="service" className="input" value={form.service} onChange={update("service")}>
            <option value="" className="bg-[#07070d]">
              Select a service
            </option>
            {serviceTitles.map((t) => (
              <option key={t} value={t} className="bg-[#07070d]">
                {t}
              </option>
            ))}
            <option value="Other" className="bg-[#07070d]">
              Other
            </option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-white/80">
          Message *
        </label>
        <textarea
          id="message"
          required
          rows={5}
          className="input resize-none"
          placeholder="Tell us about your project, channel or catalogue..."
          value={form.message}
          onChange={update("message")}
        />
      </div>

      {status === "error" && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}. You can also reach us directly on WhatsApp or at {email}.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={status === "sending"} className="btn-primary disabled:opacity-60">
          {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {status === "sending" ? "Sending..." : "Send Message"}
        </button>
        <a
          href={`${whatsapp}?text=${whatsappText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
        >
          <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
        </a>
      </div>
    </form>
  );
}
