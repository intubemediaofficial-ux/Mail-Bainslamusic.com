"use client";

import type { Block } from "@prisma/client";
import Link from "next/link";
import CollectionEditor from "@/components/admin/CollectionEditor";
import IconSelect from "@/components/admin/IconSelect";
import { Field, Input, Textarea, Toggle } from "@/components/admin/ui";
import { BLOCK_SECTIONS, type BlockSection } from "@/lib/defaults";
import { getIcon } from "@/lib/icons";

const isSection = (s?: string): s is BlockSection => !!s && s in BLOCK_SECTIONS;

export default function BlocksEditor({ section }: { section?: string }) {
  const current: BlockSection = isSection(section) ? section : "stats";
  const meta = BLOCK_SECTIONS[current];

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(BLOCK_SECTIONS) as BlockSection[]).map((key) => (
          <Link
            key={key}
            href={`/admin/blocks?section=${key}`}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              key === current ? "border-fuchsia-500 bg-fuchsia-500/15 text-white" : "border-white/10 bg-white/5 text-white/65 hover:text-white"
            }`}
          >
            {BLOCK_SECTIONS[key].label}
          </Link>
        ))}
      </div>

      <CollectionEditor<Block>
        key={current}
        title={meta.label}
        description="Repeatable content blocks used in the sections of the homepage and about page."
        resource="blocks"
        query={`?section=${current}`}
        emptyLabel="No blocks in this section yet."
        newLabel="New block"
        blank={() => ({ section: current, icon: meta.hasIcon ? "Sparkles" : null, title: "", text: "", sortOrder: 0, active: true })}
        renderRow={(b) => {
          const Icon = getIcon(b.icon);
          return (
            <div className="flex items-center gap-3">
              {meta.hasIcon && (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-400">
                  <Icon className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{b.title}</p>
                <p className="truncate text-xs text-white/50">{b.text}</p>
              </div>
            </div>
          );
        }}
        renderForm={(d, set) => (
          <div className="grid gap-5">
            <Field label={meta.titleLabel}>
              <Input required value={d.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label={meta.textLabel}>
              <Textarea value={d.text} onChange={(e) => set({ text: e.target.value })} />
            </Field>
            {meta.hasIcon && (
              <Field label="Icon">
                <IconSelect value={d.icon ?? ""} onChange={(icon) => set({ icon: icon || null })} allowNone />
              </Field>
            )}
            <Toggle checked={d.active} onChange={(active) => set({ active })} label="Visible on website" />
          </div>
        )}
      />
    </div>
  );
}
