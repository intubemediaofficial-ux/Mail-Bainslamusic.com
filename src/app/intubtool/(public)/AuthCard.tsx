import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07070d] px-4 text-white">
      <div className="bg-glow absolute inset-0 -z-10" />
      <div className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0d0d17]/90 p-8 shadow-2xl backdrop-blur">
        <div className="flex flex-col items-center text-center">
          <Link href="/intubtool/login" className="flex items-center gap-2">
            <span className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-600" />
            <span className="text-xl font-extrabold tracking-tight">
              Intub<span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">Tool</span>
            </span>
          </Link>
          <h1 className="mt-6 text-xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-white/55">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
