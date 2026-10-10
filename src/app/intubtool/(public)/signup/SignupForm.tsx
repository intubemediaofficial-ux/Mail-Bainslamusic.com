"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { UserPlus, CheckCircle2 } from "lucide-react";
import { Button, Field, Input, api } from "@/components/admin/ui";

export default function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match");
    setLoading(true);
    try {
      await api("/api/intubtool/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 space-y-5 text-center">
        <div className="flex gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Account created — waiting for approval</p>
            <p className="mt-0.5 text-xs opacity-80">
              The admin has been notified. Once approved you can sign in with <b>{email}</b>, connect your Gmail and start sending.
            </p>
          </div>
        </div>
        <Link href="/intubtool/login" className="inline-block text-sm font-medium text-cyan-300 hover:text-cyan-200">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <Field label="Your name">
        <Input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Vikash Sharma" />
      </Field>
      <Field label="Email">
        <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
      </Field>
      <Field label="Password" hint="At least 8 characters">
        <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm password">
        <Input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      <Button type="submit" loading={loading} className="w-full">
        <UserPlus className="h-4 w-4" /> Create account
      </Button>
      <p className="text-center text-sm text-white/55">
        Already have an account?{" "}
        <Link href="/intubtool/login" className="font-medium text-cyan-300 hover:text-cyan-200">
          Sign in
        </Link>
      </p>
    </form>
  );
}
