import Link from "next/link";
import { Briefcase, MapPin, LayoutList, Newspaper, Inbox, Settings, ExternalLink, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export default async function AdminDashboard() {
  const [services, offices, blocks, posts, drafts, enquiries, unread, latestEnquiries, latestPosts] = await Promise.all([
    prisma.service.count(),
    prisma.office.count(),
    prisma.block.count(),
    prisma.blogPost.count({ where: { published: true } }),
    prisma.blogPost.count({ where: { published: false } }),
    prisma.enquiry.count(),
    prisma.enquiry.count({ where: { read: false } }),
    prisma.enquiry.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.blogPost.findMany({ orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, published: true, updatedAt: true } }),
  ]);

  const cards = [
    { href: "/admin/services", label: "Services", value: services, icon: Briefcase },
    { href: "/admin/offices", label: "Offices", value: offices, icon: MapPin },
    { href: "/admin/blocks", label: "Page blocks", value: blocks, icon: LayoutList },
    { href: "/admin/blog", label: "Published posts", value: posts, sub: `${drafts} draft${drafts === 1 ? "" : "s"}`, icon: Newspaper },
    { href: "/admin/enquiries", label: "Enquiries", value: enquiries, sub: `${unread} unread`, icon: Inbox },
    { href: "/admin/settings", label: "Site settings", value: "Edit", icon: Settings },
  ];

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-white/55">Everything on the public website is editable from here.</p>
        </div>
        <a href="/" target="_blank" rel="noopener noreferrer" className="btn-secondary !py-2 text-sm">
          View website <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-fuchsia-500/50 hover:bg-white/[0.05]">
            <div className="flex items-center justify-between">
              <c.icon className="h-5 w-5 text-fuchsia-400" />
              <ArrowRight className="h-4 w-4 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white" />
            </div>
            <p className="mt-4 text-3xl font-bold text-white">{c.value}</p>
            <p className="text-sm text-white/60">
              {c.label}
              {c.sub && <span className="text-white/35"> · {c.sub}</span>}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold text-white">Latest enquiries</h2>
            <Link href="/admin/enquiries" className="text-xs text-fuchsia-400 hover:text-fuchsia-300">View all</Link>
          </header>
          <ul className="divide-y divide-white/5">
            {latestEnquiries.length === 0 && <li className="px-5 py-6 text-sm text-white/40">No enquiries yet.</li>}
            {latestEnquiries.map((e) => (
              <li key={e.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white">
                    {!e.read && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-fuchsia-500" />}
                    {e.name}
                  </span>
                  <span className="text-xs text-white/40">{formatDate(e.createdAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-white/55">{e.service ? `${e.service} — ` : ""}{e.message}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
          <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="font-semibold text-white">Recent posts</h2>
            <Link href="/admin/blog/new" className="text-xs text-fuchsia-400 hover:text-fuchsia-300">New post</Link>
          </header>
          <ul className="divide-y divide-white/5">
            {latestPosts.length === 0 && <li className="px-5 py-6 text-sm text-white/40">No posts yet.</li>}
            {latestPosts.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/blog/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-white/[0.03]">
                  <span className="truncate font-medium text-white">{p.title}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.published ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/60"}`}>
                    {p.published ? "Published" : "Draft"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
