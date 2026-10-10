"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, Modal, PageHeader, api, useToast } from "./ui";

type Row = { id: string; sortOrder: number; active: boolean };

export type CollectionEditorProps<T extends Row> = {
  title: string;
  description: string;
  resource: "services" | "offices" | "blocks";
  query?: string;
  emptyLabel: string;
  newLabel: string;
  blank: () => Omit<T, "id">;
  renderRow: (row: T) => ReactNode;
  renderForm: (draft: Omit<T, "id">, set: (patch: Partial<Omit<T, "id">>) => void) => ReactNode;
  headerExtra?: ReactNode;
};

export default function CollectionEditor<T extends Row>({
  title,
  description,
  resource,
  query = "",
  emptyLabel,
  newLabel,
  blank,
  renderRow,
  renderForm,
  headerExtra,
}: CollectionEditorProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; draft: Omit<T, "id"> } | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const base = `/api/admin/collections/${resource}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<T[]>(`${base}${query}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, query]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await api(`${base}/${editing.id}`, { method: "PUT", body: JSON.stringify(editing.draft) });
      } else {
        await api(base, { method: "POST", body: JSON.stringify({ ...editing.draft, sortOrder: rows.length }) });
      }
      toast.success("Saved");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: T) {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    try {
      await api(`${base}/${row.id}`, { method: "DELETE" });
      toast.success("Deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
    try {
      await api(base, { method: "PATCH", body: JSON.stringify({ ids: next.map((r) => r.id) }) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reorder");
      await load();
    }
  }

  async function toggleActive(row: T) {
    try {
      const { id, ...rest } = row;
      await api(`${base}/${id}`, { method: "PUT", body: JSON.stringify({ ...rest, active: !row.active }) });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    }
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {headerExtra}
            <Button onClick={() => setEditing({ id: null, draft: blank() })}>
              <Plus className="h-4 w-4" /> {newLabel}
            </Button>
          </>
        }
      />

      <Card>
        {loading ? (
          <p className="p-8 text-center text-sm text-white/50">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-white/50">{emptyLabel}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {rows.map((row, i) => (
              <li key={row.id} className={`flex items-center gap-3 px-4 py-3 ${row.active ? "" : "opacity-50"}`}>
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="rounded p-0.5 text-white/40 hover:text-white disabled:opacity-20" aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">{renderRow(row)}</div>
                <button
                  type="button"
                  onClick={() => toggleActive(row)}
                  className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold sm:inline ${row.active ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/60"}`}
                  title="Toggle visibility"
                >
                  {row.active ? "Visible" : "Hidden"}
                </button>
                <Button
                  variant="ghost"
                  className="!px-2"
                  onClick={() => {
                    const { id, ...rest } = row;
                    setEditing({ id, draft: rest as Omit<T, "id"> });
                  }}
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" className="!px-2 text-red-300" onClick={() => remove(row)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${title.replace(/s$/, "").toLowerCase()}` : newLabel} wide>
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-5"
          >
            {renderForm(editing.draft, (patch) => setEditing((s) => (s ? { ...s, draft: { ...s.draft, ...patch } } : s)))}
            <div className="flex justify-end gap-2 border-t border-white/10 pt-5">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save
              </Button>
            </div>
          </form>
        )}
      </Modal>
      {toast.toast}
    </div>
  );
}
