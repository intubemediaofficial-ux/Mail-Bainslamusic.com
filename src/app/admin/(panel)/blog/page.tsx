import Link from "next/link";
import { Plus, Pencil, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Blog" };

export default async function BlogAdminPage() {
  const posts = await prisma.blogPost.findMany({ orderBy: { updatedAt: "desc" } });
  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Blog</h1>
          <p className="mt-1 text-sm text-white/55">
            {posts.filter((p) => p.published).length} published · {posts.filter((p) => !p.published).length} drafts
          </p>
        </div>
        <Link href="/admin/blog/new" className="btn-primary !py-2 text-sm">
          <Plus className="h-4 w-4" /> New post
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {posts.length === 0 ? (
          <p className="p-10 text-center text-sm text-white/50">No posts yet — write your first article.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-black/30 text-left text-xs uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="hidden px-4 py-3 md:table-cell">Category</th>
                <th className="hidden px-4 py-3 sm:table-cell">Status</th>
                <th className="hidden px-4 py-3 lg:table-cell">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {posts.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/blog/${p.id}`} className="font-medium text-white hover:text-fuchsia-300">
                      {p.title}
                    </Link>
                    <p className="text-xs text-white/40">/blog/{p.slug}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-white/60 md:table-cell">{p.category ?? "—"}</td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.published ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/60"}`}>
                      {p.published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-white/50 lg:table-cell">{formatDate(p.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {p.published && (
                        <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" title="View">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <Link href={`/admin/blog/${p.id}`} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" title="Edit">
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
