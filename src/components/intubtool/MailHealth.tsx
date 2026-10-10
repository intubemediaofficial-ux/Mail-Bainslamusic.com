"use client";

import { useState } from "react";
import { Inbox, Tag, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { mailHealth, type MailHealth as Health } from "@/lib/intubtool/spam";

const SAMPLE_VARS: Record<string, string> = {
  first_name: "Rahul",
  last_name: "Sharma",
  full_name: "Rahul Sharma",
  name: "Rahul",
  company: "Mediacube",
  title: "Head of YouTube",
  location: "Mumbai, India",
  email: "rahul@mediacube.io",
  linkedin_url: "https://www.linkedin.com/in/rahul-sharma",
  sender_name: "Ajeet",
  signature: "Ajeet Bainsla\nBainsla Music",
  unsubscribe_url: "https://mail.bainslamusic.com/api/intubtool/u/sample",
};

/** Renders {{vars}} with sample values the way the server will, so the live score matches the real mail. */
export function sampleRender(tpl: string) {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => SAMPLE_VARS[k.toLowerCase()] ?? m);
}

export function computeHealth(input: { subject: string; body: string; personal: boolean; trackOpens: boolean; attachments: number; isReply: boolean }): Health {
  let body = sampleRender(input.body).trim();
  if (!input.personal && !/unsubscribe|opt[- ]?out/i.test(body)) body += `\n\nIf you'd prefer not to hear from me again, just reply "unsubscribe" or click here: ${SAMPLE_VARS.unsubscribe_url}`;
  const subject = sampleRender(input.subject).trim() || (input.isReply ? "Re: (previous subject)" : "");
  return mailHealth(subject, body, {
    personal: input.personal,
    pixel: !input.personal && input.trackOpens,
    unsubHeader: !input.personal,
    attachments: input.attachments,
    firstNameUsed: /\{\{\s*(first_name|name|full_name)\s*\}\}/i.test(input.body),
  });
}

const PLACE = {
  primary: { label: "Primary inbox", tone: "text-emerald-300", bg: "border-emerald-500/30 bg-emerald-500/10", Icon: Inbox },
  promotions: { label: "Promotions tab", tone: "text-amber-300", bg: "border-amber-500/30 bg-amber-500/10", Icon: Tag },
  spam: { label: "Spam folder", tone: "text-red-300", bg: "border-red-500/30 bg-red-500/10", Icon: ShieldAlert },
} as const;

function Bar({ h }: { h: Health }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/10" title={`Primary ${h.primary}% · Promotions ${h.promotions}% · Spam ${h.spamPct}%`}>
      <div className="bg-emerald-400" style={{ width: `${h.primary}%` }} />
      <div className="bg-amber-400" style={{ width: `${h.promotions}%` }} />
      <div className="bg-red-400" style={{ width: `${h.spamPct}%` }} />
    </div>
  );
}

/** "Mail health" box: spam score + where Gmail will most likely file the email, with reasons and fixes. */
export default function MailHealthBox({ health, compact = false, className = "" }: { health: Health; compact?: boolean; className?: string }) {
  const [open, setOpen] = useState(!compact);
  const p = PLACE[health.placement];
  const spamTone = health.spam.level === "high" ? "text-red-300" : health.spam.level === "medium" ? "text-amber-300" : "text-emerald-300";
  return (
    <div className={`rounded-xl border p-3 ${p.bg} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <p.Icon className={`h-4 w-4 ${p.tone}`} />
          <span>Mail health:</span>
          <span className={p.tone}>likely {p.label}</span>
          <span className="text-xs font-normal text-white/50">({health.primary}% inbox chance)</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span>
            Spam score <b className={spamTone}>{health.spam.score}</b><span className="text-white/40">/100 · {health.spam.level}</span>
          </span>
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-white/50 hover:text-white" aria-label={open ? "Hide details" : "Show details"}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="mt-2">
        <Bar h={health} />
        <p className="mt-1 flex gap-3 text-[11px] text-white/50">
          <span><span className="text-emerald-300">■</span> Primary {health.primary}%</span>
          <span><span className="text-amber-300">■</span> Promotions {health.promotions}%</span>
          <span><span className="text-red-300">■</span> Spam {health.spamPct}%</span>
        </p>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <p className="mb-1 font-semibold text-white/70">Why</p>
            <ul className="list-disc space-y-0.5 pl-4 text-white/70">
              {[...health.spam.issues, ...health.reasons].length ? [...health.spam.issues, ...health.reasons].map((x, i) => <li key={i}>{x}</li>) : <li>Looks like a normal 1:1 email</li>}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-white/70">Fix</p>
            <ul className="list-disc space-y-0.5 pl-4 text-white/70">{health.tips.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <p className="text-[11px] text-white/40 sm:col-span-2">Estimate only — Gmail also looks at your sending history and replies, which no tool can see. Send a test to yourself to confirm.</p>
        </div>
      )}
    </div>
  );
}
