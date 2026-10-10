"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, Mail, Phone, Building2, Search, Send, Upload, Settings, AlertTriangle, CheckCircle2, Database } from "lucide-react";
import { PageHeader, Card, Button, api } from "@/components/admin/ui";
import { Stat, Badge, statusTone, timeAgo } from "./bits";

type Stats = {
  leads: { total: number; withEmail: number; withPhone: number; companies: number; queuedEnrich: number };
  jobsRunning: number;
  campaignsRunning: number;
  email: { sentToday: number; sentTotal: number; opened: number; replied: number; bounced: number; dailyLimit: number };
  configured: { salesql: boolean; linkedin: boolean; gmail: boolean; ai: boolean };
  salesql: { allowance: { credits: { emails_and_phones: number; verifications: number }; reset_date: string } | null; error?: string } | null;
  scheduler: { running: boolean; lastError?: string } | null;
  admin: boolean;
  user: { name: string; email: string; shareData: boolean };
  recentJobs: { id: string; name: string; status: string; progress: number; total: number; found: number; createdAt: string; _count: { leads: number } }[];
  recentLeads: { id: string; fullName: string; company: string; title: string | null; email: string | null; phone: string | null; source: string; createdAt: string }[];
};

export default function Dashboard() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api<Stats>("/api/intubtool/stats").then(setS).catch((e: Error) => setErr(e.message)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <>
      <PageHeader
        title="Bainsla Mail Tool"
        description="Company → matching employees (LinkedIn) → your database → SalesQL only when missing → Gmail outreach with tracking."
        actions={
          <>
            <Link href="/search"><Button><Search className="h-4 w-4" /> New search</Button></Link>
            <Link href="/leads?import=1"><Button variant="secondary"><Upload className="h-4 w-4" /> Import CSV / Excel</Button></Link>
          </>
        }
      />

      {err && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</p>}

      {s && (
        <>
          {/* setup checklist */}
          {(s.admin ? !s.configured.linkedin || !s.configured.salesql || !s.configured.gmail : !s.configured.gmail) && (
            <Card className="mb-6 p-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-white/80">Setup:</span>
                {(s.admin ? (["linkedin", "salesql", "gmail", "ai"] as const) : (["gmail"] as const)).map((k) => (
                  <span key={k} className={`inline-flex items-center gap-1 ${s.configured[k] ? "text-emerald-300" : "text-white/50"}`}>
                    {s.configured[k] ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}
                    {{ linkedin: "LinkedIn cookie", salesql: "SalesQL key", gmail: s.admin ? "Gmail" : "Connect your Gmail to send campaigns", ai: "AI (optional)" }[k]}
                  </span>
                ))}
                <Link href="/settings" className="ml-auto"><Button variant="ghost"><Settings className="h-4 w-4" /> Open settings</Button></Link>
              </div>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Leads in database" value={s.leads.total} sub={`${s.leads.companies} companies`} icon={<Users className="h-4 w-4" />} tone="cyan" />
            <Stat label="With email" value={s.leads.withEmail} sub={pct(s.leads.withEmail, s.leads.total) + " coverage"} icon={<Mail className="h-4 w-4" />} />
            <Stat label="With phone" value={s.leads.withPhone} sub={pct(s.leads.withPhone, s.leads.total) + " coverage"} icon={<Phone className="h-4 w-4" />} />
            <Stat label="Companies" value={s.leads.companies} sub={s.jobsRunning ? `${s.jobsRunning} search job running` : "no search running"} icon={<Building2 className="h-4 w-4" />} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {s.salesql ? (
              <Stat
                label="SalesQL credits"
                value={s.salesql.allowance ? s.salesql.allowance.credits.emails_and_phones : s.configured.salesql ? "?" : "—"}
                sub={
                  s.salesql.error
                    ? <span className="text-red-300">{s.salesql.error}</span>
                    : s.salesql.allowance
                      ? `email/phone · resets ${new Date(s.salesql.allowance.reset_date).toLocaleDateString()} · ${s.leads.queuedEnrich} queued`
                      : "add API key in settings"
                }
                tone={s.salesql.allowance && s.salesql.allowance.credits.emails_and_phones === 0 ? "amber" : "default"}
                icon={<Database className="h-4 w-4" />}
              />
            ) : (
              <Stat label="Your data" value={s.user.shareData ? "Own + shared" : "Own only"} sub={s.user.shareData ? "admin has enabled shared leads & lists for you" : "only leads you import or search are shown"} icon={<Database className="h-4 w-4" />} />
            )}
            <Stat label="Emails sent today" value={s.email.sentToday} sub={`limit ${s.email.dailyLimit || "∞"} · ${s.email.sentTotal} total · ${s.campaignsRunning} campaign running`} icon={<Send className="h-4 w-4" />} />
            <Stat label="Opened" value={s.email.opened} sub={pct(s.email.opened, s.email.sentTotal) + " open rate"} tone="green" />
            <Stat label="Replied / Bounced" value={<>{s.email.replied} <span className="text-white/30">/</span> <span className="text-red-300">{s.email.bounced}</span></>} sub={pct(s.email.replied, s.email.sentTotal) + " reply rate"} />
          </div>

          {s.scheduler?.lastError && (
            <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Background worker: {s.scheduler.lastError}</p>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Recent searches</h2>
                <Link href="/search" className="text-xs text-cyan-300 hover:underline">View all</Link>
              </div>
              {s.recentJobs.length === 0 ? (
                <p className="text-sm text-white/50">No searches yet. Add companies + designations to start.</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {s.recentJobs.map((j) => (
                    <li key={j.id} className="flex items-center gap-3 py-3 text-sm">
                      <Link href={`/search?job=${j.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-cyan-300">{j.name}</Link>
                      <span className="text-xs text-white/50">{j._count.leads} leads</span>
                      <Badge tone={statusTone(j.status)}>{j.status}{j.status === "running" && ` ${j.progress}/${j.total}`}</Badge>
                      <span className="w-14 text-right text-xs text-white/40">{timeAgo(j.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Recently added leads</h2>
                <Link href="/leads" className="text-xs text-cyan-300 hover:underline">Open database</Link>
              </div>
              {s.recentLeads.length === 0 ? (
                <p className="text-sm text-white/50">Database is empty — import your SalesQL export or run a search.</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {s.recentLeads.map((l) => (
                    <li key={l.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{l.fullName} <span className="text-white/40">· {l.company}</span></p>
                        <p className="truncate text-xs text-white/50">{l.title || "—"}</p>
                      </div>
                      {l.email && <Mail className="h-3.5 w-3.5 text-emerald-400" />}
                      {l.phone && <Phone className="h-3.5 w-3.5 text-emerald-400" />}
                      <Badge>{l.source}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
