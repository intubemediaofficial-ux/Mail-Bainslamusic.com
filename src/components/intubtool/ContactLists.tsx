"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderPlus, Folder, FolderOpen, Pencil, Trash2, Check, X, Users } from "lucide-react";
import { Card, Select, api } from "@/components/admin/ui";

export type ContactList = { id: string; name: string; description: string | null; count: number };

export const NEW_LIST = "__new__";

export function useContactLists() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const reload = useCallback(() => api<{ lists: ContactList[] }>("/api/intubtool/lists").then((d) => setLists(d.lists)).catch(() => undefined), []);
  useEffect(() => {
    reload();
  }, [reload]);
  const create = useCallback(
    async (name: string) => {
      const d = await api<{ list: ContactList }>("/api/intubtool/lists", { method: "POST", body: JSON.stringify({ name }) });
      await reload();
      return d.list;
    },
    [reload]
  );
  return { lists, setLists, reload, create };
}

/** Prompt for a list name and create it. Returns the new list or null when cancelled. */
export async function promptNewList(create: (name: string) => Promise<ContactList>, onError: (m: string) => void) {
  const name = prompt("New list name (e.g. YouTube CMS India)");
  if (!name?.trim()) return null;
  try {
    return await create(name.trim());
  } catch (e) {
    onError((e as Error).message);
    return null;
  }
}

/**
 * <select> of contact lists with a "+ New list…" entry. `value` is a list id or "".
 * onChange receives the picked list id (a freshly created one when "+ New list…" is chosen).
 */
export function ListPicker({
  lists,
  value,
  onChange,
  create,
  onError,
  placeholder = "No list",
  className = "",
  disabled,
  exclude,
}: {
  lists: ContactList[];
  value: string;
  onChange: (id: string) => void;
  create?: (name: string) => Promise<ContactList>;
  onError?: (m: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  exclude?: string;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      className={className}
      onChange={async (e) => {
        const v = e.target.value;
        if (v === NEW_LIST) {
          if (!create) return;
          const l = await promptNewList(create, onError ?? (() => undefined));
          if (l) onChange(l.id);
          return;
        }
        onChange(v);
      }}
    >
      <option value="">{placeholder}</option>
      {lists.filter((l) => l.id !== exclude).map((l) => (
        <option key={l.id} value={l.id}>
          {l.name} ({l.count})
        </option>
      ))}
      {create && <option value={NEW_LIST}>+ New list…</option>}
    </Select>
  );
}

/** SalesQL-style folders sidebar: All / Not in any list / each list, with inline create, rename, delete. */
export function ListsSidebar({
  lists,
  active,
  total,
  onSelect,
  onChanged,
  onError,
  onSuccess,
}: {
  lists: ContactList[];
  active: string;
  total?: number;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onError: (m: string) => void;
  onSuccess: (m: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const submitCreate = async () => {
    const n = name.trim();
    if (!n) return setCreating(false);
    setBusy(true);
    try {
      const d = await api<{ list: ContactList }>("/api/intubtool/lists", { method: "POST", body: JSON.stringify({ name: n }) });
      setName("");
      setCreating(false);
      onChanged();
      onSelect(d.list.id);
      onSuccess(`List "${d.list.name}" created`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async (id: string) => {
    const n = editName.trim();
    setEditing(null);
    if (!n || n === lists.find((l) => l.id === id)?.name) return;
    try {
      await api(`/api/intubtool/lists/${id}`, { method: "PUT", body: JSON.stringify({ name: n }) });
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const remove = async (l: ContactList) => {
    if (!confirm(`Delete list "${l.name}"? The ${l.count} leads in it stay in your database.`)) return;
    try {
      await api(`/api/intubtool/lists/${l.id}`, { method: "DELETE" });
      if (active === l.id) onSelect("");
      onChanged();
      onSuccess(`List "${l.name}" deleted`);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const item = (id: string, label: React.ReactNode, count: number | undefined, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${active === id ? "bg-violet-500/15 font-semibold text-white" : "text-white/70 hover:bg-white/5"}`}
    >
      <span className="shrink-0 text-white/50">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="shrink-0 text-xs text-white/40">{count}</span>}
    </button>
  );

  return (
    <Card className="p-2">
      <div className="flex items-center justify-between px-3 pb-1 pt-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Contact lists</span>
        <button type="button" onClick={() => setCreating(true)} className="text-white/50 hover:text-white" aria-label="New list" title="New list">
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>
      {item("", "All leads", total, <Users className="h-4 w-4" />)}
      {item("none", "Not in any list", undefined, <Folder className="h-4 w-4 opacity-50" />)}
      {lists.map((l) =>
        editing === l.id ? (
          <div key={l.id} className="flex items-center gap-1 px-2 py-1">
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename(l.id);
                if (e.key === "Escape") setEditing(null);
              }}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sm outline-none focus:border-violet-400"
              aria-label="List name"
            />
            <button type="button" onClick={() => submitRename(l.id)} className="text-emerald-300" aria-label="Save"><Check className="h-4 w-4" /></button>
            <button type="button" onClick={() => setEditing(null)} className="text-white/40" aria-label="Cancel"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <div key={l.id} className="group flex items-center">
            <div className="min-w-0 flex-1">{item(l.id, l.name, l.count, active === l.id ? <FolderOpen className="h-4 w-4 text-violet-300" /> : <Folder className="h-4 w-4" />)}</div>
            <div className="flex shrink-0 gap-1 pr-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                onClick={() => {
                  setEditing(l.id);
                  setEditName(l.name);
                }}
                className="text-white/40 hover:text-white"
                aria-label={`Rename ${l.name}`}
                title="Rename"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => remove(l)} className="text-white/40 hover:text-red-300" aria-label={`Delete ${l.name}`} title="Delete list">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      )}
      {creating && (
        <div className="flex items-center gap-1 px-2 py-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="List name"
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sm outline-none focus:border-violet-400"
            aria-label="New list name"
          />
          <button type="button" onClick={submitCreate} className="text-emerald-300" aria-label="Create list"><Check className="h-4 w-4" /></button>
          <button type="button" onClick={() => setCreating(false)} className="text-white/40" aria-label="Cancel"><X className="h-4 w-4" /></button>
        </div>
      )}
      {!lists.length && !creating && <p className="px-3 py-2 text-xs text-white/40">No lists yet — click + to create one (like SalesQL folders).</p>}
    </Card>
  );
}
