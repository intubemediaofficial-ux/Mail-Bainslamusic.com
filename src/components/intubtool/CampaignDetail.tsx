"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, Play, Pause, Square, Trash2, Eye, Send, Plus, X, Users, ArrowLeft, Sparkles, ShieldAlert, Search, Paperclip, FileText, Download } from "lucide-react";
import { PageHeader, Card, Button, Field, Input, Textarea, Toggle, Modal, Select, useToast, api } from "@/components/admin/ui";
import { Badge, statusTone, fmtDate, timeAgo } from "./bits";
import LeadPicker from "./LeadPicker";
import MailHealthBox, { computeHealth } from "./MailHealth";
import type { MailHealth } from "@/lib/intubtool/spam";

type Attachment = { name: string; path: string; size: number; type: string };
type Step = { id?: string; order: number; delayDays: number; subject: string; body: string; attachments?: Attachment[] | string | null };

const parseAtts = (v: Step["attachments"]): Attachment[] => {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || !v) return [];
  try {
    const p = JSON.parse(v) as unknown;
    return Array.isArray(p) ? (p as Attachment[]) : [];
  } catch {
    return [];
  }
};
const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const MAX_ATTS = 5;
const MAX_STEP_BYTES = 20 * 1024 * 1024;
type CL = { id: string; status: string; currentStep: number; nextSendAt: string | null; lastSentAt: string | null; lead: { id: string; fullName: string; company: string; title: string | null; email: string | null; unsubscribed: boolean } };
type Msg = { id: string; toEmail: string; subject: string; status: string; error: string | null; sentAt: string; openCount: number; repliedAt: string | null; replySnippet: string | null; bouncedAt: string | null; bounceReason: string | null; spamScore: number | null; aiPersonalized: boolean; stepOrder: number; lead: { fullName: string; company: string } | null };
type Campaign = {
  id: string; name: string; status: string; fromName: string | null; fromEmail: string | null; replyTo: string | null; cc: string | null; bcc: string | null; dailyLimit: number; sendWindowStart: number; sendWindowEnd: number; minGapSeconds: number;
  trackOpens: boolean; personalMode: boolean; aiPersonalize: boolean; aiInstructions: string | null; stopOnReply: boolean; steps: Step[]; leads: CL[]; messages: Msg[];
  stats: { sent: number; opened: number; replied: number; bounced: number; pending: number; failed: number };
};
type Preview = { lead: { fullName: string; company: string; email: string | null }; subject: string; text: string; aiPersonalized: boolean; personal: boolean; health: MailHealth; aiReview: { score: number; issues: string[]; improvedSubject?: string; improvedBody?: string } | null };

const VARS = ["{{first_name}}", "{{full_name}}", "{{company}}", "{{title}}", "{{location}}", "{{sender_name}}", "{{signature}}", "{{unsubscribe_url}}"];

export default function CampaignDetail({ id }: { id: string }) {
  const router = useRouter();
  const { toast, success, error } = useToast();
  const [c, setC] = useState<Campaign | null>(null);
  const [f, setF] = useState<Partial<Campaign>>({});
  const [steps, setSteps] = useState<Step[]>([]);
  const [tab, setTab] = useState<"steps" | "leads" | "activity">("steps");
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewStep, setPreviewStep] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [leadQ, setLeadQ] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [senders, setSenders] = useState<{ main: string; aliases: string[] } | null>(null);
  useEffect(() => {
    api<{ main: string; aliases: string[] }>("/api/intubtool/mailbox/senders").then(setSenders).catch(() => setSenders(null));
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await api<Campaign>(`/api/intubtool/campaigns/${id}`);
      setC(d);
      setF((prev) => (Object.keys(prev).length ? prev : d));
      setSteps((prev) => (prev.length ? prev : d.steps.map((s) => ({ ...s, attachments: parseAtts(s.attachments) }))));
    } catch (e) {
      error((e as Error).message);
    }
  }, [id, error]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const save = async () => {
    setBusy("save");
    try {
      const d = await api<Campaign>(`/api/intubtool/campaigns/${id}`, { method: "PUT", body: JSON.stringify({ ...f, steps }) });
      success("Saved");
      setF({});
      setSteps([]);
      setC(null);
      void d;
      await load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const [uploading, setUploading] = useState<number | null>(null);
  const [testHealth, setTestHealth] = useState<MailHealth | null>(null);
  const attach = async (i: number, files: FileList | null) => {
    if (!files?.length) return;
    const current = parseAtts(steps[i]?.attachments);
    const picked = Array.from(files);
    if (current.length + picked.length > MAX_ATTS) return error(`Max ${MAX_ATTS} attachments per email`);
    const total = current.reduce((a, x) => a + x.size, 0) + picked.reduce((a, x) => a + x.size, 0);
    if (total > MAX_STEP_BYTES) return error("Attachments too large — keep each email under 20 MB in total");
    setUploading(i);
    try {
      const added: Attachment[] = [];
      for (const file of picked) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/intubtool/attachments", { method: "POST", body: fd });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: Attachment };
        if (!res.ok || !data.data) throw new Error(data.error || `Upload failed (${res.status})`);
        added.push(data.data);
      }
      setSteps((prev) => prev.map((x, j) => (j === i ? { ...x, attachments: [...parseAtts(x.attachments), ...added] } : x)));
      success(`${added.length} file${added.length === 1 ? "" : "s"} attached — click Save`);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setUploading(null);
    }
  };
  const detach = (i: number, path: string) =>
    setSteps((prev) => prev.map((x, j) => (j === i ? { ...x, attachments: parseAtts(x.attachments).filter((a) => a.path !== path) } : x)));

  const act = async (action: string) => {
    setBusy(action);
    try {
      if (action === "delete") {
        if (!confirm("Delete this campaign and its history?")) return;
        await api(`/api/intubtool/campaigns/${id}`, { method: "DELETE" });
        router.push("/intubtool/campaigns");
        return;
      }
      await api(`/api/intubtool/campaigns/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
      success(action === "start" || action === "resume" ? "Campaign running — emails go out 1-by-1 within the send window" : `Campaign ${action}d`);
      load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doPreview = async (ai: boolean, aiReview = false) => {
    setBusy("preview");
    try {
      await api(`/api/intubtool/campaigns/${id}`, { method: "PUT", body: JSON.stringify({ ...f, steps }) });
      const p = await api<Preview>(`/api/intubtool/campaigns/${id}/preview`, { method: "POST", body: JSON.stringify({ step: previewStep, ai, aiReview }) });
      setPreview(p);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const testSend = async () => {
    const to = prompt("Send test email to:", "");
    if (to === null) return;
    setBusy("test");
    try {
      await api(`/api/intubtool/campaigns/${id}`, { method: "PUT", body: JSON.stringify({ ...f, steps }) });
      const r = await api<{ message: string; health: MailHealth }>(`/api/intubtool/campaigns/${id}/test`, { method: "POST", body: JSON.stringify({ to, step: previewStep }) });
      success(r.message);
      setTestHealth(r.health);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeLeads = async (leadIds: string[]) => {
    if (!leadIds.length) return;
    if (leadIds.length > 1 && !confirm(`Remove ${leadIds.length} leads from this campaign?`)) return;
    setBusy("remove");
    try {
      await api(`/api/intubtool/campaigns/${id}/leads`, { method: "DELETE", body: JSON.stringify({ ids: leadIds }) });
      setChecked(new Set());
      await load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!c) return <p className="text-white/50">Loading…</p>;
  const set = <K extends keyof Campaign>(k: K, v: Campaign[K]) => setF({ ...f, [k]: v });
  const g = <K extends keyof Campaign>(k: K): Campaign[K] => (f[k] ?? c[k]) as Campaign[K];
  const editable = c.status !== "running";
  const lq = leadQ.trim().toLowerCase();
  const shownLeads = lq ? c.leads.filter((cl) => [cl.lead.fullName, cl.lead.company, cl.lead.title, cl.lead.email, cl.status].some((v) => v?.toLowerCase().includes(lq))) : c.leads;
  const allShownChecked = shownLeads.length > 0 && shownLeads.every((cl) => checked.has(cl.lead.id));
  const toggleAllShown = () => setChecked((s) => { const n = new Set(s); if (allShownChecked) shownLeads.forEach((cl) => n.delete(cl.lead.id)); else shownLeads.forEach((cl) => n.add(cl.lead.id)); return n; });
  const toggleChecked = (leadId: string) => setChecked((s) => { const n = new Set(s); if (n.has(leadId)) n.delete(leadId); else n.add(leadId); return n; });

  return (
    <>
      {toast}
      <PageHeader
        title={g("name")}
        description={
          <span className="flex items-center gap-2">
            <Badge tone={statusTone(c.status)}>{c.status}</Badge> {c.stats.pending} pending · {c.stats.sent} sent · {c.stats.opened} opened · {c.stats.replied} replied · {c.stats.bounced} bounced {c.stats.failed ? `· ${c.stats.failed} failed` : ""}
          </span>
        }
        actions={
          <>
            <Link href="/intubtool/campaigns"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> All campaigns</Button></Link>
            <a href={`/api/intubtool/campaigns/report?campaign=${c.id}&format=xlsx`} title="Excel: summary + replied, bounced and all sent mails"><Button variant="secondary"><Download className="h-4 w-4" /> Report</Button></a>
            {c.status === "running" ? (
              <Button variant="secondary" onClick={() => act("pause")} loading={busy === "pause"}><Pause className="h-4 w-4" /> Pause</Button>
            ) : c.status !== "completed" ? (
              <Button onClick={() => act(c.status === "paused" ? "resume" : "start")} loading={busy === "start" || busy === "resume"}><Play className="h-4 w-4" /> {c.status === "paused" ? "Resume" : "Start"}</Button>
            ) : null}
            {c.status !== "completed" && c.status !== "draft" && <Button variant="ghost" onClick={() => act("complete")} title="Stop permanently"><Square className="h-4 w-4" /></Button>}
            <Button variant="danger" onClick={() => act("delete")}><Trash2 className="h-4 w-4" /></Button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 border-b border-white/10">
        {(["steps", "leads", "activity"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-cyan-400 text-white" : "text-white/50 hover:text-white"}`}>
            {t === "leads" ? `Leads (${c.leads.length})` : t === "activity" ? `Activity (${c.messages.length})` : "Emails & settings"}
          </button>
        ))}
      </div>

      {tab === "steps" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {!editable && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Pause the campaign to edit emails.</p>}
            {steps.map((s, i) => (
              <Card key={i} className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">{i === 0 ? "Email 1 — first touch" : `Follow-up ${i}`}</h3>
                  <div className="flex items-center gap-2">
                    {i > 0 && (
                      <label className="flex items-center gap-2 text-xs text-white/60">
                        send <Input type="number" min={1} max={60} value={s.delayDays} disabled={!editable} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, delayDays: Number(e.target.value) } : x)))} className="!w-16 !py-1" /> days after previous (if no reply)
                      </label>
                    )}
                    {steps.length > 1 && editable && <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="text-white/40 hover:text-red-300" aria-label="Remove step"><X className="h-4 w-4" /></button>}
                  </div>
                </div>
                <Field label="Subject" hint={i > 0 ? "Leave empty to send as reply in the same thread (Re: …)" : undefined}>
                  <Input value={s.subject} disabled={!editable} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} />
                </Field>
                <Field label="Body (plain text)" className="mt-3">
                  <Textarea rows={9} value={s.body} disabled={!editable} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
                </Field>
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-white/60">Attachments <span className="text-white/30">(PDF, deck, image… max {MAX_ATTS}, 10 MB each)</span></span>
                    {editable && (
                      <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs hover:bg-white/10 ${uploading === i ? "opacity-50" : ""}`}>
                        <Paperclip className="h-3.5 w-3.5" /> {uploading === i ? "Uploading…" : "Attach file"}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          disabled={uploading !== null}
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.png,.jpg,.jpeg,.gif,.webp,.zip,.mp3,.mp4"
                          onChange={(e) => {
                            attach(i, e.target.files);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {parseAtts(s.attachments).length ? (
                    <ul className="flex flex-wrap gap-2">
                      {parseAtts(s.attachments).map((a) => (
                        <li key={a.path} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-white/50" />
                          <a href={`/api/intubtool/attachments/${a.path}`} className="truncate hover:underline" title={a.name}>{a.name}</a>
                          <span className="shrink-0 text-white/40">{fmtSize(a.size)}</span>
                          {editable && <button type="button" onClick={() => detach(i, a.path)} className="shrink-0 text-white/40 hover:text-red-300" aria-label={`Remove ${a.name}`}><X className="h-3.5 w-3.5" /></button>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-white/30">No attachments — the email is sent as plain text{i === 0 ? "" : " reply"}.</p>
                  )}
                </div>
                <MailHealthBox
                  compact
                  className="mt-4"
                  health={computeHealth({ subject: s.subject, body: s.body, personal: g("personalMode"), trackOpens: g("trackOpens"), attachments: parseAtts(s.attachments).length, isReply: i > 0 })}
                />
              </Card>
            ))}
            {editable && (
              <Button variant="secondary" onClick={() => setSteps([...steps, { order: steps.length, delayDays: 3, subject: "", body: "", attachments: [] }])}><Plus className="h-4 w-4" /> Add follow-up</Button>
            )}
            <p className="text-xs text-white/40">Variables: {VARS.map((v) => <code key={v} className="mr-2 rounded bg-white/10 px-1">{v}</code>)}</p>
          </div>

          <aside className="space-y-4">
            <Card className="space-y-4 p-5">
              <h3 className="font-semibold">Sending</h3>
              <Field label="Campaign name"><Input value={g("name")} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="From name"><Input value={g("fromName") || ""} onChange={(e) => set("fromName", e.target.value)} placeholder="uses Settings default" /></Field>
              <Field label="Send from" hint="Label ids work only after adding them in Gmail → Settings → Accounts → “Send mail as”; otherwise Gmail sends from the main id.">
                <div className="space-y-1.5 rounded-xl border border-white/10 p-2">
                  {[
                    { v: "", label: senders?.main || "Connected Gmail (main id)" },
                    ...(senders?.aliases ?? []).map((a) => ({ v: a, label: a })),
                    ...(g("fromEmail") && !(senders?.aliases ?? []).includes(g("fromEmail") as string) ? [{ v: g("fromEmail") as string, label: g("fromEmail") as string }] : []),
                  ].map((o) => (
                    <label key={o.v || "main"} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
                      <input type="radio" name="fromEmail" className="accent-amber-400" checked={(g("fromEmail") || "") === o.v} onChange={() => set("fromEmail", o.v)} />
                      <span className="truncate">{o.label}</span>
                      {!o.v && <Badge tone="green">main</Badge>}
                    </label>
                  ))}
                  {!senders && <p className="px-2 text-xs text-white/40">Connect Gmail in Settings to load label ids.</p>}
                </div>
              </Field>
              <Field label="CC" hint="Visible to the recipient; comma-separate multiple"><Input value={g("cc") || ""} onChange={(e) => set("cc", e.target.value)} /></Field>
              <Field label="BCC" hint="Default from Settings"><Input value={g("bcc") || ""} onChange={(e) => set("bcc", e.target.value)} /></Field>
              <Field label="Reply-to"><Input value={g("replyTo") || ""} onChange={(e) => set("replyTo", e.target.value)} /></Field>
              <Field label="Daily limit (this campaign)"><Input type="number" value={g("dailyLimit")} onChange={(e) => set("dailyLimit", Number(e.target.value))} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Send from (hour)"><Input type="number" min={0} max={23} value={g("sendWindowStart")} onChange={(e) => set("sendWindowStart", Number(e.target.value))} /></Field>
                <Field label="until (hour)"><Input type="number" min={1} max={24} value={g("sendWindowEnd")} onChange={(e) => set("sendWindowEnd", Number(e.target.value))} /></Field>
              </div>
              <Field label="Min gap between emails (sec)" hint="Randomised a bit. 90–180 looks human."><Input type="number" value={g("minGapSeconds")} onChange={(e) => set("minGapSeconds", Number(e.target.value))} /></Field>
              <div>
                <Toggle checked={g("personalMode")} onChange={(v) => set("personalMode", v)} label="Personal mode (lands in Primary)" />
                <p className="mt-1 pl-14 text-xs text-white/40">Text-only like a mail typed in Gmail: no tracking pixel, no unsubscribe link/header. Opens aren’t counted; replies, bounces and “unsubscribe” replies still are.</p>
              </div>
              {!g("personalMode") && <Toggle checked={g("trackOpens")} onChange={(v) => set("trackOpens", v)} label="Track opens (pixel)" />}
              <Toggle checked={g("stopOnReply")} onChange={(v) => set("stopOnReply", v)} label="Stop follow-ups when they reply" />
              <Toggle checked={g("aiPersonalize")} onChange={(v) => set("aiPersonalize", v)} label="AI personalize each email" />
              {g("aiPersonalize") && (
                <Field label="AI instructions" hint="e.g. Mention their role; keep it under 90 words; casual tone.">
                  <Textarea rows={3} value={g("aiInstructions") || ""} onChange={(e) => set("aiInstructions", e.target.value)} />
                </Field>
              )}
              <Button onClick={save} loading={busy === "save"} className="w-full"><Save className="h-4 w-4" /> Save</Button>
            </Card>
            <Card className="space-y-3 p-5">
              <h3 className="font-semibold">Preview & test</h3>
              <Select value={previewStep} onChange={(e) => setPreviewStep(Number(e.target.value))}>
                {steps.map((_, i) => <option key={i} value={i}>{i === 0 ? "Email 1" : `Follow-up ${i}`}</option>)}
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => doPreview(false)} loading={busy === "preview"}><Eye className="h-4 w-4" /> Preview</Button>
                <Button variant="secondary" onClick={() => doPreview(true, true)} loading={busy === "preview"}><Sparkles className="h-4 w-4" /> AI preview</Button>
              </div>
              <Button variant="ghost" onClick={testSend} loading={busy === "test"} className="w-full"><Send className="h-4 w-4" /> Send test to me</Button>
              {testHealth && <MailHealthBox compact health={testHealth} />}
            </Card>
          </aside>
        </div>
      )}

      {tab === "leads" && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <p className="text-sm text-white/80">{c.leads.length} leads in campaign{lq ? ` · ${shownLeads.length} shown` : ""}</p>
              <p className="text-xs text-white/40">Only leads with an email who haven’t unsubscribed can be added.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.leads.length > 0 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                  <Input value={leadQ} onChange={(e) => setLeadQ(e.target.value)} placeholder="Filter by name / company / status" className="!w-64 !py-1.5 !pl-8 !text-xs" />
                </div>
              )}
              {checked.size > 0 && <Button variant="danger" onClick={() => removeLeads(Array.from(checked))} loading={busy === "remove"}><X className="h-4 w-4" /> Remove {checked.size}</Button>}
              <Button onClick={() => setAddOpen(true)}><Users className="h-4 w-4" /> Add leads</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-white/50">
                <tr>
                  <th className="w-10 px-4 py-2"><input type="checkbox" checked={allShownChecked} onChange={toggleAllShown} disabled={!shownLeads.length} aria-label="Select all shown" className="h-4 w-4 accent-cyan-400" /></th>
                  <th className="px-3 py-2">Lead</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Step</th><th className="px-3 py-2">Next send</th><th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {shownLeads.map((cl) => (
                  <tr key={cl.id} className={checked.has(cl.lead.id) ? "bg-cyan-500/5" : ""}>
                    <td className="px-4 py-2"><input type="checkbox" checked={checked.has(cl.lead.id)} onChange={() => toggleChecked(cl.lead.id)} aria-label={`Select ${cl.lead.fullName}`} className="h-4 w-4 accent-cyan-400" /></td>
                    <td className="px-3 py-2"><p className="font-medium">{cl.lead.fullName}</p><p className="text-xs text-white/50">{cl.lead.title || "—"} · {cl.lead.company}</p></td>
                    <td className="px-3 py-2 text-xs">{cl.lead.email}</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(cl.status)}>{cl.status}</Badge></td>
                    <td className="px-3 py-2 text-xs">{cl.currentStep}/{c.steps.length}</td>
                    <td className="px-3 py-2 text-xs text-white/50">{cl.status === "pending" || cl.status === "active" ? fmtDate(cl.nextSendAt) : "—"}</td>
                    <td className="px-3 py-2 text-right"><button type="button" onClick={() => removeLeads([cl.lead.id])} className="text-white/30 hover:text-red-300" aria-label="Remove"><X className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.leads.length === 0 && <p className="p-8 text-center text-sm text-white/40">No leads yet. Click “Add leads” to pick by company, category, list or name — or use the bulk bar on the Leads page.</p>}
          {c.leads.length > 0 && shownLeads.length === 0 && <p className="p-8 text-center text-sm text-white/40">No leads match “{leadQ}”.</p>}
        </Card>
      )}

      {tab === "activity" && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-white/50">
              <tr><th className="px-5 py-2">When</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Opens</th><th className="px-3 py-2">Reply / bounce</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {c.messages.map((m) => (
                <tr key={m.id}>
                  <td className="px-5 py-2 text-xs text-white/50" title={fmtDate(m.sentAt)}>{timeAgo(m.sentAt)}</td>
                  <td className="px-3 py-2"><p className="text-xs">{m.lead?.fullName || m.toEmail}</p><p className="text-[11px] text-white/40">{m.toEmail}</p></td>
                  <td className="px-3 py-2 text-xs">{m.subject} {m.stepOrder > 0 && <Badge>follow-up {m.stepOrder}</Badge>} {m.aiPersonalized && <Badge tone="violet">AI</Badge>} {m.spamScore != null && m.spamScore >= 5 && <Badge tone="amber" title="Spam-risk score"><ShieldAlert className="h-3 w-3" /> {m.spamScore}</Badge>}</td>
                  <td className="px-3 py-2"><Badge tone={statusTone(m.status)} title={m.error || undefined}>{m.status}</Badge></td>
                  <td className="px-3 py-2 text-xs">{m.openCount > 0 ? <span className="text-emerald-300">{m.openCount}×</span> : <span className="text-white/30">—</span>}</td>
                  <td className="px-3 py-2 text-xs">
                    {m.repliedAt && <p className="text-violet-300" title={m.replySnippet || ""}>Replied {timeAgo(m.repliedAt)}</p>}
                    {m.bouncedAt && <p className="text-red-300" title={m.bounceReason || ""}>Bounced</p>}
                    {m.error && <p className="text-red-300">{m.error}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.messages.length === 0 && <p className="p-8 text-center text-sm text-white/40">Nothing sent yet.</p>}
        </Card>
      )}

      <Modal open={!!preview} onClose={() => setPreview(null)} title={`Preview → ${preview?.lead.fullName} (${preview?.lead.company})`} wide>
        {preview && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs text-white/40">To: {preview.lead.email || "(no email)"}</p>
              <p className="mt-1 font-semibold">{preview.subject}</p>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-white/80">{preview.text}</pre>
              {preview.aiPersonalized && <p className="mt-3 text-xs text-violet-300"><Sparkles className="inline h-3 w-3" /> AI personalized</p>}
              {preview.personal && <p className="mt-3 text-xs text-emerald-300">Personal mode — sent as plain text, no pixel / unsubscribe header</p>}
              {parseAtts(steps[previewStep]?.attachments).length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                  <Paperclip className="h-3 w-3" /> {parseAtts(steps[previewStep]?.attachments).map((a) => a.name).join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-3">
              <MailHealthBox health={preview.health} />
              {preview.aiReview && (
                <div className="rounded-xl bg-violet-500/10 p-3 text-xs">
                  <p className="text-sm font-semibold">AI review: {preview.aiReview.score}/10</p>
                  <ul className="mt-1 list-disc pl-4 text-white/70">{preview.aiReview.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  {preview.aiReview.improvedBody && editable && (
                    <Button variant="secondary" className="mt-2 w-full" onClick={() => { setSteps(steps.map((s, i) => (i === previewStep ? { ...s, subject: preview.aiReview?.improvedSubject || s.subject, body: preview.aiReview?.improvedBody || s.body } : s))); setPreview(null); }}>
                      Use AI-improved version
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <LeadPicker open={addOpen} campaignId={id} onClose={() => setAddOpen(false)} onDone={(m) => { success(m); setAddOpen(false); load(); }} onError={error} />
    </>
  );
}
