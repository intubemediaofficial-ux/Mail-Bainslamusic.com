"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, Database } from "lucide-react";
import { Modal, Button, Field, Input, Select } from "@/components/admin/ui";
import { Badge } from "./bits";
import { ListPicker, type ContactList } from "./ContactLists";

type Preview = {
  headers: string[];
  mapping: Record<string, number>;
  rows: number;
  parsed?: number;
  existing?: number;
  withContact?: number;
  needsMapping: boolean;
  error?: string;
  sample: unknown[];
};
type Result = { rows: number; parsed: number; created: number; updated: number; skipped: number; errors: string[]; listId?: string | null; addedToList?: number };

const FIELDS: [string, string][] = [
  ["fullName", "Full name"],
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["company", "Company"],
  ["title", "Title / designation"],
  ["linkedinUrl", "LinkedIn URL"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["location", "Location"],
  ["companyDomain", "Company website"],
  ["companyUrl", "Company LinkedIn"],
  ["category", "Category / tag"],
  ["notes", "Notes"],
];

export default function ImportModal({
  open,
  onClose,
  onDone,
  lists = [],
  defaultListId = "",
  createList,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (r: Result) => void;
  lists?: ContactList[];
  defaultListId?: string;
  createList?: (name: string) => Promise<ContactList>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [listId, setListId] = useState(defaultListId);
  useEffect(() => {
    if (open) setListId(defaultListId);
  }, [open, defaultListId]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
    setErr("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async (mode: "preview" | "import", f: File, map?: Record<string, number | null>) => {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("mode", mode);
    if (category) fd.append("category", category);
    if (mode === "import" && listId) fd.append("listId", listId);
    if (map && Object.keys(map).length) fd.append("mapping", JSON.stringify(map));
    const res = await fetch("/api/intubtool/leads/import", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: unknown };
    if (!res.ok || data.ok === false) throw new Error(data.error || `Upload failed (${res.status})`);
    return data.data;
  };

  const pick = async (f: File | null) => {
    setErr("");
    setResult(null);
    setPreview(null);
    setFile(f);
    if (!f) return;
    setBusy(true);
    try {
      const p = (await send("preview", f)) as Preview;
      setPreview(p);
      setMapping(p.mapping);
      if (p.error) setErr(p.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remap = async () => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const p = (await send("preview", file, mapping)) as Preview;
      setPreview(p);
      if (p.error) setErr(p.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const r = (await send("import", file, mapping)) as Result;
      setResult(r);
      onDone(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Import existing data (CSV / Excel)" wide>
      <p className="mb-4 text-sm text-white/60">
        Upload your SalesQL export or any CSV/XLSX with names, companies, emails, phones. Columns are auto-detected (SalesQL <code>email1..4</code>, <code>phone1..3</code>, <code>person_linkedin_url</code> etc.).
        Existing people are matched by LinkedIn URL → email → name + company and merged; nothing is duplicated and existing emails/phones are never erased.
      </p>

      {!result && (
        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <label
            className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.02] p-8 text-center transition hover:border-cyan-400/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0] || null);
            }}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick(e.target.files?.[0] || null)} />
            {file ? <FileSpreadsheet className="h-8 w-8 text-cyan-300" /> : <Upload className="h-8 w-8 text-white/40" />}
            <p className="mt-2 text-sm font-medium">{file ? file.name : "Drop file here or click to choose"}</p>
            <p className="text-xs text-white/40">{file ? `${(file.size / 1024).toFixed(0)} KB` : ".csv or .xlsx · max 25 MB"}</p>
          </label>
          <div className="space-y-4">
            <Field label="Save into contact list" hint="Like a SalesQL folder. Merged leads are added too.">
              <ListPicker lists={lists} value={listId} onChange={setListId} create={createList} onError={setErr} placeholder="No list (database only)" />
            </Field>
            <Field label="Tag all imported as (optional)" hint="e.g. SalesQL-Aug, YouTube CMS">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="category" />
            </Field>
          </div>
        </div>
      )}

      {err && <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</p>}

      {preview && !result && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="cyan">{preview.rows} rows</Badge>
            {preview.parsed != null && <Badge tone="green">{preview.parsed} people detected</Badge>}
            {preview.withContact != null && <Badge tone="green">{preview.withContact} with email/phone</Badge>}
            {preview.existing != null && (
              <Badge tone="amber" title="Will be merged/updated instead of duplicated">
                <Database className="h-3 w-3" /> {preview.existing} already in database
              </Badge>
            )}
          </div>

          <details open={preview.needsMapping}>
            <summary className="cursor-pointer text-sm font-semibold text-white/80">Column mapping {preview.needsMapping ? "(required)" : "(auto-detected — click to adjust)"}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map(([k, label]) => (
                <Field key={k} label={label}>
                  <Select value={mapping[k] ?? -1} onChange={(e) => setMapping({ ...mapping, [k]: Number(e.target.value) < 0 ? null : Number(e.target.value) })}>
                    <option value={-1}>— not mapped —</option>
                    {preview.headers.map((h, i) => (
                      <option key={i} value={i}>{h || `(column ${i + 1})`}</option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <Button variant="secondary" className="mt-3" onClick={remap} loading={busy}>Re-check with this mapping</Button>
          </details>

          {!preview.needsMapping && preview.sample.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-white/5 text-left text-white/60">
                  <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Company</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Email (best)</th><th className="px-3 py-2">Phone (best)</th><th className="px-3 py-2">LinkedIn</th></tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(preview.sample as { fullName: string; company: string; title?: string; email?: string; phone?: string; linkedinUrl?: string; emails: unknown[]; phones: unknown[] }[]).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium">{r.fullName}</td>
                      <td className="px-3 py-2">{r.company}</td>
                      <td className="px-3 py-2 text-white/60">{r.title || "—"}</td>
                      <td className="px-3 py-2 text-emerald-300">{r.email || <span className="text-white/30">—</span>}{r.emails.length > 1 && <span className="text-white/40"> +{r.emails.length - 1}</span>}</td>
                      <td className="px-3 py-2 text-emerald-300">{r.phone || <span className="text-white/30">—</span>}{r.phones.length > 1 && <span className="text-white/40"> +{r.phones.length - 1}</span>}</td>
                      <td className="px-3 py-2 text-white/50">{r.linkedinUrl ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={reset}>Choose another file</Button>
            <Button onClick={doImport} loading={busy} disabled={preview.needsMapping}>
              <Upload className="h-4 w-4" /> Import {preview.parsed ?? preview.rows} people{listId ? ` → ${lists.find((l) => l.id === listId)?.name ?? "list"}` : ""}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="flex items-center gap-2 text-emerald-200"><CheckCircle2 className="h-5 w-5" /> <span className="font-semibold">Import complete</span></div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-2xl font-bold">{result.created}</p><p className="text-xs text-white/50">new leads</p></div>
            <div><p className="text-2xl font-bold">{result.updated}</p><p className="text-xs text-white/50">merged into existing</p></div>
            <div><p className="text-2xl font-bold">{result.parsed}</p><p className="text-xs text-white/50">rows processed</p></div>
            <div><p className="text-2xl font-bold">{result.skipped}</p><p className="text-xs text-white/50">skipped</p></div>
          </div>
          {result.listId && <p className="mt-3 text-sm text-emerald-200/80">{result.addedToList} people are now in list “{lists.find((l) => l.id === result.listId)?.name ?? "selected list"}”.</p>}
          {result.errors.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-red-200">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>Import another file</Button>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
