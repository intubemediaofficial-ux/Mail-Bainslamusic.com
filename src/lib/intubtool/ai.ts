import { getSettings } from "./settings";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class AiError extends Error {}

/** OpenAI-compatible chat completion (works with OpenAI, Groq, OpenRouter, Together, local servers...). */
export async function chat(messages: ChatMessage[], opts?: { json?: boolean; temperature?: number }) {
  const s = await getSettings();
  if (!s.ai_api_key) throw new AiError("AI API key not set (Settings → AI)");
  const base = (s.ai_base_url || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.ai_api_key}` },
    body: JSON.stringify({
      model: s.ai_model || "gpt-4o-mini",
      messages,
      temperature: opts?.temperature ?? 0.6,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) throw new AiError(data.error?.message || `AI request failed (${res.status})`);
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export type Personalized = { subject: string; body: string };

/** Rewrites a rendered email for one lead: keeps the offer/CTA, makes it personal and less spammy. */
export async function personalizeEmail(input: {
  subject: string;
  body: string;
  lead: { fullName: string; title?: string | null; company: string; location?: string | null; headline?: string | null; notes?: string | null };
  instructions?: string | null;
}): Promise<Personalized> {
  const sys = `You are an expert B2B cold-email writer. Rewrite the given email for the specific recipient.
Rules: keep the sender's core message, offer and call-to-action; keep it short (under 150 words); plain text, no markdown; natural human tone; no spam-trigger words (free, guarantee, urgent, click here, 100%); no exaggerated claims; do not invent facts about the recipient beyond the provided data; keep any {{unsubscribe_url}} token exactly as-is if present; keep the same language as the original.
Return JSON: {"subject": string, "body": string}.`;
  const user = `RECIPIENT:
Name: ${input.lead.fullName}
Title: ${input.lead.title || "unknown"}
Company: ${input.lead.company}
Location: ${input.lead.location || "unknown"}
Headline: ${input.lead.headline || ""}
Notes: ${input.lead.notes || ""}

${input.instructions ? `EXTRA INSTRUCTIONS FROM SENDER:\n${input.instructions}\n\n` : ""}ORIGINAL SUBJECT: ${input.subject}
ORIGINAL BODY:
${input.body}`;
  const out = await chat([{ role: "system", content: sys }, { role: "user", content: user }], { json: true });
  try {
    const j = JSON.parse(out) as Partial<Personalized>;
    if (j.subject && j.body) return { subject: j.subject, body: j.body };
  } catch {
    /* fallthrough */
  }
  return { subject: input.subject, body: input.body };
}

export async function aiSpamReview(subject: string, body: string) {
  const sys = `You are an email deliverability expert. Score the cold email for spam risk 0-100 (0 = very safe) and suggest concrete improvements. Return JSON {"score": number, "issues": string[], "improved_subject": string, "improved_body": string}. Keep improved body plain text and same language.`;
  const out = await chat([{ role: "system", content: sys }, { role: "user", content: `SUBJECT: ${subject}\n\nBODY:\n${body}` }], { json: true, temperature: 0.3 });
  return JSON.parse(out) as { score: number; issues: string[]; improved_subject: string; improved_body: string };
}

export type SequenceStep = { subject: string; body: string; delayDays: number };

export async function generateSequence(input: { goal: string; audience: string; offer: string; steps: number; tone: string; language: string; company: string }) {
  const sys = `You write high-converting, non-spammy cold email sequences for ${input.company}. Return JSON {"name": string, "steps": [{"subject": string, "body": string, "delayDays": number}]}.
Rules: exactly ${input.steps} steps. Step 1 delayDays=0, later steps 2-5 days. Follow-ups use subject "" (they thread as replies). Plain text, 50-120 words each, one clear ask, no spam words, no links except {{booking_link}}.
Use these merge tags where natural: {{first_name}}, {{company}}, {{title}}, and end every email with {{signature}}. Include {{booking_link}} in at least one step as the call-to-action. Language: ${input.language}. Tone: ${input.tone}.`;
  const user = `Goal: ${input.goal}\nAudience: ${input.audience}\nWhat we offer: ${input.offer}`;
  const out = await chat([{ role: "system", content: sys }, { role: "user", content: user }], { json: true, temperature: 0.7 });
  const j = JSON.parse(out) as { name?: string; steps?: SequenceStep[] };
  const steps = (j.steps || []).filter((s) => s && s.body).slice(0, 8);
  if (!steps.length) throw new AiError("AI returned an empty sequence, try again");
  return { name: j.name || "AI sequence", steps };
}
