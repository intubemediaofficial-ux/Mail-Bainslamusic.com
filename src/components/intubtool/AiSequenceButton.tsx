"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button, Modal, Field, Input, Textarea, Select, api } from "@/components/admin/ui";

export default function AiSequenceButton({ onError }: { onError: (m: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    goal: "Get artists and music labels to distribute their songs and set up YouTube Content ID with Bainsla Music",
    audience: "Indian singers, music producers, independent artists and small music labels",
    offer: "Music distribution to all platforms, YouTube CMS / Content ID, channel growth and promotion",
    steps: "3",
    tone: "friendly, professional",
    language: "English",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const build = async () => {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/intubtool/campaigns/ai-build", { method: "POST", body: JSON.stringify({ ...f, steps: Number(f.steps) }) });
      router.push(`/intubtool/campaigns/${r.id}`);
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4" /> AI sequence</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Build a full sequence with AI">
        <div className="space-y-4">
          <Field label="Goal"><Textarea rows={2} value={f.goal} onChange={set("goal")} /></Field>
          <Field label="Who are we emailing?"><Input value={f.audience} onChange={set("audience")} /></Field>
          <Field label="What we offer"><Textarea rows={2} value={f.offer} onChange={set("offer")} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Emails">
              <Select value={f.steps} onChange={set("steps")}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} steps</option>)}</Select>
            </Field>
            <Field label="Language">
              <Select value={f.language} onChange={set("language")}>{["English", "Hindi", "Hinglish (Roman Hindi)"].map((l) => <option key={l}>{l}</option>)}</Select>
            </Field>
            <Field label="Tone"><Input value={f.tone} onChange={set("tone")} /></Field>
          </div>
          <p className="text-xs text-white/50">AI writes subject + body for every step with follow-up delays, merge tags and your {"{{booking_link}}"}. You can edit everything before starting.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={build} loading={busy}><Sparkles className="h-4 w-4" /> Generate campaign</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
