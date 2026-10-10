"use client";

import { ICONS } from "@/lib/icons";
import { Select } from "./ui";

export default function IconSelect({ value, onChange, allowNone }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const Icon = ICONS[value];
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-fuchsia-400">
        {Icon && <Icon className="h-5 w-5" />}
      </span>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowNone && <option value="">No icon</option>}
        {Object.keys(ICONS).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    </div>
  );
}
