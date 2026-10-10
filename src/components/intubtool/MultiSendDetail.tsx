"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Play, Pause, Square, Download, Trash2, Upload, RefreshCw, Save, Send, Star, Flame, Snowflake, MessageCircle, ShieldCheck, Plus, X, Activity, Link2, LogIn } from "lucide-react";
import { PageHeader, Card, Button, Field, Input, Textarea, Select, Toggle, useToast, api } from "@/components/admin/ui";
import { Badge, Empty, fmtDate, timeAgo } from "./bits";
import { blastLabel, blastTone } from "./MultiSendPage";

type Template = { subject: string; body: string };
type Account = {
  id: string; order: number; ownerKey: string; email: string; label: string | null; enabled: boolean; quota: number; effectiveQuota: number;
  warmup: boolean; warmupStart: number; warmupStep: number; warmupEveryDays: number; connected: boolean; blocked: boolean; blockedUntil: string | null; lastError: string | null;
  rangeStart: number | null; rangeEnd: number | null; stats: { sent: number; replied: number; bounced: number; queued: number; today: number };
};
type Blast = {
  id: string; name: string; status: string; templateList: Template[]; followUpEnabled: boolean; followUpDays: number; followUpSubject: string; followUpBody: string;
  gapMinSeconds: number; gapMaxSeconds: number; sendWindowStart: number; sendWindowEnd: number; autoRunHour: number | null; trackOpens: boolean; trackClicks: boolean;
  verifyBeforeSend: boolean; summaryEmail: string | null; summaryHour: number; lastRunAt: string | null; accounts: Account[];
  stats: { total: number; pending: number; queued: number; sent: number; replied: number; bounced: number; unsubscribed: number; failed: number; skipped: number; hold: number; invalid: number; opened: number; clicked: number; followUps: number; sentToday: number };
};
type Msg = { id: string; kind: string; status: string; sentAt: string; openCount: number; clickCount: number; repliedAt: string | null; replySnippet: string | null; bounceReason: string | null; error: string | null; variant: number };
type Lead = {
  id: string; serial: number; email: string; fullName: string; company: string | null; title: string | null; phone: string | null; status: string; statusNote: string | null; verifyStatus: string; vip: boolean;
  replyTag: string | null; notes: string | null; sentAt: string | null; followUpSentAt: string | null; repliedAt: string | null; account: { id: string; order: number; email: string } | null; messages: Msg[];
};
type Reply = Lead & { messages: { subject: string; replySnippet: string | null; repliedAt: string | null; fromEmail: string }[] };

const TABS = ["accounts", "database", "content", "replies"] as const;
type Tab = (typeof TABS)[number];
const HOURS = Array.from({ length: 25 }, (_, i) => i);
const LEAD_STATUSES = ["", "pending", "queued", "contacted", "replied", "bounced", "unsubscribed", "failed", "skipped", "hold", "invalid"];

const leadTone = (s: string) =>
  (({ pending: "amber", queued: "cyan", sent: "green", replied: "violet", bounced: "red", unsubscribed: "red", failed: "red", skipped: "gray", hold: "gray", invalid: "red" }) as const)[s] || "gray";
const verifyTone = (s: string) => (({ valid: "green", risky: "amber", invalid: "red", none: "gray" }) as const)[s] || "gray";
const wa = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, "")}`;

export default function MultiSendDetail({ id }: { id: string }) {
  const router = useRouter();
  const { toast, success, error } = useToast();
  const [b, setB] = useState<Blast | null>(null);
  const [tab, setTab] = useState<Tab>("accounts");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api<Blast>(`/api/intubtool/blasts/${id}`).then(setB).catch((e: Error) => error(e.message)), [id, error]);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: string) => {
    setBusy(action);
    try {
      if (action === "delete") {
        if (!confirm("Delete this list, its database and send history?")) return;
        await api(`/api/intubtool/blasts/${id}`, { method: "DELETE" });
        router.push("/intubtool/multi-send");
        return;
      }
      const r = await api<{ message: string }>(`/api/intubtool/blasts/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
      success(r.message);
      load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!b) return <p className="text-sm text-white/50">Loading…</p>;
  const s = b.stats;

  return (
    <>
      {toast}
      <Link href="/intubtool/multi-send" className="mb-4 inline-flex items-center gap-1 text-sm text-white/50 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All lists
      </Link>
      <PageHeader
        title={b.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={blastTone(b.status)}>{blastLabel(b.status)}</Badge>
            <span>{b.accounts.filter((a) => a.enabled && a.connected).length} of {b.accounts.length} accounts included</span>
            {b.lastRunAt && <span>· last start {timeAgo(b.lastRunAt)}</span>}
            {b.autoRunHour != null && <span>· auto-run daily {String(b.autoRunHour).padStart(2, "0")}:00</span>}
          </span>
        }
        actions={
          <>
            {b.status === "running" ? (
              <>
                <Button variant="secondary" onClick={() => act("pause")} loading={busy === "pause"}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
                <Button variant="secondary" onClick={() => act("stop")} loading={busy === "stop"} title="Return queued leads to pending">
                  <Square className="h-4 w-4" /> Stop run
                </Button>
              </>
            ) : (
              <Button onClick={() => act(b.status === "paused" ? "resume" : "start")} loading={busy === "start" || busy === "resume"} disabled={!s.total}>
                <Play className="h-4 w-4" /> {b.status === "paused" ? "Resume" : "Start next run"}
              </Button>
            )}
            <a href={`/api/intubtool/blasts/${id}/report`}>
              <Button variant="secondary">
                <Download className="h-4 w-4" /> Report
              </Button>
            </a>
            <Button variant="danger" onClick={() => act("delete")} loading={busy === "delete"}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
        {[
          ["Database", s.total, ""], ["Pending", s.pending, "text-amber-300"], ["Queued", s.queued, "text-cyan-300"], ["Sent", s.sent, "text-emerald-300"], ["Today", s.sentToday, ""],
          ["Follow-ups", s.followUps, ""], ["Opened", s.opened, ""], ["Replied", s.replied, "text-violet-300"], ["Bounced", s.bounced, "text-red-300"], ["Skipped/Invalid", s.skipped + s.invalid, "text-white/60"],
        ].map(([l, v, c]) => (
          <Card key={l as string} className="p-3 text-center">
            <p className={`text-xl font-extrabold ${c}`}>{v as number}</p>
            <p className="text-[10px] uppercase tracking-wider text-white/45">{l as string}</p>
          </Card>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold capitalize ${tab === t ? "border-cyan-400 text-white" : "border-transparent text-white/50 hover:text-white"}`}>
            {t === "content" ? "Content & settings" : t === "replies" ? `Replies (${s.replied})` : t}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsTab b={b} reload={load} notify={{ success, error }} />}
      {tab === "database" && <DatabaseTab b={b} reload={load} notify={{ success, error }} />}
      {tab === "content" && <ContentTab b={b} reload={load} notify={{ success, error }} />}
      {tab === "replies" && <RepliesTab b={b} notify={{ success, error }} />}
    </>
  );
}

type Notify = { success: (m: string) => void; error: (m: string) => void };

/* ───────────────────────── Accounts ───────────────────────── */

function AccountsTab({ b, reload, notify }: { b: Blast; reload: () => void; notify: Notify }) {
  const [rows, setRows] = useState<Account[]>(b.accounts);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testAcc, setTestAcc] = useState("");
  useEffect(() => {
    if (!dirty) setRows(b.accounts);
  }, [b.accounts, dirty]);

  const patch = (id: string, p: Partial<Account>) => {
    setRows((r) => r.map((a) => (a.id === id ? { ...a, ...p } : a)));
    setDirty(true);
  };
  const save = async (extra?: { id: string; unblock: boolean }) => {
    setBusy("save");
    try {
      await api(`/api/intubtool/blasts/${b.id}/accounts`, {
        method: "PUT",
        body: JSON.stringify({ accounts: rows.map((a) => ({ id: a.id, enabled: a.enabled, quota: a.quota, order: a.order, warmup: a.warmup, warmupStart: a.warmupStart, warmupStep: a.warmupStep, warmupEveryDays: a.warmupEveryDays, unblock: extra?.id === a.id })) }),
      });
      setDirty(false);
      notify.success("Accounts saved");
      reload();
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy("test");
    try {
      const r = await api<{ message: string }>(`/api/intubtool/blasts/${b.id}/test`, { method: "POST", body: JSON.stringify({ to: testTo, accountId: testAcc || undefined }) });
      notify.success(r.message);
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const total = rows.filter((a) => a.enabled && a.connected && !a.blocked).reduce((n, a) => n + a.effectiveQuota, 0);
  const reconnectLink = async (a: Account) => {
    setBusy(`link-${a.id}`);
    try {
      const r = await api<{ message: string }>("/api/intubtool/accounts/reconnect-link", { method: "POST", body: JSON.stringify({ ownerKey: a.ownerKey }) });
      notify.success(r.message);
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const connectNow = async (a: Account) => {
    setBusy(`connect-${a.id}`);
    try {
      const r = await api<{ url: string }>("/api/intubtool/gmail/connect", { method: "POST", body: JSON.stringify({ forOwner: a.ownerKey }) });
      window.location.href = r.url;
    } catch (e) {
      notify.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-5 py-3 text-sm text-white/60">
          <span>
            Every Gmail connected by any user shows up here. <b className="text-white">Include</b> = use this account in this list. <b className="text-white">Per run</b> = how many leads it takes each Start. Next run: <b className="text-white">{total}</b> mails.
          </span>
          <div className="flex gap-2">
            <Link href="/intubtool/multi-send/accounts"><Button variant="ghost"><Activity className="h-4 w-4" /> Accounts health</Button></Link>
            <Button variant="secondary" onClick={() => api(`/api/intubtool/blasts/${b.id}/action`, { method: "POST", body: JSON.stringify({ action: "sync-accounts" }) }).then(reload)}>
              <RefreshCw className="h-4 w-4" /> Refresh accounts
            </Button>
            <Button onClick={() => save()} loading={busy === "save"} disabled={!dirty}>
              <Save className="h-4 w-4" /> Save
            </Button>
          </div>
        </div>
        <table className="w-full min-w-[980px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/45">
            <tr>
              <th className="px-4 py-2">#</th><th className="px-2 py-2">Account</th><th className="px-2 py-2">Include</th><th className="px-2 py-2">Per run</th><th className="px-2 py-2">Warm-up</th>
              <th className="px-2 py-2">Last range</th><th className="px-2 py-2">Sent</th><th className="px-2 py-2">Today</th><th className="px-2 py-2">Replied</th><th className="px-2 py-2">Bounced</th><th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((a) => (
              <tr key={a.id} className={a.enabled ? "" : "opacity-50"}>
                <td className="px-4 py-2">
                  <Input type="number" min={1} value={a.order} onChange={(e) => patch(a.id, { order: Number(e.target.value) })} className="w-16 !py-1" />
                </td>
                <td className="px-2 py-2">
                  <p className="font-medium">{a.email}</p>
                  <p className="text-xs text-white/45">{a.label}</p>
                </td>
                <td className="px-2 py-2"><Toggle checked={a.enabled} onChange={(v) => patch(a.id, { enabled: v })} label="" /></td>
                <td className="px-2 py-2">
                  <Input type="number" min={0} value={a.quota} onChange={(e) => patch(a.id, { quota: Number(e.target.value) })} className="w-20 !py-1" />
                  {a.warmup && <p className="mt-0.5 text-[11px] text-amber-300">now {a.effectiveQuota}</p>}
                </td>
                <td className="px-2 py-2">
                  <Toggle checked={a.warmup} onChange={(v) => patch(a.id, { warmup: v })} label="" />
                  {a.warmup && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-white/50">
                      <Input type="number" min={1} value={a.warmupStart} onChange={(e) => patch(a.id, { warmupStart: Number(e.target.value) })} className="w-12 !px-1 !py-0.5 text-xs" title="Start with" />+
                      <Input type="number" min={1} value={a.warmupStep} onChange={(e) => patch(a.id, { warmupStep: Number(e.target.value) })} className="w-12 !px-1 !py-0.5 text-xs" title="Increase by" />/
                      <Input type="number" min={1} value={a.warmupEveryDays} onChange={(e) => patch(a.id, { warmupEveryDays: Number(e.target.value) })} className="w-12 !px-1 !py-0.5 text-xs" title="every N days" />d
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-white/70">{a.rangeStart ? `${a.rangeStart}–${a.rangeEnd}` : "—"}{a.stats.queued ? <span className="ml-1 text-cyan-300">({a.stats.queued} left)</span> : null}</td>
                <td className="px-2 py-2 text-emerald-300">{a.stats.sent}</td>
                <td className="px-2 py-2">{a.stats.today}</td>
                <td className="px-2 py-2 text-violet-300">{a.stats.replied}</td>
                <td className="px-2 py-2 text-red-300">{a.stats.bounced}</td>
                <td className="px-2 py-2">
                  {!a.connected ? (
                    <div>
                      <Badge tone="red">Gmail disconnected</Badge>
                      <div className="mt-1 flex gap-2 text-[11px]">
                        <button type="button" className="inline-flex items-center gap-1 text-cyan-300 hover:underline disabled:opacity-50" disabled={busy === `link-${a.id}`} onClick={() => reconnectLink(a)}><Link2 className="h-3 w-3" /> Send reconnect link</button>
                        <button type="button" className="inline-flex items-center gap-1 text-cyan-300 hover:underline disabled:opacity-50" disabled={busy === `connect-${a.id}`} onClick={() => connectNow(a)}><LogIn className="h-3 w-3" /> Connect now</button>
                      </div>
                    </div>
                  ) : a.blocked ? (
                    <div>
                      <Badge tone="red" title={a.lastError || ""}>Blocked till {fmtDate(a.blockedUntil)}</Badge>
                      <button type="button" className="ml-1 text-[11px] text-cyan-300 hover:underline" onClick={() => save({ id: a.id, unblock: true })}>Unblock</button>
                      {a.lastError && <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-white/40" title={a.lastError}>{a.lastError}</p>}
                    </div>
                  ) : (
                    <Badge tone="green">Ready</Badge>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-white/50">No Gmail account connected yet — connect in Settings (admin) or let members connect theirs.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <Card className="flex flex-wrap items-end gap-3 p-5">
        <Field label="Send test mail to" className="flex-1 min-w-[220px]"><Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /></Field>
        <Field label="From account">
          <Select value={testAcc} onChange={(e) => setTestAcc(e.target.value)}>
            <option value="">First included</option>
            {rows.map((a) => <option key={a.id} value={a.id}>#{a.order} {a.email}</option>)}
          </Select>
        </Field>
        <Button variant="secondary" onClick={test} loading={busy === "test"}><Send className="h-4 w-4" /> Send test</Button>
      </Card>
    </div>
  );
}

/* ───────────────────────── Database ───────────────────────── */

type Preview = { headers: string[]; mapping: Record<string, number>; rows: number; parsed: number; noEmail: number; duplicateInFile: number; sample: { email: string; fullName: string; company?: string }[]; emailDetected: boolean };
type ImportResult = { added: number; alreadyInList: number; skippedContacted: number; skippedSuppressed: number; invalid: number; risky: number; firstSerial: number | null; lastSerial: number | null; noEmail: number; duplicateInFile: number };

function DatabaseTab({ b, reload, notify }: { b: Blast; reload: () => void; notify: Notify }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [emailCol, setEmailCol] = useState<number>(-1);
  const [dedupe, setDedupe] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; rows: Lead[] } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const loadLeads = useCallback(() => {
    const sp = new URLSearchParams({ page: String(page), size: "50", status, q });
    return api<{ total: number; rows: Lead[] }>(`/api/intubtool/blasts/${b.id}/leads?${sp}`).then(setData).catch((e: Error) => notify.error(e.message));
  }, [b.id, page, status, q, notify]);
  useEffect(() => {
    loadLeads();
  }, [loadLeads, b.stats.sent, b.stats.total]);

  const upload = async (mode: "preview" | "import") => {
    if (!file) return;
    setBusy(mode);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      fd.append("dedupe", dedupe ? "1" : "0");
      if (emailCol >= 0) fd.append("mapping", JSON.stringify({ email: emailCol }));
      const res = await fetch(`/api/intubtool/blasts/${b.id}/import`, { method: "POST", body: fd });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: Preview & ImportResult };
      if (!res.ok || !j.data) throw new Error(j.error || `Upload failed (${res.status})`);
      if (mode === "preview") {
        setPreview(j.data);
        if (j.data.mapping.email != null) setEmailCol(j.data.mapping.email);
      } else {
        const r = j.data;
        notify.success(`Added ${r.added} leads (#${r.firstSerial ?? "—"}–${r.lastSerial ?? "—"}) · ${r.alreadyInList} already in list · ${r.skippedContacted} already contacted · ${r.skippedSuppressed} replied/bounced before · ${r.invalid} invalid emails`);
        setPreview(null);
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        reload();
        loadLeads();
      }
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const bulk = async (action: string, all = false) => {
    if (!all && !sel.size) return;
    if (action === "delete" && !confirm(all ? `Delete ALL ${data?.total ?? 0} leads matching the current filter?` : `Delete ${sel.size} leads?`)) return;
    setBusy(action);
    try {
      const r = await api<{ affected: number }>(`/api/intubtool/blasts/${b.id}/leads`, { method: "PUT", body: JSON.stringify({ action, ids: Array.from(sel), all, filter: { status, q } }) });
      notify.success(`${r.affected} leads updated`);
      setSel(new Set());
      reload();
      loadLeads();
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Upload database (CSV / XLSX)" hint="Needs an email column; name, company, title, phone auto-detected. Other columns become {{column_name}} variables. Serial numbers continue from the last one." className="flex-1 min-w-[260px]">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" className="input" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
          </Field>
          <Toggle checked={dedupe} onChange={setDedupe} label="Duplicate check (skip already contacted / replied / bounced)" />
          <Button variant="secondary" onClick={() => upload("preview")} loading={busy === "preview"} disabled={!file}><Upload className="h-4 w-4" /> Preview</Button>
        </div>
        {preview && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span>{preview.rows} rows → <b>{preview.parsed}</b> with valid email</span>
              {preview.noEmail > 0 && <Badge tone="amber">{preview.noEmail} without email</Badge>}
              {preview.duplicateInFile > 0 && <Badge tone="gray">{preview.duplicateInFile} duplicates in file</Badge>}
              <Field label="Email column" className="ml-auto">
                <Select value={emailCol} onChange={(e) => setEmailCol(Number(e.target.value))}>
                  <option value={-1}>auto-detect</option>
                  {preview.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </Select>
              </Field>
            </div>
            <ul className="mt-2 text-xs text-white/55">{preview.sample.slice(0, 5).map((r, i) => <li key={i}>{r.email} — {r.fullName} {r.company ? `· ${r.company}` : ""}</li>)}</ul>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => upload("preview")} loading={busy === "preview"}>Re-check</Button>
              <Button onClick={() => upload("import")} loading={busy === "import"} disabled={!preview.parsed}>Add {preview.parsed} leads to database</Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-44">
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}</option>)}
          </Select>
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search email / name / company" className="w-64" />
          <Button variant="secondary" onClick={() => api<{ message: string }>(`/api/intubtool/blasts/${b.id}/action`, { method: "POST", body: JSON.stringify({ action: "verify" }) }).then((r) => { notify.success(r.message); reload(); loadLeads(); }).catch((e: Error) => notify.error(e.message))} title="Verify unverified emails (format + mail server)">
            <ShieldCheck className="h-4 w-4" /> Verify emails
          </Button>
          <span className="ml-auto text-xs text-white/50">{data?.total ?? 0} leads{sel.size ? ` · ${sel.size} selected` : ""}</span>
        </div>
        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-cyan-500/5 px-4 py-2 text-xs">
            <span className="text-white/60">Selected:</span>
            <Button variant="ghost" onClick={() => bulk("hold")} title="Pause these leads (not sent until released)">Hold</Button>
            <Button variant="ghost" onClick={() => bulk("release")} title="Back to pending (held / skipped / failed / invalid)">Release → pending</Button>
            <Button variant="ghost" onClick={() => bulk("skip")}>Skip</Button>
            <Button variant="ghost" onClick={() => bulk("vip")}><Star className="h-3.5 w-3.5" /> VIP</Button>
            <Button variant="ghost" onClick={() => bulk("unvip")}>Un-VIP</Button>
            <Button variant="ghost" onClick={() => bulk("delete")} className="text-red-300">Delete</Button>
            <span className="text-white/30">|</span>
            <Button variant="ghost" onClick={() => bulk("release", true)}>Release ALL in filter</Button>
            <Button variant="ghost" onClick={() => bulk("delete", true)} className="text-red-300">Delete ALL in filter</Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-2"><input type="checkbox" checked={!!data?.rows.length && data.rows.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(data?.rows.map((r) => r.id)) : new Set())} /></th>
                <th className="px-2 py-2">#</th><th className="px-2 py-2">Lead</th><th className="px-2 py-2">Company</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Email check</th><th className="px-2 py-2">Via</th><th className="px-2 py-2">Sent</th><th className="px-2 py-2">Opens / Clicks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data?.rows.map((l) => {
                const m = l.messages.find((x) => x.kind === "initial") || l.messages[0];
                return (
                  <tr key={l.id} className={sel.has(l.id) ? "bg-cyan-500/5" : ""}>
                    <td className="px-4 py-2"><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
                    <td className="px-2 py-2 text-white/60">{l.serial}</td>
                    <td className="px-2 py-2">
                      <p className="flex items-center gap-1 font-medium">{l.vip && <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />}{l.fullName || "—"}</p>
                      <p className="text-xs text-white/50">{l.email}{l.title ? ` · ${l.title}` : ""}</p>
                    </td>
                    <td className="px-2 py-2 text-white/70">{l.company || "—"}</td>
                    <td className="px-2 py-2">
                      <Badge tone={leadTone(l.status)}>{l.status}</Badge>
                      {l.statusNote && <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-white/45" title={l.statusNote}>{l.statusNote}</p>}
                      {l.followUpSentAt && <p className="text-[11px] text-white/45">follow-up sent</p>}
                    </td>
                    <td className="px-2 py-2"><Badge tone={verifyTone(l.verifyStatus)}>{l.verifyStatus === "none" ? "not checked" : l.verifyStatus}</Badge></td>
                    <td className="px-2 py-2 text-xs text-white/60">{l.account ? `#${l.account.order}` : "—"}</td>
                    <td className="px-2 py-2 text-xs text-white/60">{l.sentAt ? fmtDate(l.sentAt) : "—"}</td>
                    <td className="px-2 py-2 text-xs text-white/60">{m ? `${m.openCount} / ${m.clickCount}` : "—"}</td>
                  </tr>
                );
              })}
              {data && !data.rows.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-white/50">No leads{status || q ? " match this filter" : " yet — upload a CSV/XLSX above"}.</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-2 text-xs text-white/60">
            <Button variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prev</Button>
            <span>Page {page} / {pages}</span>
            <Button variant="ghost" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>Next →</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ───────────────────────── Content & settings ───────────────────────── */

function ContentTab({ b, reload, notify }: { b: Blast; reload: () => void; notify: Notify }) {
  const [f, setF] = useState({
    name: b.name, templates: b.templateList.length ? b.templateList : [{ subject: "", body: "" }], followUpEnabled: b.followUpEnabled, followUpDays: b.followUpDays, followUpSubject: b.followUpSubject, followUpBody: b.followUpBody,
    gapMinSeconds: b.gapMinSeconds, gapMaxSeconds: b.gapMaxSeconds, sendWindowStart: b.sendWindowStart, sendWindowEnd: b.sendWindowEnd, autoRunHour: b.autoRunHour, trackOpens: b.trackOpens, trackClicks: b.trackClicks,
    verifyBeforeSend: b.verifyBeforeSend, summaryEmail: b.summaryEmail || "", summaryHour: b.summaryHour,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setTpl = (i: number, p: Partial<Template>) => set("templates", f.templates.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/intubtool/blasts/${b.id}`, { method: "PUT", body: JSON.stringify(f) });
      notify.success("Saved");
      reload();
    } catch (e) {
      notify.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const hourOpts = HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <Field label="List name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <p className="text-xs text-white/50">
            Variables: <code>{"{{first_name}} {{full_name}} {{company}} {{title}} {{email}} {{sender_name}} {{sender_email}} {{signature}} {{unsubscribe_url}}"}</code> + any extra column from your upload as <code>{"{{column_name}}"}</code>. Sender name/signature come from that account&apos;s own Settings.
          </p>
          {f.templates.map((t, i) => (
            <div key={i} className="rounded-xl border border-white/10 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Template {String.fromCharCode(65 + i)} {f.templates.length > 1 && <span className="text-xs font-normal text-white/45">— accounts rotate A, B, C…</span>}</p>
                {f.templates.length > 1 && <button type="button" onClick={() => set("templates", f.templates.filter((_, j) => j !== i))} className="text-white/40 hover:text-red-300"><X className="h-4 w-4" /></button>}
              </div>
              <Field label="Subject"><Input value={t.subject} onChange={(e) => setTpl(i, { subject: e.target.value })} /></Field>
              <Field label="Body" className="mt-3"><Textarea value={t.body} onChange={(e) => setTpl(i, { body: e.target.value })} className="min-h-[180px]" /></Field>
            </div>
          ))}
          {f.templates.length < 5 && (
            <Button variant="secondary" onClick={() => set("templates", [...f.templates, { subject: f.templates[0]?.subject || "", body: f.templates[0]?.body || "" }])}><Plus className="h-4 w-4" /> Add A/B variant</Button>
          )}
        </Card>
        <Card className="space-y-3 p-5">
          <Toggle checked={f.followUpEnabled} onChange={(v) => set("followUpEnabled", v)} label="Automatic follow-up to leads who don't reply (sent from the same account, in the same thread)" />
          {f.followUpEnabled && (
            <>
              <Field label="Days after first mail"><Input type="number" min={1} value={f.followUpDays} onChange={(e) => set("followUpDays", Number(e.target.value))} className="w-28" /></Field>
              <Field label="Follow-up subject" hint="Leave empty to reply in the same thread (Re: …)"><Input value={f.followUpSubject} onChange={(e) => set("followUpSubject", e.target.value)} /></Field>
              <Field label="Follow-up body"><Textarea value={f.followUpBody} onChange={(e) => set("followUpBody", e.target.value)} className="min-h-[120px]" /></Field>
            </>
          )}
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <p className="text-sm font-semibold">Sending</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gap min (sec)"><Input type="number" min={5} value={f.gapMinSeconds} onChange={(e) => set("gapMinSeconds", Number(e.target.value))} /></Field>
            <Field label="Gap max (sec)"><Input type="number" min={5} value={f.gapMaxSeconds} onChange={(e) => set("gapMaxSeconds", Number(e.target.value))} /></Field>
            <Field label="Window from"><Select value={f.sendWindowStart} onChange={(e) => set("sendWindowStart", Number(e.target.value))}>{hourOpts}</Select></Field>
            <Field label="Window to" hint="same = 24h"><Select value={f.sendWindowEnd} onChange={(e) => set("sendWindowEnd", Number(e.target.value))}>{hourOpts}</Select></Field>
          </div>
          <Field label="Auto daily run" hint="Starts the next run itself every day at this time (server time) — no need to press Start">
            <Select value={f.autoRunHour ?? ""} onChange={(e) => set("autoRunHour", e.target.value === "" ? null : Number(e.target.value))}>
              <option value="">Off — manual Start</option>
              {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </Select>
          </Field>
          <Toggle checked={f.verifyBeforeSend} onChange={(v) => set("verifyBeforeSend", v)} label="Verify emails on upload & before each run (invalid ones never sent)" />
          <Toggle checked={f.trackOpens} onChange={(v) => set("trackOpens", v)} label="Track opens" />
          <Toggle checked={f.trackClicks} onChange={(v) => set("trackClicks", v)} label="Track link clicks" />
        </Card>
        <Card className="space-y-3 p-5">
          <p className="text-sm font-semibold">Daily summary</p>
          <Field label="Send summary to" hint="Empty = off"><Input value={f.summaryEmail} onChange={(e) => set("summaryEmail", e.target.value)} placeholder="you@gmail.com" /></Field>
          <Field label="At"><Select value={f.summaryHour} onChange={(e) => set("summaryHour", Number(e.target.value))}>{HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</Select></Field>
        </Card>
        <Button onClick={save} loading={busy} className="w-full"><Save className="h-4 w-4" /> Save content & settings</Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Replies inbox ───────────────────────── */

function RepliesTab({ b, notify }: { b: Blast; notify: Notify }) {
  const [rows, setRows] = useState<Reply[] | null>(null);
  const [filter, setFilter] = useState<"" | "hot" | "cold" | "untagged">("");
  const load = useCallback(() => api<Reply[]>(`/api/intubtool/blasts/${b.id}/replies`).then(setRows).catch((e: Error) => notify.error(e.message)), [b.id, notify]);
  useEffect(() => {
    load();
  }, [load, b.stats.replied]);
  const update = async (l: Reply, p: { replyTag?: string | null; notes?: string; phone?: string }) => {
    try {
      const u = await api<Lead>(`/api/intubtool/blasts/${b.id}/leads/${l.id}`, { method: "PUT", body: JSON.stringify(p) });
      setRows((r) => r?.map((x) => (x.id === l.id ? { ...x, ...u, messages: x.messages } : x)) ?? null);
    } catch (e) {
      notify.error((e as Error).message);
    }
  };
  const list = (rows || []).filter((r) => (filter === "" ? true : filter === "untagged" ? !r.replyTag : r.replyTag === filter));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["", "hot", "cold", "untagged"] as const).map((x) => (
          <button key={x} type="button" onClick={() => setFilter(x)} className={`rounded-full px-3 py-1 font-semibold ${filter === x ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            {x === "" ? `All (${rows?.length ?? 0})` : x === "hot" ? `🔥 Hot (${rows?.filter((r) => r.replyTag === "hot").length ?? 0})` : x === "cold" ? `❄ Cold (${rows?.filter((r) => r.replyTag === "cold").length ?? 0})` : `Untagged (${rows?.filter((r) => !r.replyTag).length ?? 0})`}
          </button>
        ))}
        <Button variant="ghost" onClick={() => api<{ message: string }>("/api/intubtool/inbox-sync", { method: "POST" }).then((r) => { notify.success(r.message); load(); }).catch((e: Error) => notify.error(e.message))} className="ml-auto"><RefreshCw className="h-4 w-4" /> Check inbox now</Button>
      </div>
      {rows && !list.length && <Empty title="No replies yet">Replies to mails sent from any included account land here automatically (inbox is checked every few minutes).</Empty>}
      {list.map((l) => {
        const m = l.messages[0];
        return (
          <Card key={l.id} className="p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[220px] flex-1">
                <p className="font-semibold">{l.fullName || l.email} {l.status === "unsubscribed" && <Badge tone="red">unsubscribed</Badge>}</p>
                <p className="text-xs text-white/50">{l.email}{l.company ? ` · ${l.company}` : ""}{l.title ? ` · ${l.title}` : ""}</p>
                <p className="mt-1 text-[11px] text-white/40">Replied {fmtDate(l.repliedAt || m?.repliedAt)} · via #{l.account?.order ?? "?"} {m?.fromEmail || l.account?.email}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => update(l, { replyTag: l.replyTag === "hot" ? null : "hot" })} className={`rounded-lg p-2 ${l.replyTag === "hot" ? "bg-orange-500/20 text-orange-300" : "text-white/40 hover:bg-white/10"}`} title="Hot lead"><Flame className="h-4 w-4" /></button>
                <button type="button" onClick={() => update(l, { replyTag: l.replyTag === "cold" ? null : "cold" })} className={`rounded-lg p-2 ${l.replyTag === "cold" ? "bg-sky-500/20 text-sky-300" : "text-white/40 hover:bg-white/10"}`} title="Cold / not interested"><Snowflake className="h-4 w-4" /></button>
                {l.phone ? (
                  <a href={wa(l.phone)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-emerald-300 hover:bg-emerald-500/10" title={`WhatsApp ${l.phone}`}><MessageCircle className="h-4 w-4" /></a>
                ) : (
                  <button type="button" onClick={() => { const p = prompt("Phone number (with country code) for WhatsApp:"); if (p) update(l, { phone: p }); }} className="rounded-lg p-2 text-white/30 hover:bg-white/10" title="Add phone for WhatsApp"><MessageCircle className="h-4 w-4" /></button>
                )}
                <a href={`mailto:${l.email}?subject=${encodeURIComponent(m?.subject ? `Re: ${m.subject.replace(/^Re:\s*/i, "")}` : "")}`} className="rounded-lg p-2 text-white/40 hover:bg-white/10" title="Reply by mail"><Send className="h-4 w-4" /></a>
              </div>
            </div>
            {m?.replySnippet && <blockquote className="mt-3 whitespace-pre-wrap rounded-xl border-l-2 border-violet-400/50 bg-white/[0.03] p-3 text-sm text-white/80">{m.replySnippet}</blockquote>}
            <Textarea defaultValue={l.notes || ""} placeholder="Notes (saved when you click outside)" onBlur={(e) => e.target.value !== (l.notes || "") && update(l, { notes: e.target.value })} className="mt-3 min-h-[56px] text-sm" />
          </Card>
        );
      })}
    </div>
  );
}

