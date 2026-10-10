"use client";

import type { Service } from "@prisma/client";
import CollectionEditor from "@/components/admin/CollectionEditor";
import IconSelect from "@/components/admin/IconSelect";
import { Field, Input, Select, Textarea, Toggle, slugify } from "@/components/admin/ui";
import { ACCENTS } from "@/lib/defaults";
import { getIcon } from "@/lib/icons";

export default function ServicesEditor() {
  return (
    <CollectionEditor<Service>
      title="Services"
      description="The services shown on the homepage, services page, footer and contact form."
      resource="services"
      emptyLabel="No services yet — add your first one."
      newLabel="New service"
      blank={() => ({
        slug: "",
        title: "",
        short: "",
        description: "",
        points: "",
        icon: "Sparkles",
        accent: ACCENTS[0],
        sortOrder: 0,
        active: true,
      })}
      renderRow={(s) => {
        const Icon = getIcon(s.icon);
        return (
          <div className="flex items-center gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${s.accent} text-white`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{s.title}</p>
              <p className="truncate text-xs text-white/50">{s.short}</p>
            </div>
          </div>
        );
      }}
      renderForm={(d, set) => (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Title">
            <Input required value={d.title} onChange={(e) => set({ title: e.target.value, slug: d.slug || slugify(e.target.value) })} />
          </Field>
          <Field label="Slug" hint="Used in URLs, e.g. /services#slug">
            <Input value={d.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} />
          </Field>
          <Field label="Short description" className="md:col-span-2">
            <Input value={d.short} onChange={(e) => set({ short: e.target.value })} />
          </Field>
          <Field label="Full description" className="md:col-span-2">
            <Textarea value={d.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Key points" hint="One per line" className="md:col-span-2">
            <Textarea value={d.points} onChange={(e) => set({ points: e.target.value })} />
          </Field>
          <Field label="Icon">
            <IconSelect value={d.icon} onChange={(icon) => set({ icon })} />
          </Field>
          <Field label="Colour">
            <div className="flex items-center gap-3">
              <span className={`h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br ${d.accent}`} />
              <Select value={d.accent} onChange={(e) => set({ accent: e.target.value })}>
                {ACCENTS.map((a) => (
                  <option key={a} value={a}>
                    {a.replace("from-", "").replace(" to-", " → ")}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
          <div className="md:col-span-2">
            <Toggle checked={d.active} onChange={(active) => set({ active })} label="Visible on website" />
          </div>
        </div>
      )}
    />
  );
}
