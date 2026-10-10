"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Save, Plug, ShieldCheck, Eye, EyeOff, Trash2, LogIn, Unplug, Copy } from "lucide-react";
import { PageHeader, Card, Button, Field, Input, Textarea, useToast, api } from "@/components/admin/ui";
import { Badge } from "./bits";

type Pub = { values: Record<string, string>; secrets: Record<string, { set: boolean; masked: string }>; scope: "user" | "global"; googleClientReady: boolean; admin: boolean };
type GmailInfo = { redirectUri: string; connected: boolean; email: string | null; clientConfigured: boolean };

function SecretInput({ name, secret, value, onChange, onClear }: { name: string; secret?: { set: boolean; masked: string }; value: string; onChange: (v: string) => void; onClear: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input type={show ? "text" : "password"} name={name} value={value} onChange={(e) => onChange(e.target.value)} placeholder={secret?.set ? `Saved: ${secret.masked} — paste to replace` : "not set"} autoComplete="off" />
        <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white" aria-label="toggle">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {secret?.set && (
        <Button variant="ghost" onClick={onClear} title="Remove saved secret"><Trash2 className="h-4 w-4" /></Button>
      )}
    </div>
  );
}

function Section({ title, description, status, test, onTest, testing, children }: { title: string; description: ReactNode; status?: boolean; test?: string; onTest?: () => void; testing?: boolean; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">{title} {status != null && <Badge tone={status ? "green" : "amber"}>{status ? "configured" : "not set"}</Badge>}</h2>
          <p className="mt-1 text-xs text-white/50">{description}</p>
        </div>
        {test && onTest && (
          <Button variant="secondary" onClick={onTest} loading={testing}><Plug className="h-4 w-4" /> Test {test}</Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

export default function SettingsPage() {
  const { toast, success, error } = useToast();
  const [pub, setPub] = useState<Pub | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [gmail, setGmail] = useState<GmailInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showAppPassword, setShowAppPassword] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api<Pub>("/api/intubtool/settings"), api<GmailInfo>("/api/intubtool/gmail/connect")])
        .then(([p, g]) => { setPub(p); setV(p.values); setGmail(g); })
        .catch((e: Error) => error(e.message)),
    [error],
  );
  useEffect(() => {
    load();
  }, [load]);

  // ?connect=1 (reconnect link from the admin) → start Google sign-in as soon as settings are loaded
  const [autoConnect, setAutoConnect] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("connect") === "1") {
      setAutoConnect(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // result of the Google consent redirect (?gmail=email | ?gmail_error=msg)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const connected = q.get("gmail");
    const err = q.get("gmail_error");
    if (!connected && !err) return;
    if (connected) success(`Gmail connected as ${connected}`);
    if (err) error(err);
    window.history.replaceState(null, "", window.location.pathname);
  }, [success, error]);

  const admin = !!pub?.admin;
  const clientReady = pub?.googleClientReady || (!!v.google_client_id && !!(pub?.secrets.google_client_secret?.set || secrets.google_client_secret));

  const connectGoogle = async () => {
    if (!clientReady) {
      if (!admin) {
        error("The admin has not finished the Google sign-in setup yet — ask them to add the Google OAuth client in Settings.");
        return;
      }
      error("One-time setup needed: paste your Google OAuth Client ID + Client secret below, then click Connect with Google.");
      document.getElementById("google-oauth-setup")?.setAttribute("open", "");
      document.getElementById("google_client_id")?.focus();
      return;
    }
    setConnecting(true);
    try {
      // persist client id/secret first so the redirect uses them
      await api("/api/intubtool/settings", { method: "PUT", body: JSON.stringify({ ...v, ...secrets }) });
      setSecrets({});
      const r = await api<{ url: string }>("/api/intubtool/gmail/connect", { method: "POST" });
      window.location.href = r.url;
    } catch (e) {
      error((e as Error).message);
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (!autoConnect || !pub || !gmail || connecting) return;
    setAutoConnect(false);
    if (clientReady) void connectGoogle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, pub, gmail]);

  const disconnectGoogle = async () => {
    if (!confirm("Disconnect Gmail? Running campaigns will pause until you connect again.")) return;
    try {
      await api("/api/intubtool/gmail/disconnect", { method: "POST" });
      success("Gmail disconnected");
      load();
    } catch (e) {
      error((e as Error).message);
    }
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => success("Copied")).catch(() => undefined);

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/intubtool/settings", { method: "PUT", body: JSON.stringify({ ...v, ...secrets }) });
      setSecrets({});
      success("Settings saved");
      load();
    } catch (e) {
      error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const test = async (what: string) => {
    // save first so the test uses the new values
    if (Object.keys(secrets).length || pub) await api("/api/intubtool/settings", { method: "PUT", body: JSON.stringify({ ...v, ...secrets }) }).catch(() => undefined);
    setSecrets({});
    setTesting(what);
    try {
      const r = await api<{ message: string }>("/api/intubtool/settings/test", { method: "POST", body: JSON.stringify({ what }) });
      setTestResult((t) => ({ ...t, [what]: { ok: true, message: r.message } }));
    } catch (e) {
      setTestResult((t) => ({ ...t, [what]: { ok: false, message: (e as Error).message } }));
    } finally {
      setTesting(null);
      load();
    }
  };

  const val = (k: string) => ({ value: v[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }) });
  const sec = (k: string) => ({
    name: k,
    secret: pub?.secrets[k],
    value: secrets[k] ?? "",
    onChange: (x: string) => setSecrets({ ...secrets, [k]: x }),
    onClear: () => setSecrets({ ...secrets, [k]: "__clear__" }),
  });
  const result = (k: string) => testResult[k] && <p className={`sm:col-span-2 rounded-lg p-2 text-xs ${testResult[k].ok ? "bg-emerald-500/10 text-emerald-200" : "bg-red-500/10 text-red-200"}`}>{testResult[k].message}</p>;

  if (!pub) return <p className="text-white/50">Loading…</p>;

  return (
    <>
      {toast}
      <PageHeader
        title="Settings"
        description={admin ? "Secrets are encrypted at rest and never sent back to the browser." : "Your Gmail connection and sender identity. Campaigns you create are sent only from the Gmail you connect here."}
        actions={<Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Save all</Button>}
      />
      <div className="space-y-6">
        {admin && (
        <Section
          title="LinkedIn"
          status={pub.secrets.linkedin_li_at?.set}
          description={<>Log in to linkedin.com in Chrome → F12 → Application → Cookies → linkedin.com → copy the <code>li_at</code> value. Password is never needed. Cookie expires every ~1 year or when you log out.</>}
          test="LinkedIn" onTest={() => test("linkedin")} testing={testing === "linkedin"}
        >
          <Field label="li_at cookie" className="sm:col-span-2"><SecretInput {...sec("linkedin_li_at")} /></Field>
          <Field label="Max LinkedIn pages / day" hint="Free accounts: keep ≤ 120. Sales Navigator: up to ~400."><Input type="number" {...val("linkedin_daily_page_limit")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min delay (ms)"><Input type="number" {...val("linkedin_min_delay_ms")} /></Field>
            <Field label="Max delay (ms)"><Input type="number" {...val("linkedin_max_delay_ms")} /></Field>
          </div>
          {result("linkedin")}
        </Section>
        )}

        {admin && (
        <Section
          title="SalesQL"
          status={pub.secrets.salesql_api_key?.set}
          description={<>API key powers the free Prospector search and enrichment (credits only spent when a contact is not already in your database). The web token is only used to look up companies by name.</>}
          test="SalesQL" onTest={() => test("salesql")} testing={testing === "salesql"}
        >
          <Field label="API key" hint="dashboard.salesql.com → Settings → API Access → Create key" className="sm:col-span-2"><SecretInput {...sec("salesql_api_key")} /></Field>
          <Field
            label="Web token (sql_token cookie)"
            hint="Log in at dashboard.salesql.com → F12 → Application → Cookies → salesql.com → copy the value of sql_token. Stays valid until you log out of SalesQL."
            className="sm:col-span-2"
          >
            <SecretInput {...sec("salesql_web_token")} />
          </Field>
          {result("salesql")}
        </Section>
        )}

        <Section
          title="Gmail (sending + reply/bounce tracking)"
          status={!!v.gmail_user && (pub.secrets.gmail_refresh_token?.set || pub.secrets.gmail_app_password?.set)}
          description={<>Connect the Gmail account you send from with a <b>Gmail App Password</b> (myaccount.google.com/apppasswords) — your real Gmail password is never needed, and you can revoke it any time from your Google account.</>}
          test="Gmail" onTest={() => test("gmail")} testing={testing === "gmail"}
        >
          <div className="sm:col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            {!gmail?.connected && !!v.gmail_user && pub.secrets.gmail_app_password?.set ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium"><Badge tone="green">connected</Badge> {v.gmail_user} <span className="text-xs text-white/40">(App Password)</span></p>
                  <p className="mt-1 text-xs text-white/50">Emails are sent from this account; replies, bounces and labels are read from its inbox. Click Test to check the connection.</p>
                </div>
                {gmail?.clientConfigured && (
                  <Button variant="secondary" onClick={connectGoogle} loading={connecting}><LogIn className="h-4 w-4" /> Switch to Google sign-in</Button>
                )}
              </div>
            ) : gmail?.connected ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium"><Badge tone="green">connected</Badge> {gmail.email}</p>
                  <p className="mt-1 text-xs text-white/50">Emails are sent from this account; replies and bounces are read from its inbox.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={connectGoogle} loading={connecting}><LogIn className="h-4 w-4" /> Reconnect</Button>
                  <Button variant="ghost" onClick={disconnectGoogle}><Unplug className="h-4 w-4" /> Disconnect</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Not connected</p>
                  <p className="mt-1 text-xs text-white/50">
                    {gmail?.clientConfigured || (secrets.google_client_secret && v.google_client_id)
                      ? "Opens Google's permission screen in this browser. Required before you can send any email."
                      : admin
                        ? "Add your Gmail address + App Password below (easiest), or set up Google sign-in under \"Google OAuth client\"."
                        : "Add your Gmail address + App Password below."}
                  </p>
                </div>
                {(gmail?.clientConfigured || (secrets.google_client_secret && v.google_client_id)) ? (
                  <Button onClick={connectGoogle} loading={connecting}>
                    <LogIn className="h-4 w-4" /> Connect with Google
                  </Button>
                ) : (
                  <Button onClick={() => setShowAppPassword(true)}>Add Gmail App Password</Button>
                )}
              </div>
            )}
          </div>

          {admin && (
          <details id="google-oauth-setup" className="sm:col-span-2 rounded-xl border border-white/10 p-4">
            <summary className="cursor-pointer text-sm font-medium">Google OAuth client (one-time setup)</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-white/50">
              <li>Go to <a className="underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">console.cloud.google.com/apis/credentials</a> → Create credentials → OAuth client ID → type <b>Web application</b>.</li>
              <li>Under <b>Authorized redirect URIs</b> add the URI below, then copy the Client ID and Client Secret here.</li>
              <li>In <b>OAuth consent screen</b> → Audience add your Gmail address as a <b>test user</b> (or publish the app). Enable the <b>Gmail API</b> under Library.</li>
            </ol>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Redirect URI (paste into Google)" className="sm:col-span-2">
                <div className="flex gap-2">
                  <Input readOnly value={gmail?.redirectUri ?? ""} onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="ghost" onClick={() => copy(gmail?.redirectUri ?? "")} title="Copy"><Copy className="h-4 w-4" /></Button>
                </div>
              </Field>
              <Field label="Client ID"><Input id="google_client_id" {...val("google_client_id")} placeholder="xxxx.apps.googleusercontent.com" autoComplete="off" /></Field>
              <Field label="Client secret"><SecretInput {...sec("google_client_secret")} /></Field>
            </div>
          </details>
          )}

          <Field label="BCC every email to" hint="Your own address — a copy of every sent mail lands in this inbox." className="sm:col-span-2"><Input type="email" {...val("bcc_email")} placeholder="you@gmail.com" /></Field>

          <div className="sm:col-span-2">
            <button type="button" className="text-xs text-white/40 underline" onClick={() => setShowAppPassword((x) => !x)}>
              {showAppPassword ? "Hide" : gmail?.connected ? "Backup:" : "Alternative:"} Gmail App Password {gmail?.connected ? "— used automatically if Google sign-in stops working" : "instead of Google sign-in"}
              {pub.secrets.gmail_app_password?.set && <Badge tone="green">backup saved</Badge>}
            </button>
            {showAppPassword && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Gmail address"><Input type="email" {...val("gmail_user")} placeholder="you@gmail.com" /></Field>
                <Field label="App password" hint="Google Account → Security → 2-Step Verification → App passwords. IMAP must be enabled in Gmail. With Google sign-in also connected, this is only used when that fails."><SecretInput {...sec("gmail_app_password")} /></Field>
              </div>
            )}
          </div>

          <Field label="From name"><Input {...val("from_name")} placeholder="Ajeet from Bainsla Music" /></Field>
          <Field label="Reply-to (optional)"><Input type="email" {...val("reply_to")} /></Field>
          <Field label={admin ? "Global daily send limit" : "My daily send limit"} hint="Across all your campaigns. Gmail free ≈ 500/day, Workspace ≈ 2000/day; start low (30–50) for a new account."><Input type="number" {...val("default_daily_limit")} /></Field>
          {admin && <Field label="Inbox check interval (min)" hint="How often to scan Gmail for replies & bounces."><Input type="number" {...val("imap_poll_minutes")} /></Field>}
          {admin && <Field label="Public base URL" hint="Used for open-tracking pixel & unsubscribe links."><Input {...val("public_base_url")} placeholder="https://mail.bainslamusic.com" /></Field>}
          <Field label="Signature" className="sm:col-span-2" hint="Available as {{signature}} in templates."><Textarea rows={3} {...val("signature")} /></Field>
          <Field label="Unsubscribe line" className="sm:col-span-2" hint="Appended automatically if the template has no unsubscribe/opt-out text. Keep {{unsubscribe_url}}."><Textarea rows={2} {...val("unsubscribe_text")} /></Field>
          {result("gmail")}
        </Section>

        {admin && (
        <Section
          title="AI (personalization + spam review)"
          status={pub.secrets.ai_api_key?.set}
          description={<>Any OpenAI-compatible API: OpenAI, Groq, OpenRouter, Together… Optional — campaigns work without it.</>}
          test="AI" onTest={() => test("ai")} testing={testing === "ai"}
        >
          <Field label="API key" className="sm:col-span-2"><SecretInput {...sec("ai_api_key")} /></Field>
          <Field label="Base URL"><Input {...val("ai_base_url")} placeholder="https://api.openai.com/v1" /></Field>
          <Field label="Model"><Input {...val("ai_model")} placeholder="gpt-4o-mini" /></Field>
          {result("ai")}
        </Section>
        )}

        <p className="flex items-center gap-2 text-xs text-white/40"><ShieldCheck className="h-4 w-4" /> {admin ? "Secrets are AES-256-GCM encrypted using your server's NEXTAUTH_SECRET. Environment variables SALESQL_API_KEY, LINKEDIN_LI_AT, GMAIL_USER, GMAIL_APP_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AI_API_KEY also work as fallbacks." : "Your Gmail token is encrypted at rest and is only ever used for your own campaigns."}</p>
      </div>
    </>
  );
}
