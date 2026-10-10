"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Play, Square, RotateCcw, Trash2, Download, Sparkles, ExternalLink as Linkedin, Mail, Phone, Database, Building2, BadgeCheck, Folder } from "lucide-react";
import { PageHeader, Card, Button, Field, Input, Textarea, Toggle, useToast, api } from "@/components/admin/ui";
import { Badge, statusTone, timeAgo, Empty } from "./bits";
import { ListPicker, useContactLists } from "./ContactLists";

type Source = "salesql" | "linkedin";
type Mode = "company" | "title";
type Job = {
  id: string; name: string; status: string; source: string; mode?: string; filters?: string | null; listId?: string | null; companies: string; keywords: string; maxPerCompany: number; progress: number; total: number; found: number; log: string; error: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null; _count?: { leads: number };
};
type Lead = { id: string; company: string; fullName: string; title: string | null; location: string | null; linkedinUrl: string | null; category: string | null; email: string | null; phone: string | null; enrichStatus: string; enrichError: string | null; source: string };

const filterSummary = (s: string) => {
  try {
    const f = JSON.parse(s) as { countries?: string[]; regions?: string[]; industries?: string[]; hasEmail?: boolean; hasPhone?: boolean; strictTitle?: boolean };
    const parts = [...(f.countries ?? []), ...(f.regions ?? []), ...(f.industries ?? [])];
    if (f.hasEmail) parts.push("has email");
    if (f.hasPhone) parts.push("has phone");
    if (f.strictTitle === false) parts.push("loose title match");
    return parts.join(", ") || "none";
  } catch {
    return "none";
  }
};

const PRESETS = ["YouTube", "CMS", "Content ID", "Head of Digital", "A&R", "CEO", "Founder", "CTO", "Digital Marketing", "Music Distribution"];

export default function SearchPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const jobId = sp.get("job");
  const { toast, success, error } = useToast();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [companies, setCompanies] = useState("");
  const [keywords, setKeywords] = useState<string[]>(["YouTube", "CMS", "Content ID", "Head of Digital"]);
  const [kwInput, setKwInput] = useState("");
  const [maxPer, setMaxPer] = useState(25);
  const [source, setSource] = useState<Source>("salesql");
  const [mode, setMode] = useState<Mode>("company");
  const [countries, setCountries] = useState("");
  const [regions, setRegions] = useState("");
  const [industries, setIndustries] = useState("");
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [strictTitle, setStrictTitle] = useState(true);
  const [maxTotal, setMaxTotal] = useState(200);
  const [listId, setListId] = useState("");
  const { lists, create: createList } = useContactLists();
  const [busy, setBusy] = useState(false);

  const [job, setJob] = useState<Job | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [enriching, setEnriching] = useState(false);

  const loadJobs = useCallback(() => api<Job[]>("/api/intubtool/jobs").then(setJobs).catch(() => undefined), []);
  const loadJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const d = await api<{ job: Job; leads: Lead[] }>(`/api/intubtool/jobs/${jobId}`);
      setJob(d.job);
      setLeads(d.leads);
    } catch (e) {
      error((e as Error).message);
    }
  }, [jobId, error]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);
  useEffect(() => {
    setJob(null);
    setLeads([]);
    loadJob();
  }, [loadJob]);
  const jobStatus = job?.status;
  useEffect(() => {
    if (jobStatus) loadJobs();
  }, [jobStatus, loadJobs]);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const t = setInterval(() => {
      loadJob();
      loadJobs();
    }, 4000);
    return () => clearInterval(t);
  }, [job, loadJob, loadJobs]);

  const addKw = (k: string) => {
    const v = k.trim();
    if (v && !keywords.some((x) => x.toLowerCase() === v.toLowerCase())) setKeywords([...keywords, v]);
    setKwInput("");
  };

  const start = async () => {
    setBusy(true);
    try {
      const split = (s: string) => s.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
      const body =
        mode === "title"
          ? { mode, keywords, maxPerCompany: maxTotal, listId: listId || undefined, filters: { countries: split(countries), regions: split(regions), industries: split(industries), hasEmail, hasPhone, strictTitle } }
          : { mode, companies, keywords, maxPerCompany: maxPer, source, listId: listId || undefined };
      const j = await api<Job>("/api/intubtool/jobs", { method: "POST", body: JSON.stringify(body) });
      success("Search started");
      loadJobs();
      router.push(`/search?job=${j.id}`);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, action: "cancel" | "retry" | "delete") => {
    try {
      if (action === "delete") {
        await api(`/api/intubtool/jobs/${id}`, { method: "DELETE" });
        loadJobs();
        if (id === jobId) router.push("/search");
        return;
      }
      await api(`/api/intubtool/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      loadJobs();
      loadJob();
    } catch (e) {
      error((e as Error).message);
    }
  };

  const enrichJob = async () => {
    if (!job) return;
    setEnriching(true);
    try {
      const r = await api<{ queued?: number; cached?: number; message?: string; summary?: Record<string, number> }>("/api/intubtool/leads/enrich", {
        method: "POST",
        body: JSON.stringify({ filter: `jobId=${job.id}`, mode: "queue" }),
      });
      success(r.message || "Queued");
      loadJob();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setEnriching(false);
    }
  };

  const grouped = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const l of leads) m.set(l.company, [...(m.get(l.company) || []), l]);
    return Array.from(m.entries());
  }, [leads]);

  const parsedCompanies = useMemo(() => Array.from(new Set(companies.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean))), [companies]);

  return (
    <>
      {toast}
      <PageHeader
        title="Employee search"
        description={mode === "company" ? "Paste company names, pick designations/keywords. Only matching employees are collected — company-wise." : "Search LinkedIn people by designation alone (no company needed) — filter by country, city and industry, save straight into a list."}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {!jobId && (
            <Card className="p-5">
              <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/5 p-1" role="tablist">
                {(
                  [
                    ["company", "By company", <Building2 key="c" className="h-4 w-4" />],
                    ["title", "By designation", <BadgeCheck key="t" className="h-4 w-4" />],
                  ] as [Mode, string, React.ReactNode][]
                ).map(([v, label, icon]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={mode === v}
                    onClick={() => setMode(v)}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${mode === v ? "bg-cyan-500/20 text-white" : "text-white/60 hover:text-white"}`}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
              {mode === "company" && (
                <div className="mb-5 flex flex-wrap gap-2">
                  {(
                    [
                      ["salesql", "SalesQL Prospector", "Free search (0 credits) · no LinkedIn login · safest"],
                      ["linkedin", "LinkedIn (your account)", "Uses your li_at cookie · slow, human-like · account risk"],
                    ] as [Source, string, string][]
                  ).map(([v, label, hint]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSource(v)}
                      className={`flex-1 min-w-[220px] rounded-xl border px-4 py-3 text-left transition ${source === v ? "border-cyan-400/60 bg-cyan-500/10" : "border-white/10 bg-white/5 hover:border-white/25"}`}
                      aria-pressed={source === v}
                    >
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-white/50">{hint}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="grid gap-5 md:grid-cols-2">
                {mode === "company" ? (
                  <Field label={`Companies (${parsedCompanies.length})`} hint="One per line, or comma separated. LinkedIn company URL also works.">
                    <Textarea rows={10} value={companies} onChange={(e) => setCompanies(e.target.value)} placeholder={"Only Much Louder\nSony Music India\nT-Series\nhttps://www.linkedin.com/company/saregama"} />
                  </Field>
                ) : (
                  <div className="space-y-4">
                    <Field label="Country (optional)" hint="Comma separated, e.g. India, United States">
                      <Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="India" />
                    </Field>
                    <Field label="State / city (optional)" hint="e.g. Mumbai, Maharashtra, Delhi">
                      <Input value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="Mumbai, Delhi" />
                    </Field>
                    <Field label="Industry (optional)" hint="e.g. Music, Media Production, Entertainment">
                      <Input value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Music" />
                    </Field>
                    <div className="flex flex-wrap gap-4">
                      <Toggle checked={hasEmail} onChange={setHasEmail} label="Only people with email" />
                      <Toggle checked={hasPhone} onChange={setHasPhone} label="Only people with phone" />
                    </div>
                    <Toggle checked={strictTitle} onChange={setStrictTitle} label="Only save people whose current title matches the designation (skip SalesQL's loose matches)" />
                  </div>
                )}
                <div className="space-y-5">
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-white/60">Designations / keywords ({keywords.length})</span>
                    <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-white/5 p-2">
                      {keywords.map((k) => (
                        <span key={k} className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-200">
                          {k}
                          <button type="button" onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="text-cyan-300/60 hover:text-white" aria-label={`Remove ${k}`}>×</button>
                        </span>
                      ))}
                      <input
                        value={kwInput}
                        onChange={(e) => setKwInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addKw(kwInput);
                          }
                        }}
                        onBlur={() => kwInput && addKw(kwInput)}
                        placeholder="type + Enter"
                        className="min-w-[120px] flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-white/30"
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {PRESETS.filter((p) => !keywords.includes(p)).map((p) => (
                        <button key={p} type="button" onClick={() => addKw(p)} className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-white/60 hover:border-cyan-400/40 hover:text-white">+ {p}</button>
                      ))}
                    </div>
                    <span className="mt-1 block text-xs text-white/40">
                      {mode === "title"
                        ? "People whose current job title matches any of these are found across all companies (SalesQL Prospector, free) and saved company-wise."
                        : source === "salesql"
                          ? "Job titles are matched inside SalesQL's database for each company. Employees matching any keyword are saved."
                          : "Each keyword is searched inside the company's People tab. Employees matching any keyword are saved."}
                    </span>
                  </div>
                  <Field label="Save results into list (optional)" hint="Found people are added to this contact list as well as the database.">
                    <ListPicker lists={lists} value={listId} onChange={setListId} create={createList} onError={error} placeholder="No list (database only)" />
                  </Field>
                  {mode === "title" ? (
                    <Field label="Max people to save" hint="Search is free — enrichment credits are only spent when you click Get emails & phones.">
                      <Input type="number" min={1} max={2000} value={maxTotal} onChange={(e) => setMaxTotal(Number(e.target.value))} />
                    </Field>
                  ) : source === "salesql" ? (
                    <Field label="Max people per company" hint="Total across all keywords. Search is free — enrichment credits are only spent when you click Enrich.">
                      <Input type="number" min={1} max={500} value={maxPer} onChange={(e) => setMaxPer(Number(e.target.value))} />
                    </Field>
                  ) : (
                    <Field label="Max people per company per keyword" hint="Lower = safer for your LinkedIn account. 25 is a good default.">
                      <Input type="number" min={1} max={100} value={maxPer} onChange={(e) => setMaxPer(Number(e.target.value))} />
                    </Field>
                  )}
                  <Button onClick={start} loading={busy} disabled={(mode === "company" && !parsedCompanies.length) || !keywords.length} className="w-full">
                    <Play className="h-4 w-4" /> {mode === "title" ? `Start search (${keywords.length} designations, up to ${maxTotal} people)` : `Start search (${parsedCompanies.length} companies × ${keywords.length} keywords)`}
                  </Button>
                  <p className="text-xs text-white/40">
                    {mode === "title" ? (
                      <>Needs your SalesQL API key in <Link href="/settings" className="text-cyan-300 hover:underline">Settings</Link>. Runs in background; you can leave this page.</>
                    ) : source === "salesql" ? (
                      <>Needs your SalesQL API key + web token in <Link href="/settings" className="text-cyan-300 hover:underline">Settings</Link>. Runs in background; you can leave this page.</>
                    ) : (
                      <>Needs your LinkedIn <code>li_at</code> cookie in <Link href="/settings" className="text-cyan-300 hover:underline">Settings</Link>. Runs in background with human-like delays; you can leave this page.</>
                    )}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {jobId && job && (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{job.name}</h2>
                      <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-white/50">
                      {job.source === "salesql" ? "SalesQL" : "LinkedIn"} · {job.mode === "title" ? "by designation" : `${JSON.parse(job.companies || "[]").length} companies`} · keywords: {JSON.parse(job.keywords || "[]").join(", ")}
                      {job.mode === "title" && job.filters ? ` · filters: ${filterSummary(job.filters)}` : ""} · started {timeAgo(job.startedAt || job.createdAt)}
                    </p>
                    {job.listId && (
                      <Link href={`/leads?list=${job.listId}`} className="mt-1 inline-flex items-center gap-1 text-xs text-violet-300 hover:underline">
                        <Folder className="h-3 w-3" /> Saved into list: {lists.find((l) => l.id === job.listId)?.name ?? "open list"}
                      </Link>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/search"><Button variant="ghost">New search</Button></Link>
                    {["queued", "running"].includes(job.status) && <Button variant="danger" onClick={() => act(job.id, "cancel")}><Square className="h-4 w-4" /> Stop</Button>}
                    {["failed", "cancelled", "done"].includes(job.status) && <Button variant="secondary" onClick={() => act(job.id, "retry")}><RotateCcw className="h-4 w-4" /> Re-run</Button>}
                    {leads.length > 0 && (
                      <>
                        <a href={`/api/intubtool/leads/export?jobId=${job.id}&format=xlsx`}><Button variant="secondary"><Download className="h-4 w-4" /> Excel</Button></a>
                        <Button onClick={enrichJob} loading={enriching} title="Checks your database first; SalesQL credits are used only for people with no email/phone locally">
                          <Sparkles className="h-4 w-4" /> Get emails & phones
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                {job.total > 0 && (
                  <div className="mt-4">
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all" style={{ width: `${Math.min(100, (job.progress / job.total) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-white/50">{job.progress}/{job.total} steps · {leads.length} people found</p>
                  </div>
                )}
                {job.error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{job.error}</p>}
                {job.log && (
                  <details className="mt-3" open={job.status === "running"}>
                    <summary className="cursor-pointer text-xs text-white/50">Activity log</summary>
                    <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-white/60">{job.log}</pre>
                  </details>
                )}
              </Card>

              {grouped.length === 0 ? (
                <Empty title={job.status === "running" || job.status === "queued" ? "Searching…" : "No matching employees found"}>
                  {job.status === "done" && "Try broader keywords, or check that the company name resolves on LinkedIn (see log)."}
                </Empty>
              ) : (
                grouped.map(([company, list]) => (
                  <Card key={company} className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.02] px-5 py-3">
                      <h3 className="font-semibold">{company}</h3>
                      <div className="flex items-center gap-3 text-xs text-white/50">
                        <span>{list.length} people</span>
                        <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {list.filter((l) => l.email).length}</span>
                        <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {list.filter((l) => l.phone).length}</span>
                        <Link href={`/leads?company=${encodeURIComponent(company)}`} className="text-cyan-300 hover:underline">Open</Link>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-white/5">
                        {list.map((l) => (
                          <tr key={l.id} className="hover:bg-white/[0.02]">
                            <td className="px-5 py-2.5">
                              <p className="font-medium">{l.fullName}</p>
                              <p className="text-xs text-white/50">{l.title || "—"}{l.location ? ` · ${l.location}` : ""}</p>
                            </td>
                            <td className="px-3 py-2.5"><Badge tone="cyan">{l.category}</Badge></td>
                            <td className="px-3 py-2.5 text-xs">
                              {l.email ? <span className="text-emerald-300">{l.email}</span> : <span className="text-white/30">no email</span>}
                              <br />
                              {l.phone ? <span className="text-emerald-300">{l.phone}</span> : <span className="text-white/30">no phone</span>}
                            </td>
                            <td className="px-3 py-2.5">
                              {l.enrichStatus !== "none" && (
                                <Badge tone={statusTone(l.enrichStatus)} title={l.enrichError || undefined}>
                                  {l.enrichStatus === "done" && l.source !== "linkedin" ? <Database className="h-3 w-3" /> : null}
                                  {l.enrichStatus}
                                </Badge>
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              {l.linkedinUrl && (
                                <a href={l.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex text-white/50 hover:text-[#0a66c2]" aria-label="LinkedIn">
                                  <Linkedin className="h-4 w-4" />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                ))
              )}
            </>
          )}
        </div>

        <aside>
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold text-white/80">Search history</h2>
            {jobs.length === 0 ? (
              <p className="text-xs text-white/40">No searches yet.</p>
            ) : (
              <ul className="space-y-1">
                {jobs.map((j) => (
                  <li key={j.id} className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${j.id === jobId ? "bg-white/10" : "hover:bg-white/5"}`}>
                    <Link href={`/search?job=${j.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-medium">{j.name}</p>
                      <p className="text-[11px] text-white/40">{j._count?.leads ?? j.found} leads · {timeAgo(j.createdAt)}</p>
                    </Link>
                    <Badge tone={statusTone(j.status)}>{j.status}</Badge>
                    {j.status !== "running" && (
                      <button type="button" onClick={() => act(j.id, "delete")} className="hidden text-white/30 hover:text-red-300 group-hover:block" aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
