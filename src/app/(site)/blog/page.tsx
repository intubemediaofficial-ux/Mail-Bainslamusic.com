import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, Clock } from "lucide-react";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import { getBlogCategories, getPublishedPosts, getSettings } from "@/lib/content";
import { formatDate, readingTime } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return { title: s.blog_eyebrow || "Blog", description: s.blog_description };
}

export default async function BlogPage({ searchParams }: { searchParams: { category?: string } }) {
  const category = searchParams.category?.trim() || undefined;
  const [s, posts, categories] = await Promise.all([getSettings(), getPublishedPosts(category), getBlogCategories()]);
  const [first, ...rest] = posts;

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-glow absolute inset-0 -z-10 opacity-70" />
        <div className="container-x py-20 text-center sm:py-28">
          <Reveal>
            <SectionHeading eyebrow={s.blog_eyebrow} title={s.blog_title} description={s.blog_description} />
          </Reveal>
          {categories.length > 0 && (
            <Reveal delay={0.1} className="mt-10 flex flex-wrap justify-center gap-2">
              <Link
                href="/blog"
                className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                  !category ? "border-fuchsia-500 bg-fuchsia-500/15 text-white" : "border-white/10 bg-white/5 text-white/75 hover:border-fuchsia-500 hover:text-white"
                }`}
              >
                All
              </Link>
              {categories.map((c) => (
                <Link
                  key={c}
                  href={`/blog?category=${encodeURIComponent(c)}`}
                  className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                    category === c ? "border-fuchsia-500 bg-fuchsia-500/15 text-white" : "border-white/10 bg-white/5 text-white/75 hover:border-fuchsia-500 hover:text-white"
                  }`}
                >
                  {c}
                </Link>
              ))}
            </Reveal>
          )}
        </div>
      </section>

      <section className="container-x pb-10">
        {posts.length === 0 ? (
          <div className="card p-12 text-center text-white/60">No posts published yet. Check back soon.</div>
        ) : (
          <>
            {first && (
              <Reveal>
                <Link href={`/blog/${first.slug}`} className="card group grid overflow-hidden lg:grid-cols-2">
                  <div className="relative min-h-[240px] bg-gradient-to-br from-fuchsia-600/40 via-violet-700/30 to-cyan-500/20">
                    {first.coverImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={first.coverImage} alt={first.title} className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.02]" />
                    )}
                  </div>
                  <div className="flex flex-col justify-center p-8 sm:p-10">
                    <PostMeta category={first.category} date={first.publishedAt ?? first.createdAt} minutes={readingTime(first.content)} />
                    <h2 className="mt-4 text-2xl font-bold text-white sm:text-3xl">{first.title}</h2>
                    {first.excerpt && <p className="mt-3 leading-relaxed text-white/60">{first.excerpt}</p>}
                    <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-fuchsia-400 transition group-hover:gap-2">
                      Read article <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              </Reveal>
            )}
            {rest.length > 0 && (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((p, i) => (
                  <Reveal key={p.id} delay={i * 0.05}>
                    <Link href={`/blog/${p.slug}`} className="card group flex h-full flex-col overflow-hidden">
                      <div className="relative h-44 bg-gradient-to-br from-fuchsia-600/30 via-violet-700/20 to-cyan-500/10">
                        {p.coverImage && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.coverImage} alt={p.title} className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.03]" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-6">
                        <PostMeta category={p.category} date={p.publishedAt ?? p.createdAt} minutes={readingTime(p.content)} />
                        <h3 className="mt-3 text-lg font-semibold text-white">{p.title}</h3>
                        {p.excerpt && <p className="mt-2 flex-1 text-sm leading-relaxed text-white/60 line-clamp-3">{p.excerpt}</p>}
                        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-fuchsia-400 transition group-hover:gap-2">
                          Read more <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function PostMeta({ category, date, minutes }: { category: string | null; date: Date; minutes: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
      {category && <span className="rounded-full bg-fuchsia-500/15 px-2.5 py-0.5 font-semibold text-fuchsia-300">{category}</span>}
      <span className="inline-flex items-center gap-1">
        <Calendar className="h-3.5 w-3.5" /> {formatDate(date)}
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" /> {minutes} min read
      </span>
    </div>
  );
}
