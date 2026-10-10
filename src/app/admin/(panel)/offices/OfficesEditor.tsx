"use client";

import type { Office } from "@prisma/client";
import { MapPin } from "lucide-react";
import CollectionEditor from "@/components/admin/CollectionEditor";
import { Field, Input, Textarea, Toggle } from "@/components/admin/ui";

export default function OfficesEditor() {
  return (
    <CollectionEditor<Office>
      title="Offices"
      description="Office addresses shown on the homepage, about, contact page and footer."
      resource="offices"
      emptyLabel="No offices yet."
      newLabel="New office"
      blank={() => ({ label: "", city: "", country: "", lines: "", mapQuery: "", sortOrder: 0, active: true })}
      renderRow={(o) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-400">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-white">
              {o.label} <span className="text-white/40">· {o.city}, {o.country}</span>
            </p>
            <p className="truncate text-xs text-white/50">{o.lines.split("\n").join(", ")}</p>
          </div>
        </div>
      )}
      renderForm={(d, set) => (
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Label" hint="e.g. UK Office">
            <Input value={d.label} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label="City">
            <Input required value={d.city} onChange={(e) => set({ city: e.target.value })} />
          </Field>
          <Field label="Country">
            <Input value={d.country} onChange={(e) => set({ country: e.target.value })} />
          </Field>
          <Field label="Google Maps search" hint="Address text used for the embedded map">
            <Input value={d.mapQuery} onChange={(e) => set({ mapQuery: e.target.value })} />
          </Field>
          <Field label="Address lines" hint="One per line" className="md:col-span-2">
            <Textarea value={d.lines} onChange={(e) => set({ lines: e.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Toggle checked={d.active} onChange={(active) => set({ active })} label="Visible on website" />
          </div>
        </div>
      )}
    />
  );
}
