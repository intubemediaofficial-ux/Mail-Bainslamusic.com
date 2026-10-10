"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { LogIn, Clock, Ban } from "lucide-react";
import { Button, Field, Input } from "@/components/admin/ui";

const STATUS_MSG: Record<string, { icon: typeof Clock; title: string; text: string }> = {
  pending: {
    icon: Clock,
    title: "Waiting for admin approval",
    text: "Your account is created. You can sign in as soon as the admin approves it — usually within a day.",
  },
  rejected: { icon: Ban, title: "Request declined", text: "The admin did not approve this account. Contact the admin if you think this is a mistake." },
  disabled: { icon: Ban, title: "Account disabled", text: "This account has been disabled by the admin." },
};

export default function LoginForm({ callbackUrl, initialStatus, registered }: { callbackUrl: string; initialStatus?: string; registered?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<string | null>(initialStatus && STATUS_MSG[initialStatus] ? initialStatus : registered ? "pending" : null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setStatus(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (!res || res.error) {
      if (res?.error && STATUS_MSG[res.error]) setStatus(res.error);
      else setError("Invalid email or password");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  const st = status ? STATUS_MSG[status] : null;

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      {st && (
        <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${status === "pending" ? "border-amber-500/30 bg-amber-500/10 text-amber-100" : "border-red-500/30 bg-red-500/10 text-red-100"}`}>
          <st.icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{st.title}</p>
            <p className="mt-0.5 text-xs opacity-80">{st.text}</p>
            {initialStatus && (
              <button type="button" onClick={() => signOut({ callbackUrl: "/intubtool/login" })} className="mt-2 text-xs underline opacity-80 hover:opacity-100">
                Sign out
              </button>
            )}
          </div>
        </div>
      )}
      <Field label="Email">
        <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </Field>
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      <Button type="submit" loading={loading} className="w-full">
        <LogIn className="h-4 w-4" /> Sign in
      </Button>
      <p className="text-center text-sm text-white/55">
        New here?{" "}
        <Link href="/intubtool/signup" className="font-medium text-cyan-300 hover:text-cyan-200">
          Create an account
        </Link>
      </p>
    </form>
  );
}
