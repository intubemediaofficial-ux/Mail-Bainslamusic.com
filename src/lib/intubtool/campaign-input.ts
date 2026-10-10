import { str, int, bool } from "@/app/api/admin/_lib";
import { parseAttachments } from "@/lib/intubtool/attachments";

type StepIn = { subject?: string; body?: string; delayDays?: number; attachments?: unknown };

export function campaignData(b: Record<string, unknown>) {
  return {
    name: str(b.name, 150),
    fromName: str(b.fromName, 120) || null,
    replyTo: str(b.replyTo, 200) || null,
    cc: str(b.cc, 500) || null,
    bcc: str(b.bcc, 500) || null,
    dailyLimit: Math.min(500, Math.max(1, int(b.dailyLimit, 40))),
    sendWindowStart: Math.min(23, Math.max(0, int(b.sendWindowStart, 9))),
    sendWindowEnd: Math.min(24, Math.max(1, int(b.sendWindowEnd, 18))),
    minGapSeconds: Math.min(3600, Math.max(20, int(b.minGapSeconds, 90))),
    trackOpens: bool(b.trackOpens, true),
    personalMode: bool(b.personalMode, false),
    aiPersonalize: bool(b.aiPersonalize, false),
    aiInstructions: str(b.aiInstructions, 2000) || null,
    stopOnReply: bool(b.stopOnReply, true),
  };
}

export function stepsData(v: unknown) {
  const steps = (Array.isArray(v) ? (v as StepIn[]) : []).map((s, i) => ({
    order: i,
    delayDays: i === 0 ? 0 : Math.min(60, Math.max(1, int(s.delayDays, 3))),
    subject: str(s.subject, 300),
    body: str(s.body, 20000),
    attachments: (() => {
      const a = parseAttachments(s.attachments);
      return a.length ? JSON.stringify(a) : null;
    })(),
  }));
  if (!steps.length || !steps[0].subject || !steps[0].body) return [];
  return steps.filter((s) => s.body).map((s, i) => ({ ...s, order: i, delayDays: i === 0 ? 0 : s.delayDays }));
}
