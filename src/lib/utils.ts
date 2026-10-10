import type { Settings } from "@/lib/defaults";

export const splitLines = (s: string | null | undefined) =>
  (s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function whatsappLink(settings: Pick<Settings, "whatsapp_number">, text?: string) {
  const base = `https://wa.me/${settings.whatsapp_number.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, "")}`;

export function fillTemplate(text: string, settings: Settings) {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in settings ? settings[key as keyof Settings] : m));
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function readingTime(html: string) {
  const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
