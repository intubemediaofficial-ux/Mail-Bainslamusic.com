"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X, Ban, ShieldCheck, Shield, RefreshCw, Trash2, Mail, Database } from "lucide-react";
import { PageHeader, Card, Button, Toggle, useToast, api } from "@/components/admin/ui";
import { Badge, Empty, fmtDate, timeAgo } from "./bits";

type U = {
  id: string; email: string; name: string | null; role: "admin" | "member"; status: "pending" | "approved" | "rejected" | "disabled";
  shareData: boolean; approvedAt: string | null; createdAt: string;
  counts: { leads: number; lists: number; campaigns: number }; gmail: string | null;
};
type Action = "approve" | "reject" | "disable" | "enable" | "make_admin" | "make_member" | "share" | "unshare" | "delete";

const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red", disabled: "gray" } as const;

export default function UsersPage() {
  const { toast, success, error } = useToast();
  const [users, setUsers] = useState<U[] | null>(null);
  const [me, setMe] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<{ users: U[]; me: string }>("/api/intubtool/users")
        .then((r) => { setUsers(r.users); setMe(r.me); })
        .catch((e: Error) => error(e.message)),
    [error]
  );
  useEffect(() => { load(); }, [load]);

  const act = async (u: U, action: Action) => {
    if (action === "delete" && !confirm(`Delete ${u.email} and all their own leads, lists and campaigns? Shared data is not affected.`)) return;
    setBusy(u.id + action);
    try {
      await api("/api/intubtool/users", { method: "PATCH", body: JSON.stringify({ id: u.id, action }) });
      success({ approve: "Approved — they can sign in now", reject: "Rejected", disable: "Disabled", enable: "Re-enabled", make_admin: "Now an admin", make_member: "Now a member", share: "Shared data visible to this user", unshare: "Shared data hidden for this user", delete: "Deleted" }[action]);
      await load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pending = users?.filter((u) => u.status === "pending") ?? [];
  const rest = users?.filter((u) => u.status !== "pending") ?? [];

  const Row = ({ u }: { u: U }) => {
    const self = u.id === me;
    const b = (a: Action) => busy === u.id + a;
    return (
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{u.name || u.email}</p>
            {u.name && <span className="truncate text-sm text-white/50">{u.email}</span>}
            <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
            {u.role === "admin" && <Badge tone="violet"><ShieldCheck className="h-3 w-3" /> admin</Badge>}
            {self && <Badge tone="cyan">you</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
            <span>Signed up {timeAgo(u.createdAt)}</span>
            {u.approvedAt && <span>Approved {fmtDate(u.approvedAt)}</span>}
            <span className="inline-flex items-center gap-1"><Database className="h-3 w-3" /> {u.counts.leads} leads · {u.counts.lists} lists · {u.counts.campaigns} campaigns</span>
            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {u.gmail ? `Gmail: ${u.gmail}` : u.role === "admin" ? "Gmail: workspace account" : "Gmail not connected"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {u.status === "pending" && (
            <>
              <Button onClick={() => act(u, "approve")} loading={b("approve")}><Check className="h-4 w-4" /> Approve</Button>
              <Button variant="danger" onClick={() => act(u, "reject")} loading={b("reject")}><X className="h-4 w-4" /> Reject</Button>
            </>
          )}
          {u.status === "approved" && !self && (
            <Button variant="secondary" onClick={() => act(u, "disable")} loading={b("disable")}><Ban className="h-4 w-4" /> Disable</Button>
          )}
          {(u.status === "rejected" || u.status === "disabled") && (
            <Button variant="secondary" onClick={() => act(u, "enable")} loading={b("enable")}><RefreshCw className="h-4 w-4" /> Approve</Button>
          )}
          {u.status !== "pending" && !self && (
            u.role === "admin" ? (
              <Button variant="ghost" onClick={() => act(u, "make_member")} loading={b("make_member")}><Shield className="h-4 w-4" /> Make member</Button>
            ) : (
              <Button variant="ghost" onClick={() => act(u, "make_admin")} loading={b("make_admin")}><ShieldCheck className="h-4 w-4" /> Make admin</Button>
            )
          )}
          {u.role === "member" && (
            <div className="rounded-lg border border-white/10 px-3 py-1.5" title="On: this user also sees the existing shared leads & lists (read-only). Off: only their own data.">
              <Toggle checked={u.shareData} onChange={(v) => act(u, v ? "share" : "unshare")} label="Show shared data" />
            </div>
          )}
          {u.role === "member" && !self && (
            <Button variant="ghost" className="text-red-300" onClick={() => act(u, "delete")} loading={b("delete")} title="Delete user"><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {toast}
      <PageHeader
        title="Users"
        description="Approve new sign-ups, decide who sees the existing shared data, and manage admins. Every member sends campaigns only from their own connected Gmail."
        actions={<Button variant="secondary" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">Pending approval {pending.length > 0 && <Badge tone="amber">{pending.length}</Badge>}</h2>
        {users === null ? (
          <p className="text-sm text-white/50">Loading…</p>
        ) : pending.length === 0 ? (
          <Empty title="No pending sign-ups">New registrations from /intubtool/signup will appear here.</Empty>
        ) : (
          <div className="space-y-2">{pending.map((u) => <Row key={u.id} u={u} />)}</div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">All users</h2>
        {users !== null && rest.length === 0 ? (
          <Empty title="No users yet" />
        ) : (
          <div className="space-y-2">{rest.map((u) => <Row key={u.id} u={u} />)}</div>
        )}
        <p className="mt-4 text-xs text-white/40">
          “Show shared data” gives a member read access to leads &amp; lists that existed before multi-user (and anything admins add to the shared pool). It never shares Gmail accounts, campaigns or other members’ private data.
        </p>
      </Card>
    </div>
  );
}
