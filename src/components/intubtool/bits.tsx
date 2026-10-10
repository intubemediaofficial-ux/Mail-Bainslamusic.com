"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/admin/ui";

export function Stat({ label, value, sub, tone = "default", icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "cyan" | "green" | "amber" | "red"; icon?: ReactNode }) {
  const ring = { default: "", cyan: "ring-1 ring-cyan-500/30", green: "ring-1 ring-emerald-500/30", amber: "ring-1 ring-amber-500/30", red: "ring-1 ring-red-500/30" }[tone];
  return (
    <Card className={`p-5 ${ring}`}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/50">{label}</p>
        {icon && <span className="text-white/40">{icon}</span>}
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-white/50">{sub}</p>}
    </Card>
  );
}

const TONES: Record<string, string> = {
  gray: "bg-white/10 text-white/70",
  cyan: "bg-cyan-500/15 text-cyan-300",
  green: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  red: "bg-red-500/15 text-red-300",
  violet: "bg-violet-500/15 text-violet-300",
};

export function Badge({ children, tone = "gray", title }: { children: ReactNode; tone?: keyof typeof TONES; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export const statusTone = (s: string): keyof typeof TONES =>
  ({ done: "green", running: "cyan", queued: "amber", failed: "red", error: "red", cancelled: "gray", not_found: "amber", cached: "green", sent: "green", bounced: "red", replied: "violet", paused: "amber", completed: "gray", draft: "gray", active: "cyan", pending: "amber" })[s] || "gray";

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
      <p className="font-semibold text-white/80">{title}</p>
      {children && <div className="mt-2 text-sm text-white/50">{children}</div>}
    </div>
  );
}

export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export const timeAgo = (d?: string | Date | null) => {
  if (!d) return "—";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
