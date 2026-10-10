"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload, Download, Sparkles, Trash2, Tag, ExternalLink as Linkedin, Mail, Phone, Plus, Send, Database, Search, ChevronLeft, ChevronRight, Pencil, FolderMinus, Folder, RefreshCw } from "lucide-react";
import { PageHeader, Card, Button, Field, Input, Select, Textarea, Modal, useToast, api } from "@/components/admin/ui";
import { Badge, statusTone, Empty } from "./bits";
import ImportModal from "./ImportModal";
import SalesqlSyncModal from "./SalesqlSync";
import { ListPicker, ListsSidebar, useContactLists, type ContactList } from "./ContactLists";

type Lead = {
  id: string; company: string; fullName: string; title: string | null; location: string | null; linkedinUrl: string | null; category: string | null; source: string;
  email: string | null; emailStatus: string | null; emails: string | null; phone: string | null; phones: string | null; enrichStatus: string; enrichError: string | null; notes: string | null; unsubscribed: boolean; createdAt: string;
  lists?: { id: string; name: string }[];
};
type ListResp = { total: number; page: number; limit: number; leads: Lead[]; companies: { company: string; count: number }[]; lists: ContactList[]; allTotal: number };
type Campaign = { id: string; name: string; status: string };

const parseJson = <T,>(s: string | null): T[] => {
  if (!s) return [];
  try {
    return JSON.parse(s) as T[];
  } catch {
    return [];
  }
};

export default function LeadsPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const { toast, success, error } = useToast();

  const [q, setQ] = useState(sp.get("q") || "");
  const [company, setCompany] = useState(sp.get("company") || "");
  const [has, setHas] = useState(sp.get("has") || "");
  const [source, setSource] = useState(sp.get("source") || "");
  const [list, setList] = useState(sp.get("list") || "");
  const { lists, setLists, reload: reloadLists, create: createList } = useContactLists();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResp | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(sp.get("import") === "1");
  const [syncOpen, setSyncOpen] = useState(sp.get("sync") === "1");
  const [edit, setEdit] = useState<Lead | null>(null);
  const [adding, setAdding] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [enrichBusy, setEnrichBusy] = useState(false);

  const filter = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (company) p.set("company", company);
    if (has === "unsub") p.set("unsubscribed", "1");
    else if (has) p.set("has", has);
    if (source) p.set("source", source);
    if (list) p.set("list", list);
    return p.toString();
  }, [q, company, has, source, list]);
  const activeList = lists.find((l) => l.id === list) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<ListResp>(`/api/intubtool/leads?${filter}&page=${page}&limit=50&sort=company`);
      setData(d);
      if (d.lists) setLists(d.lists);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, page, error, setLists]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    setPage(1);
    setSel(new Set());
  }, [filter]);
  useEffect(() => {
    api<Campaign[]>("/api/intubtool/campaigns").then(setCampaigns).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!data?.leads.some((l) => l.enrichStatus === "queued")) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [data, load]);

  const selectedOrFilter = () => (sel.size ? { ids: Array.from(sel) } : { filter });
  const countLabel = sel.size ? `${sel.size} selected` : `all ${data?.total ?? 0} in view`;

  const enrich = async () => {
    setEnrichBusy(true);
    try {
      const r = await api<{ queued?: number; cached?: number; message?: string; summary?: Record<string, number>; results?: { status: string; message?: string }[] }>("/api/intubtool/leads/enrich", {
        method: "POST",
        body: JSON.stringify({ ...selectedOrFilter(), mode: sel.size && sel.size <= 20 ? "now" : "queue" }),
      });
      if (r.message) success(r.message);
      else if (r.summary) {
        const s = r.summary;
        const firstErr = r.results?.find((x) => x.status === "error")?.message;
        (s.error ? error : success)(`${s.cached || 0} from database (no credits) · ${s.done || 0} via SalesQL · ${s.not_found || 0} not found · ${s.error || 0} errors${firstErr ? ` — ${firstErr}` : ""}`);
      }
      load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setEnrichBusy(false);
    }
  };

  const bulk = async (action: string, value?: string, extra?: Record<string, string>) => {
    if (action === "delete" && !confirm(`Delete ${countLabel}? This cannot be undone.`)) return;
    if (action === "remove_from_list" && !confirm(`Remove ${countLabel} from "${activeList?.name}"? They stay in your database.`)) return;
    try {
      const r = await api<{ affected: number; skippedNoEmail?: number; added?: number; alreadyInList?: number }>("/api/intubtool/leads/bulk", {
        method: "POST",
        body: JSON.stringify({ ...selectedOrFilter(), action, value, ...extra }),
      });
      const listName = lists.find((l) => l.id === value)?.name ?? "list";
      const verb =
        action === "add_to_campaign" ? "added to campaign"
        : action === "delete" ? "deleted"
        : action === "add_to_list" ? `added to "${listName}"${r.alreadyInList ? ` (${r.alreadyInList} already there)` : ""}`
        : action === "move_to_list" ? `moved to "${listName}"`
        : action === "remove_from_list" ? "removed from list"
        : "updated";
      success(`${r.affected} leads ${verb}${r.skippedNoEmail ? ` · ${r.skippedNoEmail} skipped (no email)` : ""}`);
      setSel(new Set());
      load();
      reloadLists();
    } catch (e) {
      error((e as Error).message);
    }
  };

  const toggleAll = () => {
    if (!data) return;
    const all = data.leads.every((l) => sel.has(l.id));
    const n = new Set(sel);
    data.leads.forEach((l) => (all ? n.delete(l.id) : n.add(l.id)));
    setSel(n);
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      {toast}
      <PageHeader
        title={activeList ? activeList.name : list === "none" ? "Leads not in any list" : "Leads database"}
        description={activeList ? `Contact list · ${activeList.count} leads. Export/enrich/campaign actions below apply to this list only.` : "Everything you've found or imported. Checked first before any SalesQL credit is spent."}
        actions={
          <>
            <Button variant="secondary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add lead</Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import CSV / Excel</Button>
            {isAdmin && <Button variant="secondary" onClick={() => setSyncOpen(true)} title="Pull your SalesQL contact folders + tags into lists here"><RefreshCw className="h-4 w-4" /> Sync from SalesQL</Button>}
            <a href={`/api/intubtool/leads/export?${filter}&format=xlsx`}><Button variant="secondary"><Download className="h-4 w-4" /> {activeList ? "Export list" : "Excel"}</Button></a>
            <a href={`/api/intubtool/leads/export?${filter}&format=csv`}><Button variant="ghost">CSV</Button></a>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <ListsSidebar
            lists={lists}
            active={list}
            total={data?.allTotal}
            onSelect={(id) => {
              setList(id);
              setCompany("");
            }}
            onChanged={() => {
              reloadLists();
              load();
            }}
            onError={error}
            onSuccess={success}
          />
          <Card className="p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, title, email…" className="min-w-0 pl-9" />
            </div>
            <div className="mt-3 grid gap-3">
              <Select value={has} onChange={(e) => setHas(e.target.value)}>
                <option value="">Any contact data</option>
                <option value="email">Has email</option>
                <option value="phone">Has phone</option>
                <option value="none">Missing email & phone</option>
                <option value="linkedin">Has LinkedIn URL</option>
                <option value="unsub">Unsubscribed</option>
              </Select>
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Any source</option>
                <option value="salesql">SalesQL search</option>
                <option value="salesql_sync">SalesQL sync</option>
                <option value="linkedin">LinkedIn search</option>
                <option value="import">Imported</option>
                <option value="manual">Manual</option>
              </Select>
            </div>
          </Card>
          <Card className="max-h-[50vh] overflow-y-auto p-2">
            <button type="button" onClick={() => setCompany("")} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${!company ? "bg-white/10 font-semibold" : "text-white/70 hover:bg-white/5"}`}>
              All companies <span className="text-xs text-white/40">{data?.companies.reduce((a, c) => a + c.count, 0) ?? 0}</span>
            </button>
            {data?.companies.map((c) => (
              <button key={c.company} type="button" onClick={() => setCompany(c.company)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${company === c.company ? "bg-cyan-500/15 font-semibold text-white" : "text-white/70 hover:bg-white/5"}`}>
                <span className="truncate">{c.company}</span> <span className="shrink-0 text-xs text-white/40">{c.count}</span>
              </button>
            ))}
          </Card>
        </aside>

        <div className="min-w-0 space-y-3">
          {/* bulk bar */}
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm text-white/60">{countLabel}</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button onClick={enrich} loading={enrichBusy} disabled={!data?.total} title="Database first → SalesQL only for people with no email/phone">
                <Sparkles className="h-4 w-4" /> Get emails & phones
              </Button>
              {campaigns.length > 0 && (
                <Select
                  value=""
                  onChange={(e) => e.target.value && bulk("add_to_campaign", e.target.value)}
                  className="!w-auto"
                  disabled={!data?.total}
                >
                  <option value="">+ Add to campaign…</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.status})</option>)}
                </Select>
              )}
              <ListPicker
                lists={lists}
                value=""
                placeholder={activeList ? "+ Copy to list…" : "+ Add to list…"}
                className="!w-auto"
                disabled={!data?.total}
                exclude={activeList?.id}
                create={createList}
                onError={error}
                onChange={(id) => id && bulk("add_to_list", id)}
              />
              {activeList && (
                <>
                  <ListPicker
                    lists={lists}
                    value=""
                    placeholder="→ Move to list…"
                    className="!w-auto"
                    disabled={!data?.total}
                    exclude={activeList.id}
                    create={createList}
                    onError={error}
                    onChange={(id) => id && bulk("move_to_list", id, { fromListId: activeList.id })}
                  />
                  <Button variant="secondary" disabled={!data?.total} onClick={() => bulk("remove_from_list", activeList.id)} title="Remove from this list (leads stay in database)">
                    <FolderMinus className="h-4 w-4" /> Remove from list
                  </Button>
                </>
              )}
              <Button variant="secondary" disabled={!data?.total} onClick={() => { const v = prompt("Set category / tag for " + countLabel); if (v !== null) bulk("category", v); }}>
                <Tag className="h-4 w-4" /> Tag
              </Button>
              <Button variant="danger" disabled={!data?.total} onClick={() => bulk("delete")}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </Card>

          {data && data.leads.length === 0 ? (
            <Empty title={data.total === 0 && !filter ? "Your database is empty" : "No leads match these filters"}>
              {activeList && <p>This list is empty — select leads in “All leads” and use “+ Add to list”, or import a CSV straight into it.</p>}
              {!filter && (
                <div className="mt-3 flex justify-center gap-2">
                  <Button onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import your SalesQL export</Button>
                  <a href="/search"><Button variant="secondary"><Search className="h-4 w-4" /> Run a LinkedIn search</Button></a>
                </div>
              )}
            </Empty>
          ) : (
            <Card className={`overflow-hidden ${loading ? "opacity-70" : ""}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-white/50">
                    <tr>
                      <th className="w-8 px-3 py-3"><input type="checkbox" checked={!!data?.leads.length && data.leads.every((l) => sel.has(l.id))} onChange={toggleAll} aria-label="Select all" /></th>
                      <th className="px-3 py-3">Person</th>
                      <th className="px-3 py-3">Company</th>
                      <th className="px-3 py-3">Email</th>
                      <th className="px-3 py-3">Phone</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data?.leads.map((l) => {
                      const emails = parseJson<{ email: string; type?: string; status?: string }>(l.emails);
                      const phones = parseJson<{ phone: string; type?: string; status?: string }>(l.phones);
                      return (
                        <tr key={l.id} className={`hover:bg-white/[0.02] ${l.unsubscribed ? "opacity-50" : ""}`}>
                          <td className="px-3 py-2.5"><input type="checkbox" checked={sel.has(l.id)} onChange={() => { const n = new Set(sel); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); setSel(n); }} aria-label="Select" /></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setEdit(l)} className="font-medium hover:text-cyan-300">{l.fullName}</button>
                              {l.linkedinUrl && <a href={l.linkedinUrl} target="_blank" rel="noreferrer" className="text-white/40 hover:text-[#0a66c2]" aria-label="LinkedIn"><Linkedin className="h-3.5 w-3.5" /></a>}
                            </div>
                            <p className="max-w-xs truncate text-xs text-white/50">{l.title || "—"}{l.location ? ` · ${l.location}` : ""}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {l.category && <Badge tone="cyan">{l.category}</Badge>}
                              <Badge>{l.source}</Badge>
                              {l.unsubscribed && <Badge tone="red">unsubscribed</Badge>}
                              {l.lists?.map((m) => (
                                <button key={m.id} type="button" onClick={() => setList(m.id)} title={`Open list ${m.name}`}>
                                  <Badge tone="violet"><Folder className="h-3 w-3" /> {m.name}</Badge>
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5"><button type="button" onClick={() => setCompany(l.company)} className="hover:text-cyan-300">{l.company}</button></td>
                          <td className="px-3 py-2.5 text-xs">
                            {l.email ? (
                              <span className="inline-flex items-center gap-1 text-emerald-300" title={emails.map((e) => `${e.email} (${e.type || "?"}, ${e.status || "?"})`).join("\n")}>
                                <Mail className="h-3 w-3" /> {l.email}{emails.length > 1 && <span className="text-white/40">+{emails.length - 1}</span>}
                              </span>
                            ) : <span className="text-white/30">—</span>}
                            {l.emailStatus && <p className="text-[10px] text-white/40">{l.emailStatus}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {l.phone ? (
                              <span className="inline-flex items-center gap-1 text-emerald-300" title={phones.map((p) => `${p.phone} (${p.type || "?"})`).join("\n")}>
                                <Phone className="h-3 w-3" /> {l.phone}{phones.length > 1 && <span className="text-white/40">+{phones.length - 1}</span>}
                              </span>
                            ) : <span className="text-white/30">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            {l.enrichStatus === "none" ? (
                              l.email || l.phone ? <Badge tone="green" title="Contact data already in your database"><Database className="h-3 w-3" /> in DB</Badge> : <Badge>not checked</Badge>
                            ) : (
                              <Badge tone={statusTone(l.enrichStatus)} title={l.enrichError || undefined}>{l.enrichStatus}</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button type="button" onClick={() => setEdit(l)} className="text-white/40 hover:text-white" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-xs text-white/50">
                <span>{data?.total ?? 0} leads · page {page}/{pages}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <SalesqlSyncModal
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        onSynced={() => {
          reloadLists();
          load();
        }}
      />
      <ImportModal
        open={importOpen}
        lists={lists}
        defaultListId={activeList?.id ?? ""}
        createList={createList}
        onClose={() => {
          setImportOpen(false);
          if (sp.get("import")) router.replace("/leads");
        }}
        onDone={(r) => {
          success(`Imported: ${r.created} new, ${r.updated} merged${r.addedToList ? ` · ${r.addedToList} in list` : ""}`);
          if (r.listId) setList(r.listId);
          load();
          reloadLists();
        }}
      />

      <LeadEditor
        lead={edit}
        adding={adding}
        listId={activeList?.id ?? ""}
        onClose={() => { setEdit(null); setAdding(false); }}
        onSaved={() => { setEdit(null); setAdding(false); load(); }}
        onError={error}
        onSuccess={success}
      />
    </>
  );
}

function LeadEditor({ lead, adding, listId, onClose, onSaved, onError, onSuccess }: { lead: Lead | null; adding: boolean; listId: string; onClose: () => void; onSaved: () => void; onError: (m: string) => void; onSuccess: (m: string) => void }) {
  const open = !!lead || adding;
  const [f, setF] = useState<Partial<Lead>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setF(lead ? { ...lead } : { fullName: "", company: "", title: "", linkedinUrl: "", email: "", phone: "", location: "", category: "", notes: "" });
  }, [lead, adding]);

  const save = async () => {
    setBusy(true);
    try {
      if (lead) await api(`/api/intubtool/leads/${lead.id}`, { method: "PUT", body: JSON.stringify(f) });
      else {
        const r = await api<{ created: boolean }>("/api/intubtool/leads", { method: "POST", body: JSON.stringify({ ...f, listId: listId || undefined }) });
        if (!r.created) onSuccess("Matched an existing lead — merged instead of duplicating");
      }
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!lead || !confirm("Delete this lead?")) return;
    await api(`/api/intubtool/leads/${lead.id}`, { method: "DELETE" });
    onSaved();
  };
  const enrichOne = async () => {
    if (!lead) return;
    setBusy(true);
    try {
      const r = await api<{ results: { status: string; message?: string }[] }>("/api/intubtool/leads/enrich", { method: "POST", body: JSON.stringify({ ids: [lead.id], mode: "now", force: !!(lead.email || lead.phone) }) });
      const x = r.results[0];
      (x.status === "error" ? onError : onSuccess)(`${x.status}${x.message ? ` — ${x.message}` : ""}`);
      onSaved();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof Lead) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const emails = parseJson<{ email: string; type?: string; status?: string }>(lead?.emails ?? null);
  const phones = parseJson<{ phone: string; type?: string; status?: string }>(lead?.phones ?? null);

  return (
    <Modal open={open} onClose={onClose} title={lead ? lead.fullName : "Add lead"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={f.fullName || ""} onChange={set("fullName")} /></Field>
        <Field label="Company"><Input value={f.company || ""} onChange={set("company")} /></Field>
        <Field label="Title / designation"><Input value={f.title || ""} onChange={set("title")} /></Field>
        <Field label="Category"><Input value={f.category || ""} onChange={set("category")} /></Field>
        <Field label="Email"><Input value={f.email || ""} onChange={set("email")} /></Field>
        <Field label="Phone"><Input value={f.phone || ""} onChange={set("phone")} /></Field>
        <Field label="LinkedIn URL" className="sm:col-span-2"><Input value={f.linkedinUrl || ""} onChange={set("linkedinUrl")} /></Field>
        <Field label="Location"><Input value={f.location || ""} onChange={set("location")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={f.notes || ""} onChange={set("notes")} /></Field>
      </div>
      {(emails.length > 1 || phones.length > 1) && (
        <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs sm:grid-cols-2">
          <div>
            <p className="mb-1 font-semibold text-white/60">All emails</p>
            {emails.map((e, i) => <p key={i} className="cursor-pointer hover:text-cyan-300" onClick={() => setF({ ...f, email: e.email })}>{e.email} <span className="text-white/40">{e.type} · {e.status}</span></p>)}
          </div>
          <div>
            <p className="mb-1 font-semibold text-white/60">All phones</p>
            {phones.map((p, i) => <p key={i} className="cursor-pointer hover:text-cyan-300" onClick={() => setF({ ...f, phone: p.phone })}>{p.phone} <span className="text-white/40">{p.type} · {p.status}</span></p>)}
          </div>
        </div>
      )}
      {lead?.enrichError && <p className="mt-3 text-xs text-amber-300">Last enrichment: {lead.enrichError}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {lead && <Button variant="danger" onClick={del}><Trash2 className="h-4 w-4" /></Button>}
        {lead && <Button variant="secondary" onClick={enrichOne} loading={busy}><Sparkles className="h-4 w-4" /> {lead.email || lead.phone ? "Re-check via SalesQL" : "Find email & phone"}</Button>}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={busy}><Send className="h-4 w-4" /> Save</Button>
        </div>
      </div>
    </Modal>
  );
}
