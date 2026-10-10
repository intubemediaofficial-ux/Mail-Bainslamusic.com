import type { Metadata } from "next";
import Logo from "@/components/Logo";
import LoginForm from "./LoginForm";
import { getSettings } from "@/lib/content";

export const metadata: Metadata = { title: "Admin login", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: { callbackUrl?: string; error?: string } }) {
  const s = await getSettings();
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="bg-glow absolute inset-0 -z-10" />
      <div className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d0d17]/90 p-8 shadow-2xl backdrop-blur">
        <div className="flex flex-col items-center text-center">
          <Logo companyName={s.company_name} />
          <h1 className="mt-6 text-xl font-bold text-white">Admin panel</h1>
          <p className="mt-1 text-sm text-white/55">Sign in to manage your website content.</p>
        </div>
        <LoginForm callbackUrl={/^\/(?![\/\\])/.test(searchParams.callbackUrl || "") ? searchParams.callbackUrl! : "/admin"} initialError={!!searchParams.error} />
      </div>
    </div>
  );
}
