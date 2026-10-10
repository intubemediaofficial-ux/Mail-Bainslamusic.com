"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, Star, Send, FileText, Archive, AlertOctagon, Trash2, Tag, Bookmark, Search, RefreshCw, Paperclip, ChevronLeft, ChevronRight, Loader2, Settings } from "lucide-react";
import { PageHeader, Card, Button, Input, Modal, api } from "@/components/admin/ui";

type Label = { path: string; name: string; specialUse: string | null; messages: number; unseen: number; system: boolean };
type Row = { uid: number; subject: string; from: string; fromEmail: string; date: string | null; seen: boolean; flagged: boolean; attachments: boolean };
type Full = { subject: string; from: string; to: string; cc: string; date: string | null; html: string | null; text: string; attachments: { filename: string; size: number; contentType: string }[] };

const ICONS: Record<string, typeof Inbox> = { "\\Inbox": Inbox, "\\Flagged": Star, "\\Important": Bookmark, "\\Sent": Send, "\\Drafts": FileText, "\\All": Archive, "\\Junk": AlertOctagon, "\\Trash": Trash2 };
const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...(today ? { hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short" }) });
};
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function InboxPage() {
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [err, setErr] = useState("");
  const [path, setPath] = useState("INBOX");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ total: number; perPage: number; messages: Row[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<{ row: Row; full: Full | null; error?: string } | null>(null);

  const loadLabels = useCallback(async () => {
    try {
      setLabels(await api<Label[]>("/api/intubtool/mailbox"));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ path, page: String(page), ...(query ? { q: query } : {}) });
      setData(await api(`/api/intubtool/mailbox?${qs}`));
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  }, [path, page, query]);
  useEffect(() => {
    loadLabels();
  }, [loadLabels]);
  useEffect(() => {
    if (labels) loadMessages();
  }, [labels, loadMessages]);

  const openMsg = async (row: Row) => {
    setOpen({ row, full: null });
    try {
      const full = await api<Full>(`/api/intubtool/mailbox/message?${new URLSearchParams({ path, uid: String(row.uid) })}`);
      setOpen({ row, full });
    } catch (e) {
      setOpen({ row, full: null, error: (e as Error).message });
    }
  };
  const pick = (p: string) => {
    setPath(p);
    setPage(1);
  };
  const current = labels?.find((l) => l.path === path);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const sys = labels?.filter((l) => l.system) || [];
  const user = labels?.filter((l) => !l.system) || [];

  if (err && !labels)
    return (
      <div className="space-y-6">
        <PageHeader title="Gmail Inbox" description="Your Gmail inbox and labels inside Bainsla Mail Tool." />
        <Card className="p-10 text-center">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-white/40" />
          <p className="text-white">Gmail is not connected yet.</p>
          <p className="mt-1 text-sm text-white/50">{err}</p>
          <Link href="/settings" className="mt-5 inline-block"><Button><Settings className="h-4 w-4" /> Connect Gmail in Settings</Button></Link>
        </Card>
      </div>
    );

  const LabelBtn = ({ l }: { l: Label }) => {
    const Icon = (l.specialUse && ICONS[l.specialUse]) || Tag;
    return (
      <button onClick={() => pick(l.path)} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${path === l.path ? "bg-fuchsia-500/20 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{l.name}</span>
        {l.unseen > 0 && <span className="rounded-full bg-fuchsia-500/30 px-2 text-xs font-semibold text-fuchsia-100">{l.unseen}</span>}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gmail Inbox"
        description="All your Gmail labels and mails, read-only (opening here does not mark anything as read)."
        actions={<Button variant="secondary" onClick={() => { loadLabels(); loadMessages(); }}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-3">
          {!labels ? (
            <div className="flex justify-center py-8 text-white/40"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <>
              <div className="space-y-0.5">{sys.map((l) => <LabelBtn key={l.path} l={l} />)}</div>
              {user.length > 0 && (
                <>
                  <div className="mb-1 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-white/40">Labels</div>
                  <div className="space-y-0.5">{user.map((l) => <LabelBtn key={l.path} l={l} />)}</div>
                </>
              )}
            </>
          )}
        </Card>

        <Card className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-4">
            <div className="mr-auto">
              <div className="font-semibold text-white">{current?.name || path}</div>
              <div className="text-xs text-white/40">{data ? `${data.total} mails${query ? ` matching “${query}”` : ""}` : ""}</div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(q.trim()); }} className="flex items-center gap-2">
              <Input placeholder="Search (Gmail style: from:abc has:attachment)" value={q} onChange={(e) => setQ(e.target.value)} className="w-72" />
              <Button variant="secondary" type="submit"><Search className="h-4 w-4" /></Button>
            </form>
          </div>
          {err && labels && <p className="px-4 pt-3 text-sm text-red-300">{err}</p>}
          <div className="divide-y divide-white/5">
            {loading && !data && <div className="flex justify-center py-16 text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            {data?.messages.length === 0 && <p className="py-16 text-center text-sm text-white/50">No mails here.</p>}
            {data?.messages.map((m) => (
              <button key={m.uid} onClick={() => openMsg(m)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] ${loading ? "opacity-50" : ""}`}>
                {m.flagged ? <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" /> : <span className="h-4 w-4 shrink-0" />}
                <span className={`w-44 shrink-0 truncate text-sm ${m.seen ? "text-white/60" : "font-semibold text-white"}`}>{m.from}</span>
                <span className={`min-w-0 flex-1 truncate text-sm ${m.seen ? "text-white/60" : "font-semibold text-white"}`}>{m.subject}</span>
                {m.attachments && <Paperclip className="h-4 w-4 shrink-0 text-white/40" />}
                <span className="w-16 shrink-0 text-right text-xs text-white/40">{fmtDate(m.date)}</span>
              </button>
            ))}
          </div>
          {data && pages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t border-white/10 p-3 text-sm text-white/60">
              Page {page} / {pages}
              <Button variant="ghost" className="!px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" className="!px-2" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </Card>
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.full?.subject || open?.row.subject || ""} wide>
        {open && !open.full && !open.error && <div className="flex justify-center py-16 text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {open?.error && <p className="text-sm text-red-300">{open.error}</p>}
        {open?.full && (
          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <div className="text-white"><span className="text-white/40">From: </span>{open.full.from}</div>
              <div className="text-white/70"><span className="text-white/40">To: </span>{open.full.to}</div>
              {open.full.cc && <div className="text-white/70"><span className="text-white/40">Cc: </span>{open.full.cc}</div>}
              <div className="text-white/40">{open.full.date && new Date(open.full.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
            </div>
            {open.full.html ? (
              <iframe
                title="mail"
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={`<base target="_blank">${open.full.html}`}
                className="h-[60vh] w-full rounded-lg border border-white/10 bg-white"
              />
            ) : (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-white/5 p-4 text-sm text-white/80">{open.full.text}</pre>
            )}
            {open.full.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {open.full.attachments.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/70"><Paperclip className="h-3.5 w-3.5" />{a.filename} · {kb(a.size)}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
