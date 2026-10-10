import type { Lead } from "@prisma/client";

export type TemplateVars = Record<string, string>;

export function leadVars(lead: Lead, extra: TemplateVars = {}): TemplateVars {
  const first = lead.firstName || lead.fullName.split(/\s+/)[0] || "";
  return {
    first_name: first,
    last_name: lead.lastName || "",
    full_name: lead.fullName,
    name: first,
    company: lead.company,
    title: lead.title || "",
    location: lead.location || "",
    email: lead.email || "",
    linkedin_url: lead.linkedinUrl || "",
    ...extra,
  };
}

/** Replaces {{var}} and {{var|fallback}} tokens. Unknown vars become empty strings. */
export function renderTemplate(tpl: string, vars: TemplateVars) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g, (_, key: string, fallback?: string) => {
    const v = vars[key];
    return v && v.trim() ? v : (fallback ?? "");
  });
}

export function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:#4f46e5">${u}</a>`);
  return linked
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;line-height:1.55">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export function extractVars(tpl: string) {
  return Array.from(new Set(Array.from(tpl.matchAll(/\{\{\s*([a-zA-Z0-9_]+)/g)).map((m) => m[1])));
}
