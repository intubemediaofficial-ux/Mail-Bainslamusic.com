"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LayoutDashboard, Search, Users, Mail, Settings, LogOut, Menu, X, ArrowLeft, UserCheck, Layers, CalendarCheck, BellRing, Inbox } from "lucide-react";

type NavItem = { href: string; label: string; icon: typeof Search; exact?: boolean; admin?: boolean };

const nav: NavItem[] = [
  { href: "/intubtool", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/intubtool/inbox", label: "Gmail Inbox", icon: Inbox },
  { href: "/intubtool/search", label: "LinkedIn Search", icon: Search },
  { href: "/intubtool/leads", label: "Leads Database", icon: Users },
  { href: "/intubtool/saved-searches", label: "Saved Searches", icon: BellRing },
  { href: "/intubtool/campaigns", label: "Email Campaigns", icon: Mail },
  { href: "/intubtool/meetings", label: "Meetings", icon: CalendarCheck, admin: true },
  { href: "/intubtool/multi-send", label: "Multi-account Send", icon: Layers, admin: true },
  { href: "/intubtool/users", label: "Users", icon: UserCheck, admin: true },
  { href: "/intubtool/settings", label: "Settings", icon: Settings },
];

export default function ToolShell({
  children,
  userEmail,
  isAdmin,
  pendingUsers = 0,
}: {
  children: ReactNode;
  userEmail: string;
  isAdmin: boolean;
  pendingUsers?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const logout = () => signOut({ callbackUrl: "/intubtool/login" });

  const links = (
    <ul className="space-y-1">
      {nav.filter((n) => !n.admin || isAdmin).map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        const badge = n.href === "/intubtool/users" ? pendingUsers : 0;
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active ? "bg-cyan-500/15 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <n.icon className={`h-4 w-4 ${active ? "text-cyan-400" : ""}`} />
              {n.label}
              {badge > 0 && (
                <span className="ml-auto rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">{badge}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const brand = (
    <Link href="/intubtool" className="flex items-center gap-2 px-2">
      <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-400 via-sky-500 to-violet-600" />
      <span className="font-extrabold tracking-tight">
        Bainsla <span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">Mail Tool</span>
      </span>
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-[#07070d] text-white">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-black/30 p-5 lg:flex">
        {brand}
        <p className="mt-2 px-2 text-[11px] uppercase tracking-widest text-white/35">Lead research · Outreach</p>
        <nav className="mt-8 flex-1">{links}</nav>
        <div className="border-t border-white/10 pt-4 text-xs text-white/50">
          <p className="truncate px-2">{userEmail}</p>
          <div className="mt-3 flex gap-2 px-2">
            {isAdmin && (
              <Link href="/admin" className="flex items-center gap-1 hover:text-white">
                <ArrowLeft className="h-3.5 w-3.5" /> Site admin
              </Link>
            )}
            <button type="button" onClick={logout} className="ml-auto flex items-center gap-1 hover:text-white">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 lg:hidden">
          {brand}
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg p-2" aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {open && (
          <div className="border-b border-white/10 bg-black/40 p-4 lg:hidden">
            {links}
            <button type="button" onClick={logout} className="mt-3 flex items-center gap-2 px-3 text-sm text-white/60">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        )}
        <main className="flex-1 p-5 sm:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
