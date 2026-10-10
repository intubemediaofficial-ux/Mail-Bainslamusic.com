"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, CheckSquare, FolderOpen, Search, Square, Tag, Users, X } from "lucide-react";
import { Button, Input, Modal, api } from "@/components/admin/ui";
import { Badge } from "./bits";

const UNCATEGORIZED = "__none__";
const PAGE = 100;

type Facet = { value: string; label?: string; count: number };
type Facets = { total: number; companies: Facet[]; categories: Facet[]; lists: Facet[] };
type Lead = { id: string; fullName: string; company: string; title: string | null; email: string | null; category: string | null; location: string | null };

type Props = { open: boolean; campaignId: string; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void };

/**
 * Faceted lead picker for campaigns: live name search, company / category / list
 * multi-select with select-all, and per-lead ticking. Picked leads survive filter changes.
 */
export default function LeadPicker({ open, campaignId, onClose, onDone, onError }: Props) {
  const [q, setQ] = useState("");
  const [co, setCo] = useState<Set<string>>(new Set());
  const [cat, setCat] = useState<Set<string>>(new Set());
  const [li, setLi] = useState<Set<string>>(new Set());
  const [facets, setFacets] = useState<Facets | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Map<string, Lead>>(new Map());
  const [busy, setBusy] = useState(false);
  const [showPicked, setShowPicked] = useState(false);
  const reqId = useRef(0);

  const filter = useMemo(() => {
    const sp = new URLSearchParams({ has: "email", unsubscribed: "0", notInCampaign: campaignId });
    if (q.trim()) sp.set("q", q.trim());
    co.forEach((v) => sp.append("co", v));
    cat.forEach((v) => sp.append("cat", v));
    li.forEach((v) => sp.append("li", v));
    return sp.toString();
  }, [q, co, cat, li, campaignId]);

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [f, l] = await Promise.all([
          api<Facets>(`/api/intubtool/leads/facets?${filter}`),
          api<{ total: number; leads: Lead[] }>(`/api/intubtool/leads?${filter}&limit=${PAGE}&sort=name`),
        ]);
        if (id !== reqId.current) return;
        setFacets(f);
        setLeads(l.leads);
        setTotal(l.total);
      } catch (e) {
        if (id === reqId.current) onError((e as Error).message);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [filter, open, onError]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setCo(new Set());
      setCat(new Set());
      setLi(new Set());
      setPicked(new Map());
      setShowPicked(false);
      setFacets(null);
      setLeads([]);
      setTotal(null);
    }
  }, [open]);

  const togglePick = (l: Lead) =>
    setPicked((m) => {
      const n = new Map(m);
      if (n.has(l.id)) n.delete(l.id);
      else n.set(l.id, l);
      return n;
    });
  const allVisiblePicked = leads.length > 0 && leads.every((l) => picked.has(l.id));
  const toggleVisible = () =>
    setPicked((m) => {
      const n = new Map(m);
      if (allVisiblePicked) leads.forEach((l) => n.delete(l.id));
      else leads.forEach((l) => n.set(l.id, l));
      return n;
    });

  const add = async (mode: "picked" | "filter") => {
    setBusy(true);
    try {
      const body = mode === "picked" ? { ids: Array.from(picked.keys()) } : { filter };
      const r = await api<{ added: number; alreadyIn: number; skippedNoEmail: number }>(`/api/intubtool/campaigns/${campaignId}/leads`, { method: "POST", body: JSON.stringify(body) });
      onDone(`${r.added} leads added${r.alreadyIn ? ` · ${r.alreadyIn} already in campaign` : ""}${r.skippedNoEmail ? ` · ${r.skippedNoEmail} skipped (no email)` : ""}`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activeFilters = co.size + cat.size + li.size + (q.trim() ? 1 : 0);
  const clearFilters = () => {
    setQ("");
    setCo(new Set());
    setCat(new Set());
    setLi(new Set());
  };
  const label = (f: Facet) => (f.value === UNCATEGORIZED ? "Uncategorized" : f.label ?? f.value);

  return (
    <Modal open={open} onClose={onClose} title="Add leads to campaign" wide>
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name, title, email or company — results update as you type" className="!pl-9" autoFocus />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <FacetBox icon={<Building2 className="h-3.5 w-3.5" />} title="Companies" items={facets?.companies ?? []} selected={co} onChange={setCo} label={label} placeholder="Search companies…" />
          <FacetBox icon={<Tag className="h-3.5 w-3.5" />} title="Categories" items={facets?.categories ?? []} selected={cat} onChange={setCat} label={label} placeholder="Search categories…" />
          <FacetBox icon={<FolderOpen className="h-3.5 w-3.5" />} title="Contact lists" items={facets?.lists ?? []} selected={li} onChange={setLi} label={label} placeholder="Search lists…" />
        </div>

        {activeFilters > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-white/40">Filters:</span>
            {q.trim() && <Chip onRemove={() => setQ("")}>“{q.trim()}”</Chip>}
            {Array.from(co).map((v) => <Chip key={`co-${v}`} onRemove={() => setCo(del(co, v))}>{v}</Chip>)}
            {Array.from(cat).map((v) => <Chip key={`cat-${v}`} onRemove={() => setCat(del(cat, v))}>{v === UNCATEGORIZED ? "Uncategorized" : v}</Chip>)}
            {Array.from(li).map((v) => <Chip key={`li-${v}`} onRemove={() => setLi(del(li, v))}>{facets?.lists.find((l) => l.value === v)?.label ?? "list"}</Chip>)}
            <button type="button" onClick={clearFilters} className="ml-1 text-white/50 underline-offset-2 hover:text-white hover:underline">Clear all</button>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
            <button type="button" onClick={toggleVisible} disabled={!leads.length} className="flex items-center gap-2 font-semibold text-white/80 hover:text-white disabled:opacity-40">
              {allVisiblePicked ? <CheckSquare className="h-4 w-4 text-cyan-300" /> : <Square className="h-4 w-4" />}
              {allVisiblePicked ? "Unselect shown" : `Select shown (${leads.length})`}
            </button>
            <span className="text-white/50">
              {loading && total === null ? "Loading…" : total === null ? "" : `${total} matching lead${total === 1 ? "" : "s"} with email, not yet in this campaign${total > PAGE ? ` · showing first ${PAGE} — refine to see more` : ""}`}
            </span>
          </div>
          <ul className={`max-h-[38vh] divide-y divide-white/5 overflow-y-auto ${loading ? "opacity-60" : ""}`}>
            {leads.map((l) => {
              const on = picked.has(l.id);
              return (
                <li key={l.id}>
                  <button type="button" onClick={() => togglePick(l)} className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-white/[0.04] ${on ? "bg-cyan-500/10" : ""}`}>
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-cyan-400 bg-cyan-400 text-black" : "border-white/30"}`}>{on && <Check className="h-3 w-3" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">{l.fullName}</span>
                        <span className="truncate text-xs text-white/50">{l.email}</span>
                      </span>
                      <span className="block truncate text-xs text-white/50">{l.title || "—"} · <span className="text-white/70">{l.company}</span>{l.location ? ` · ${l.location}` : ""}</span>
                    </span>
                    {l.category && <Badge tone="cyan">{l.category}</Badge>}
                  </button>
                </li>
              );
            })}
            {!loading && leads.length === 0 && <li className="p-8 text-center text-sm text-white/40">{total === 0 ? "No leads match — every matching lead may already be in this campaign, or lacks an email." : "…"}</li>}
          </ul>
        </div>

        {picked.size > 0 && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => setShowPicked(!showPicked)} className="font-semibold text-cyan-200 hover:text-white">
                {picked.size} selected {showPicked ? "▴" : "▾"}
              </button>
              <button type="button" onClick={() => setPicked(new Map())} className="text-white/50 hover:text-white">Clear selection</button>
            </div>
            {showPicked && (
              <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {Array.from(picked.values()).map((l) => <Chip key={l.id} onRemove={() => togglePick(l)}>{l.fullName} <span className="text-white/40">· {l.company}</span></Chip>)}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant={picked.size ? "secondary" : "primary"} onClick={() => add("filter")} loading={busy && !picked.size} disabled={!total}>
              <Users className="h-4 w-4" /> Add all {total ?? ""} matching
            </Button>
            {picked.size > 0 && (
              <Button onClick={() => add("picked")} loading={busy}>
                <Check className="h-4 w-4" /> Add {picked.size} selected
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

const del = (s: Set<string>, v: string) => {
  const n = new Set(s);
  n.delete(v);
  return n;
};

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/80">
      <span className="truncate">{children}</span>
      <button type="button" onClick={onRemove} className="text-white/40 hover:text-red-300" aria-label="Remove"><X className="h-3 w-3" /></button>
    </span>
  );
}

function FacetBox({ icon, title, items, selected, onChange, label, placeholder }: { icon: React.ReactNode; title: string; items: Facet[]; selected: Set<string>; onChange: (s: Set<string>) => void; label: (f: Facet) => string; placeholder: string }) {
  const [term, setTerm] = useState("");
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    const base = t ? items.filter((f) => label(f).toLowerCase().includes(t)) : items;
    // keep selected values visible even if they fell out of the facet result
    const missing = Array.from(selected).filter((v) => !base.some((f) => f.value === v)).map((v) => ({ value: v, count: 0 }));
    return [...missing, ...base];
  }, [items, term, selected, label]);
  const allShownOn = shown.length > 0 && shown.every((f) => selected.has(f.value));
  const toggleAll = useCallback(() => {
    const n = new Set(selected);
    if (allShownOn) shown.forEach((f) => n.delete(f.value));
    else shown.forEach((f) => n.add(f.value));
    onChange(n);
  }, [allShownOn, shown, selected, onChange]);
  const toggle = (v: string) => {
    const n = new Set(selected);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    onChange(n);
  };
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/60">{icon} {title}{selected.size > 0 && <Badge tone="cyan">{selected.size}</Badge>}</span>
        <div className="flex items-center gap-2 text-[11px]">
          <button type="button" onClick={toggleAll} disabled={!shown.length} className="text-cyan-300 hover:text-white disabled:opacity-40">{allShownOn ? "Unselect all" : term ? `Select ${shown.length}` : "Select all"}</button>
          {selected.size > 0 && <button type="button" onClick={() => onChange(new Set())} className="text-white/40 hover:text-white">Clear</button>}
        </div>
      </div>
      <div className="px-2 pt-2">
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={placeholder} className="!py-1.5 !text-xs" />
      </div>
      <ul className="max-h-44 overflow-y-auto p-1.5 text-sm">
        {shown.map((f) => {
          const on = selected.has(f.value);
          return (
            <li key={f.value}>
              <button type="button" onClick={() => toggle(f.value)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05] ${on ? "bg-cyan-500/10" : ""}`}>
                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${on ? "border-cyan-400 bg-cyan-400 text-black" : "border-white/30"}`}>{on && <Check className="h-2.5 w-2.5" />}</span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{label(f)}</span>
                <span className="shrink-0 text-[11px] text-white/40">{f.count}</span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-2 py-3 text-center text-xs text-white/40">{items.length ? "No match" : "Nothing here"}</li>}
      </ul>
    </div>
  );
}
