import type { Metadata } from "next";
import { Suspense } from "react";
import BookingForm from "./BookingForm";

export const metadata: Metadata = { title: "Book a call · Bainsla Music" };

export default function BookPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07070d] px-4 py-12 text-white">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-fuchsia-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-violet-600/25 blur-3xl" />
      <div className="relative mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <div className="text-2xl font-extrabold tracking-tight">
            Bainsla <span className="bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">Music</span>
          </div>
        </div>
        <Suspense fallback={<div className="text-center text-white/50">Loading…</div>}>
          <BookingForm />
        </Suspense>
      </div>
    </main>
  );
}
