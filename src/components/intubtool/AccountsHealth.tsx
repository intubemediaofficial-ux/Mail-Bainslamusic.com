"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Link2, LogIn, Bell, Save, ChevronDown, ChevronUp, Activity, Send } from "lucide-react";
import { PageHeader, Card, Button, Field, Input, useToast, api } from "@/components/admin/ui";
import { Badge, fmtDate, timeAgo } from "./bits";

type Health = { status: "ok" | "fail" | "none" | "unknown"; at: string | null; error: string | null };
type Ev = { type: string; detail: string | null; createdAt: string };
type Acc = {
  owner: string | null; ownerKey: string; userEmail: string; name: string | null; gmailEmail: string;
  authMode: "oauth" | "password" | "both" | "none"; connected: boolean; health: Health;
  sentToday: number; sent30: number; bounced30: number; failed30: number; bouncePct: number;
  blockedUntil: string | null; blocks30: number; lastError: { at: string; message: string } | null; events: Ev[];
};
type AlertRow = { id: string; ownerKey: string; email: string; type: string; detail: string | null; createdAt: string };
type Pub = { values: Record<string, string>; secrets: Record<string, { set: boolean; masked: string }> };

const ALERT_KEYS = ["alert_email", "alert_whatsapp_phone", "health_check_hour"] as const;

const evTone = (t: string) => (({ disconnected: "red", blocked: "red", health_fail: "red", reconnected: "green", health_ok: "green", oauth_fallback: "amber", reconnect_link: "cyan", alert: "violet" }) as const)[t] || "gray";
const evLabel = (t: string) => ({ disconnected: "Disconnected", blocked: "Blocked", health_fail: "Check failed", reconnected: "Connected", health_ok: "Check OK", oauth_fallback: "Used App Password", reconnect_link: "Reconnect link sent", alert: "Alert sent" })[t] || t;

export default function AccountsHealth() {
  const { toast, success, error } = useToast();
  const [rows, setRows] = useState<Acc[] | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api<{ accounts: Acc[]; alerts: AlertRow[] }>("/api/intubtool/accounts"), api<Pub>("/api/intubtool/settings")])
        .then(([a, p]) => {
          setRows(a.accounts);
          setAlerts(a.alerts);
          setV(Object.fromEntries(ALERT_KEYS.map((k) => [k, p.values[k] ?? ""])));
          setApiKeySet(!!p.secrets.alert_whatsapp_apikey?.set);
        })
        .catch((e: Error) => error(e.message)),
    [error]
  );
  useEffect(() => {
    load();
  }, [load]);

  // result of a "Connect" started from this page (?gmail=email | ?gmail_error=msg)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ok = q.get("gmail");
    const err = q.get("gmail_error");
    if (!ok && !err) return;
    if (ok) success(`Gmail connected: ${ok}`);
    if (err) error(err);
    window.history.replaceState(null, "", window.location.pathname);
  }, [success, error]);

  const run = async (key: string, fn: () => Promise<{ message?: string } | void>, reload = true) => {
    setBusy(key);
    try {
      const r = await fn();
      if (r && "message" in r && r.message) success(r.message);
      if (reload) await load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const checkAll = () => run("check-all", () => api<{ message: string }>("/api/intubtool/accounts/check", { method: "POST", body: "{}" }));
  const checkOne = (k: string) => run(`check-${k}`, () => api<{ message: string }>("/api/intubtool/accounts/check", { method: "POST", body: JSON.stringify({ ownerKey: k }) }));
  const reconnectLink = (k: string) => run(`link-${k}`, () => api<{ message: string }>("/api/intubtool/accounts/reconnect-link", { method: "POST", body: JSON.stringify({ ownerKey: k }) }));
  const connectFor = (k: string) =>
    run(
      `connect-${k}`,
      async () => {
        const r = await api<{ url: string }>("/api/intubtool/gmail/connect", { method: "POST", body: JSON.stringify({ forOwner: k }) });
        window.location.href = r.url;
      },
      false
    );
  const saveAlerts = () =>
    run("save", async () => {
      await api("/api/intubtool/settings", { method: "PUT", body: JSON.stringify({ ...v, ...(apiKey ? { alert_whatsapp_apikey: apiKey } : {}) }) });
      setApiKey("");
      return { message: "Alert settings saved" };
    });
  const testAlert = () => run("test", () => api<{ message: string }>("/api/intubtool/accounts/alert-test", { method: "POST" }));

  const healthBadge = (a: Acc) => {
    if (!a.connected) return <Badge tone="red">Disconnected</Badge>;
    if (a.blockedUntil) return <Badge tone="red" title={a.lastError?.message || ""}>Blocked till {fmtDate(a.blockedUntil)}</Badge>;
    if (a.health.status === "fail") return <Badge tone="red" title={a.health.error || ""}>Sign-in failed</Badge>;
    if (a.health.status === "ok") return <Badge tone="green">Healthy</Badge>;
    return <Badge tone="gray">Not checked yet</Badge>;
  };
  const authLabel = (m: Acc["authMode"]) => ({ oauth: "Google sign-in", password: "App Password", both: "Google + App Password backup", none: "—" })[m];
  const bounceTone = (p: number, n: number) => (!n ? "text-white/40" : p >= 10 ? "text-red-300" : p >= 5 ? "text-amber-300" : "text-emerald-300");

  const connected = rows?.filter((a) => a.connected).length ?? 0;
  const problems = rows?.filter((a) => a.connected && (a.blockedUntil || a.health.status === "fail")).length ?? 0;
  const disconnected = rows?.filter((a) => !a.connected && a.gmailEmail).length ?? 0;

  return (
    <>
      {toast}
      <PageHeader
        title="Accounts health"
        description="Every sender Gmail (admin + members) in one place: connection, daily sign-in check, today's volume, bounce rate, blocks and what went wrong last. Alerts below tell you the moment an account disconnects or gets blocked."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/multi-send"><Button variant="ghost"><ArrowLeft className="h-4 w-4" /> Multi-account Send</Button></Link>
            <Button variant="secondary" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
            <Button onClick={checkAll} loading={busy === "check-all"}><Activity className="h-4 w-4" /> Check all now</Button>
          </div>
        }
      />

      {rows && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Connected", connected, "text-emerald-300"],
            ["Problems", problems, problems ? "text-red-300" : ""],
            ["Disconnected", disconnected, disconnected ? "text-red-300" : ""],
            ["Sent today", rows.reduce((n, a) => n + a.sentToday, 0), ""],
          ].map(([l, n, c]) => (
            <Card key={l as string} className="p-4 text-center">
              <p className={`text-2xl font-extrabold ${c}`}>{n as number}</p>
              <p className="text-[11px] uppercase tracking-wider text-white/45">{l as string}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/45">
            <tr>
              <th className="px-4 py-2">Account</th><th className="px-2 py-2">Login via</th><th className="px-2 py-2">Health</th><th className="px-2 py-2">Last check</th>
              <th className="px-2 py-2">Today</th><th className="px-2 py-2">30d sent</th><th className="px-2 py-2">Bounce %</th><th className="px-2 py-2">Blocks 30d</th><th className="px-2 py-2">Last error</th><th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows === null && <tr><td colSpan={10} className="px-4 py-8 text-center text-white/50">Loading…</td></tr>}
            {rows?.map((a) => (
              <Fragment key={a.ownerKey}>
                <tr className={a.connected ? "" : "opacity-70"}>
                  <td className="px-4 py-2">
                    <p className="font-medium">{a.gmailEmail || <span className="text-white/40">no Gmail yet</span>}</p>
                    <p className="text-xs text-white/45">{a.name || a.userEmail}{a.owner ? ` · ${a.userEmail}` : " · global"}</p>
                  </td>
                  <td className="px-2 py-2 text-xs text-white/70">{authLabel(a.authMode)}</td>
                  <td className="px-2 py-2">{healthBadge(a)}{a.health.status === "fail" && a.health.error && <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-white/40" title={a.health.error}>{a.health.error}</p>}</td>
                  <td className="px-2 py-2 text-xs text-white/60">{a.health.at ? timeAgo(a.health.at) : "—"}</td>
                  <td className="px-2 py-2">{a.sentToday}</td>
                  <td className="px-2 py-2">{a.sent30}{a.failed30 ? <span className="ml-1 text-[11px] text-red-300">({a.failed30} failed)</span> : null}</td>
                  <td className={`px-2 py-2 font-semibold ${bounceTone(a.bouncePct, a.sent30)}`}>{a.sent30 ? `${a.bouncePct}%` : "—"}<span className="ml-1 text-[11px] font-normal text-white/40">{a.sent30 ? `(${a.bounced30})` : ""}</span></td>
                  <td className={`px-2 py-2 ${a.blocks30 ? "text-red-300" : "text-white/60"}`}>{a.blocks30}</td>
                  <td className="px-2 py-2 text-xs text-white/60">{a.lastError ? <span title={a.lastError.message}><span className="block max-w-[200px] truncate">{a.lastError.message}</span><span className="text-white/35">{timeAgo(a.lastError.at)}</span></span> : "—"}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {a.connected && <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => checkOne(a.ownerKey)} loading={busy === `check-${a.ownerKey}`}><Activity className="h-3.5 w-3.5" /> Check</Button>}
                      {(a.userEmail || !a.owner) && <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => reconnectLink(a.ownerKey)} loading={busy === `link-${a.ownerKey}`}><Link2 className="h-3.5 w-3.5" /> Send reconnect link</Button>}
                      <Button variant={a.connected ? "ghost" : "secondary"} className="!px-2 !py-1 text-xs" onClick={() => connectFor(a.ownerKey)} loading={busy === `connect-${a.ownerKey}`}><LogIn className="h-3.5 w-3.5" /> {a.connected ? "Reconnect" : "Connect Gmail"}</Button>
                      <button type="button" className="px-1 text-white/50 hover:text-white" onClick={() => setOpen(open === a.ownerKey ? null : a.ownerKey)} aria-label="History">
                        {open === a.ownerKey ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
                {open === a.ownerKey && (
                  <tr>
                    <td colSpan={10} className="bg-white/[0.02] px-6 py-3">
                      {a.events.length ? (
                        <ul className="space-y-1 text-xs">
                          {a.events.map((e, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-2"><Badge tone={evTone(e.type)}>{evLabel(e.type)}</Badge><span className="text-white/40">{fmtDate(e.createdAt)}</span><span className="text-white/70">{e.detail}</span></li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-white/40">No events yet for this account.</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows?.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-white/50">No approved users yet.</td></tr>}
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-white/40">
          <b>Connect Gmail</b> opens Google in this browser — sign in with that member’s Gmail and the token is stored for them. <b>Send reconnect link</b> emails the member a one-click link. <b>App Password backup</b>: if a member also saves a Gmail App Password in Settings, sending continues automatically when Google sign-in fails.
        </p>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Bell className="h-4 w-4 text-cyan-400" /> Alerts</h3>
          <p className="mt-1 text-xs text-white/50">You are told immediately when an account disconnects or Gmail blocks it, when a campaign pauses for a login failure, and after the daily check if something failed.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Alert email" hint="Comma-separated. Empty = every admin user." className="sm:col-span-2"><Input type="text" value={v.alert_email ?? ""} onChange={(e) => setV({ ...v, alert_email: e.target.value })} placeholder="you@gmail.com" /></Field>
            <Field label="WhatsApp number" hint="With country code, e.g. +919782078301"><Input value={v.alert_whatsapp_phone ?? ""} onChange={(e) => setV({ ...v, alert_whatsapp_phone: e.target.value })} placeholder="+91…" /></Field>
            <Field label="CallMeBot API key" hint={apiKeySet ? "Saved — type to replace." : "Free: WhatsApp “I allow callmebot to send me messages” to +34 644 51 95 23, you get the key back."}><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={apiKeySet ? "••••••••" : "123456"} autoComplete="off" /></Field>
            <Field label="Daily health check hour" hint="0–23, server time (IST). Every account signs in once a day."><Input type="number" min={0} max={23} value={v.health_check_hour ?? ""} onChange={(e) => setV({ ...v, health_check_hour: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={saveAlerts} loading={busy === "save"}><Save className="h-4 w-4" /> Save</Button>
            <Button variant="secondary" onClick={testAlert} loading={busy === "test"}><Send className="h-4 w-4" /> Send test alert</Button>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-bold">Recent events</h3>
          {alerts.length ? (
            <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto text-xs">
              {alerts.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={evTone(e.type)}>{evLabel(e.type)}</Badge>
                  <span className="text-white/40">{fmtDate(e.createdAt)}</span>
                  <span className="font-medium">{e.email}</span>
                  <span className="text-white/60">{e.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-white/40">Nothing yet — disconnects, blocks, reconnects and alerts will show here.</p>
          )}
        </Card>
      </div>
    </>
  );
}
