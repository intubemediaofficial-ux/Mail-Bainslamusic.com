"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Phone } from "lucide-react";
import Logo from "./Logo";
import { navLinks } from "@/lib/defaults";
import { telHref } from "@/lib/utils";

export default function Navbar({ phone, ctaLabel, companyName }: { phone: string; ctaLabel: string; companyName: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header
      className={`sticky top-0 z-50 transition ${
        scrolled || open ? "border-b border-white/10 bg-[#07070d]/85 backdrop-blur-lg" : "bg-transparent"
      }`}
    >
      <nav className="container-x flex h-16 items-center justify-between sm:h-[72px]">
        <Logo companyName={companyName} />

        <ul className="hidden items-center gap-8 md:flex">
          {navLinks.map((l) => {
            const active = pathname === l.href;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`text-sm font-medium transition hover:text-white ${
                    active ? "text-white" : "text-white/60"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-3 md:flex">
          <a href={telHref(phone)} className="flex items-center gap-2 text-sm text-white/70 transition hover:text-white">
            <Phone className="h-4 w-4" />
            {phone}
          </a>
          <Link href="/contact" className="btn-primary !px-5 !py-2.5">
            {ctaLabel}
          </Link>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-white md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-white/10 md:hidden">
          <ul className="container-x flex flex-col gap-1 py-4">
            {navLinks.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`block rounded-lg px-3 py-3 text-base font-medium ${
                    pathname === l.href ? "bg-white/10 text-white" : "text-white/70"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex flex-col gap-2 px-3">
              <a href={telHref(phone)} className="btn-secondary">
                <Phone className="h-4 w-4" /> {phone}
              </a>
              <Link href="/contact" className="btn-primary">
                {ctaLabel}
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
