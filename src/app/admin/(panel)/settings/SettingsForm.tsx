"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, Textarea, api, useToast } from "@/components/admin/ui";
import type { SettingKey, Settings } from "@/lib/defaults";
import ImagePicker from "@/components/admin/ImagePicker";

type FieldDef = { key: SettingKey; label: string; hint?: string; multiline?: boolean; image?: boolean };
type Group = { id: string; label: string; description: string; fields: FieldDef[] };

const GROUPS: Group[] = [
  {
    id: "company",
    label: "Company",
    description: "Brand, legal name and contact details shown across the website.",
    fields: [
      { key: "company_name", label: "Brand name" },
      { key: "legal_name", label: "Legal name", hint: "Used in footer copyright & structured data" },
      { key: "tagline", label: "Tagline" },
      { key: "description", label: "Company description", multiline: true },
      { key: "site_url", label: "Website URL", hint: "Used for SEO / sitemap" },
      { key: "footer_note", label: "Footer note" },
      { key: "nav_cta_label", label: "Navbar button label" },
    ],
  },
  {
    id: "contact",
    label: "Contact & Social",
    description: "Email, phone, WhatsApp and social profile links.",
    fields: [
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone (display)" },
      { key: "whatsapp_number", label: "WhatsApp number", hint: "Digits only with country code, e.g. 919782078301" },
      { key: "whatsapp_greeting", label: "WhatsApp pre-filled message", multiline: true },
      { key: "hours", label: "Working hours" },
      { key: "social_youtube", label: "YouTube URL" },
      { key: "social_instagram", label: "Instagram URL" },
      { key: "social_facebook", label: "Facebook URL" },
      { key: "social_linkedin", label: "LinkedIn URL" },
    ],
  },
  {
    id: "home",
    label: "Homepage",
    description: "Hero, sections headings and call-to-action text on the homepage.",
    fields: [
      { key: "hero_badge", label: "Hero badge" },
      { key: "hero_title", label: "Hero title" },
      { key: "hero_highlight", label: "Hero highlighted words", hint: "Shown with gradient after the title" },
      { key: "hero_subtitle", label: "Hero subtitle", multiline: true },
      { key: "hero_primary_label", label: "Primary button label" },
      { key: "hero_primary_href", label: "Primary button link" },
      { key: "hero_secondary_label", label: "Secondary button label" },
      { key: "hero_secondary_href", label: "Secondary button link" },
      { key: "home_services_eyebrow", label: "Services eyebrow" },
      { key: "home_services_title", label: "Services title" },
      { key: "home_services_description", label: "Services description", multiline: true },
      { key: "home_services_count", label: "Services shown on homepage", hint: "Number, e.g. 6" },
      { key: "why_eyebrow", label: "Why-us eyebrow" },
      { key: "why_title", label: "Why-us title" },
      { key: "why_description", label: "Why-us description", multiline: true },
      { key: "offices_eyebrow", label: "Offices eyebrow" },
      { key: "offices_title", label: "Offices title" },
      { key: "offices_description", label: "Offices description", multiline: true },
      { key: "cta_title", label: "CTA title" },
      { key: "cta_text", label: "CTA text", hint: "You can use {email} and {phone}", multiline: true },
      { key: "cta_primary_label", label: "CTA primary button" },
      { key: "cta_secondary_label", label: "CTA WhatsApp button" },
    ],
  },
  {
    id: "microdrama",
    label: "Micro Drama App",
    description: "The product showcase section on the homepage.",
    fields: [
      { key: "microdrama_eyebrow", label: "Eyebrow" },
      { key: "microdrama_title", label: "Title", hint: "Leave empty to hide the section" },
      { key: "microdrama_description", label: "Description", multiline: true },
      { key: "microdrama_points", label: "Bullet points", hint: "One per line", multiline: true },
      { key: "microdrama_primary_label", label: "Primary button label" },
      { key: "microdrama_primary_href", label: "Primary button link" },
      { key: "microdrama_secondary_label", label: "Secondary button label" },
      { key: "microdrama_secondary_href", label: "Secondary button link" },
      { key: "microdrama_phone_badge", label: "Phone mockup badge" },
      { key: "microdrama_phone_title", label: "Phone mockup title" },
      { key: "microdrama_phone_subtitle", label: "Phone mockup subtitle" },
    ],
  },
  {
    id: "pages",
    label: "Services / About / Contact / Blog",
    description: "Headings and intro text of the inner pages.",
    fields: [
      { key: "services_eyebrow", label: "Services page eyebrow" },
      { key: "services_title", label: "Services page title" },
      { key: "services_description", label: "Services page description", multiline: true },
      { key: "services_cta_title", label: "Services CTA title" },
      { key: "services_cta_text", label: "Services CTA text", multiline: true },
      { key: "about_eyebrow", label: "About eyebrow" },
      { key: "about_title", label: "About title" },
      { key: "about_description", label: "About description", multiline: true },
      { key: "about_mission_title", label: "Mission title" },
      { key: "about_mission", label: "Mission", multiline: true },
      { key: "about_vision_title", label: "Vision title" },
      { key: "about_vision", label: "Vision", multiline: true },
      { key: "about_journey_title", label: "Journey heading" },
      { key: "about_values_title", label: "Values heading" },
      { key: "contact_eyebrow", label: "Contact eyebrow" },
      { key: "contact_title", label: "Contact title" },
      { key: "contact_description", label: "Contact description", multiline: true },
      { key: "blog_eyebrow", label: "Blog eyebrow" },
      { key: "blog_title", label: "Blog title" },
      { key: "blog_description", label: "Blog description", multiline: true },
    ],
  },
  {
    id: "legal",
    label: "Legal pages",
    description: "Privacy Policy (/privacy) and Terms of Service (/terms). HTML allowed (<h2>, <p>, <a>).",
    fields: [
      { key: "privacy_title", label: "Privacy page title" },
      { key: "privacy_html", label: "Privacy Policy content (HTML)", multiline: true },
      { key: "terms_title", label: "Terms page title" },
      { key: "terms_html", label: "Terms of Service content (HTML)", multiline: true },
    ],
  },
  {
    id: "seo",
    label: "SEO",
    description: "Default meta tags and social share image.",
    fields: [
      { key: "seo_title", label: "Default meta title" },
      { key: "seo_description", label: "Default meta description", multiline: true },
      { key: "seo_keywords", label: "Keywords", hint: "Comma separated", multiline: true },
      { key: "seo_og_image", label: "Social share image (OG)", image: true },
    ],
  },
];

export default function SettingsForm({ initial }: { initial: Settings }) {
  const [values, setValues] = useState<Settings>(initial);
  const [saved, setSaved] = useState<Settings>(initial);
  const [tab, setTab] = useState(GROUPS[0].id);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const group = GROUPS.find((g) => g.id === tab) ?? GROUPS[0];
  const dirtyKeys = (Object.keys(values) as SettingKey[]).filter((k) => values[k] !== saved[k]);

  async function save() {
    if (dirtyKeys.length === 0) return;
    setSaving(true);
    try {
      const payload: Partial<Settings> = {};
      for (const k of dirtyKeys) payload[k] = values[k];
      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(payload) });
      setSaved(values);
      toast.success("Settings saved — website updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: SettingKey) => (v: string) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <div>
      <PageHeader
        title="Site settings"
        description="Text, contact details and SEO used everywhere on the website."
        actions={
          <Button onClick={save} loading={saving} disabled={dirtyKeys.length === 0}>
            <Save className="h-4 w-4" /> Save {dirtyKeys.length > 0 && `(${dirtyKeys.length})`}
          </Button>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex gap-2 overflow-x-auto lg:w-56 lg:flex-col">
          {GROUPS.map((g) => {
            const count = g.fields.filter((f) => dirtyKeys.includes(f.key)).length;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setTab(g.id)}
                className={`flex shrink-0 items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm font-medium transition ${
                  tab === g.id ? "bg-fuchsia-600/20 text-white ring-1 ring-fuchsia-500/50" : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
              >
                {g.label}
                {count > 0 && <span className="ml-2 rounded-full bg-fuchsia-500 px-1.5 text-[10px] font-bold text-white">{count}</span>}
              </button>
            );
          })}
        </nav>

        <Card className="flex-1 p-6">
          <h2 className="font-semibold text-white">{group.label}</h2>
          <p className="mt-1 text-sm text-white/50">{group.description}</p>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {group.fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} className={f.multiline || f.image ? "md:col-span-2" : ""}>
                {f.image ? (
                  <ImagePicker value={values[f.key]} onChange={set(f.key)} />
                ) : f.multiline ? (
                  <Textarea value={values[f.key]} onChange={(e) => set(f.key)(e.target.value)} />
                ) : (
                  <Input value={values[f.key]} onChange={(e) => set(f.key)(e.target.value)} />
                )}
              </Field>
            ))}
          </div>
        </Card>
      </div>
      {toast.toast}
    </div>
  );
}
