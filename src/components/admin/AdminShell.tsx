"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Settings, Briefcase, MapPin, LayoutList, Newspaper, Inbox, KeyRound, LogOut, ExternalLink, Menu, X,
} from "lucide-react";

const nav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/settings", label: "Site Settings", icon: Settings },
  { href: "/admin/services", label: "Services", icon: Briefcase },
  { href: "/admin/offices", label: "Offices", icon: MapPin },
  { href: "/admin/blocks", label: "Page Blocks", icon: LayoutList },
  { href: "/admin/blog", label: "Blog", icon: Newspaper },
  { href: "/admin/enquiries", label: "Enquiries", icon: Inbox },
  { href: "/admin/account", label: "Account", icon: KeyRound },
];

export default function AdminShell({ children, userEmail, unread }: { children: ReactNode; userEmail: string; unread: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <ul className="space-y-1">
      {nav.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-fuchsia-600/20 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <n.icon className={`h-4 w-4 ${active ? "text-fuchsia-400" : ""}`} />
              {n.label}
              {n.href === "/admin/enquiries" && unread > 0 && (
                <span className="ml-auto rounded-full bg-fuchsia-600 px-2 py-0.5 text-[10px] font-bold text-white">{unread}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex min-h-screen bg-[#07070d] text-white">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-black/30 p-5 lg:flex">
        <Link href="/admin" className="flex items-center gap-2 px-2">
          <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-fuchsia-500 via-violet-600 to-cyan-500" />
          <span className="font-extrabold tracking-tight">
            KVS<span className="gradient-text">PT</span> <span className="text-xs font-medium text-white/40">Admin</span>
          </span>
        </Link>
        <nav className="mt-8 flex-1">{links}</nav>
        <div className="border-t border-white/10 pt-4 text-xs text-white/50">
          <p className="truncate px-2">{userEmail}</p>
          <div className="mt-3 flex gap-2 px-2">
            <a href="/" target="_blank" className="flex items-center gap-1 hover:text-white">
              <ExternalLink className="h-3.5 w-3.5" /> View site
            </a>
            <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })} className="ml-auto flex items-center gap-1 hover:text-white">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 lg:hidden">
          <Link href="/admin" className="font-extrabold">
            KVS<span className="gradient-text">PT</span> <span className="text-xs text-white/40">Admin</span>
          </Link>
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg p-2" aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {open && (
          <div className="border-b border-white/10 bg-black/40 p-4 lg:hidden">
            {links}
            <button type="button" onClick={() => signOut({ callbackUrl: "/admin/login" })} className="mt-3 flex items-center gap-2 px-3 text-sm text-white/60">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        )}
        <main className="flex-1 p-5 sm:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
