import type { Metadata } from "next";
import AuthCard from "../AuthCard";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · IntubTool", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function ToolLoginPage({ searchParams }: { searchParams: { callbackUrl?: string; status?: string; registered?: string } }) {
  const cb = /^\/(admin|intubtool)(\/|$)/.test(searchParams.callbackUrl || "") ? searchParams.callbackUrl! : "/intubtool";
  return (
    <AuthCard title="Sign in" subtitle="Lead research & Gmail outreach">
      <LoginForm callbackUrl={cb} initialStatus={searchParams.status} registered={searchParams.registered === "1"} />
    </AuthCard>
  );
}
