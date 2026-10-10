"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Enquiry } from "@prisma/client";
import { Mail, Phone, Trash2, MailOpen, MessageCircle } from "lucide-react";
import { Button, Card, PageHeader, api, useToast } from "@/components/admin/ui";
import { formatDate } from "@/lib/utils";

export default function EnquiriesList() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<Enquiry[]>("/api/admin/enquiries"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function open(row: Enquiry) {
    setOpenId((v) => (v === row.id ? null : row.id));
    if (!row.read) {
      await api(`/api/admin/enquiries/${row.id}`, { method: "PATCH", body: JSON.stringify({ read: true }) }).catch(() => undefined);
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, read: true } : r)));
      router.refresh();
    }
  }

  async function toggleRead(row: Enquiry) {
    await api(`/api/admin/enquiries/${row.id}`, { method: "PATCH", body: JSON.stringify({ read: !row.read }) }).catch(() => undefined);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, read: !row.read } : r)));
    router.refresh();
  }

  async function remove(row: Enquiry) {
    if (!confirm("Delete this enquiry?")) return;
    try {
      await api(`/api/admin/enquiries/${row.id}`, { method: "DELETE" });
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  const unread = rows.filter((r) => !r.read).length;

  return (
    <div>
      <PageHeader title="Enquiries" description={`${rows.length} total · ${unread} unread. Messages sent through the contact form.`} />
      <Card>
        {loading ? (
          <p className="p-8 text-center text-sm text-white/50">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-white/50">No enquiries yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => open(r)} className="flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-white/[0.03]">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.read ? "bg-white/15" : "bg-fuchsia-500"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`font-medium ${r.read ? "text-white/80" : "text-white"}`}>{r.name}</span>
                      <span className="text-xs text-white/40">{formatDate(r.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-white/50">
                      {r.email}
                      {r.phone && ` · ${r.phone}`}
                      {r.service && ` · ${r.service}`}
                    </span>
                    {openId !== r.id && <span className="mt-1 block truncate text-sm text-white/55">{r.message}</span>}
                  </span>
                </button>
                {openId === r.id && (
                  <div className="border-t border-white/5 bg-black/20 px-5 py-4 pl-11">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{r.message}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: your enquiry${r.service ? ` about ${r.service}` : ""}`)}`} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
                        <Mail className="h-3.5 w-3.5" /> Reply by email
                      </a>
                      {r.phone && (
                        <>
                          <a href={`tel:${r.phone.replace(/[^+\d]/g, "")}`} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
                            <Phone className="h-3.5 w-3.5" /> Call
                          </a>
                          <a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20">
                            <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                          </a>
                        </>
                      )}
                      <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={() => toggleRead(r)}>
                        <MailOpen className="h-3.5 w-3.5" /> Mark as {r.read ? "unread" : "read"}
                      </Button>
                      <Button variant="danger" className="!px-3 !py-1.5 !text-xs" onClick={() => remove(r)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {toast.toast}
    </div>
  );
}
