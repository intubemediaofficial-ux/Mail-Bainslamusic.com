import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Calendar, Clock, User } from "lucide-react";
import Reveal from "@/components/Reveal";
import { getPostBySlug, getPublishedPosts, getSettings } from "@/lib/content";
import { formatDate, readingTime } from "@/lib/utils";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPostBySlug(params.slug);
  if (!post) return { title: "Post not found" };
  const title = post.metaTitle || post.title;
  const description = post.metaDesc || post.excerpt || undefined;
  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      publishedTime: (post.publishedAt ?? post.createdAt).toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const [post, s] = await Promise.all([getPostBySlug(params.slug), getSettings()]);
  if (!post) notFound();

  const all = await getPublishedPosts();
  const related = all.filter((p) => p.id !== post.id && (!post.category || p.category === post.category)).slice(0, 3);
  const tags = (post.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const date = post.publishedAt ?? post.createdAt;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.coverImage ?? undefined,
    datePublished: date.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { "@type": "Organization", name: post.author || s.company_name },
    publisher: { "@type": "Organization", name: s.legal_name || s.company_name },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article>
        <section className="relative overflow-hidden">
          <div className="bg-glow absolute inset-0 -z-10 opacity-60" />
          <div className="container-x max-w-4xl py-16 sm:py-24">
            <Reveal>
              <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
                <ArrowLeft className="h-4 w-4" /> All posts
              </Link>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-white/50">
                {post.category && (
                  <Link href={`/blog?category=${encodeURIComponent(post.category)}`} className="rounded-full bg-fuchsia-500/15 px-2.5 py-0.5 font-semibold text-fuchsia-300">
                    {post.category}
                  </Link>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> {formatDate(date)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {readingTime(post.content)} min read
                </span>
                {post.author && (
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> {post.author}
                  </span>
                )}
              </div>
              <h1 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">{post.title}</h1>
              {post.excerpt && <p className="mt-5 text-lg leading-relaxed text-white/65">{post.excerpt}</p>}
            </Reveal>
          </div>
        </section>

        {post.coverImage && (
          <div className="container-x max-w-5xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.coverImage} alt={post.title} className="max-h-[520px] w-full rounded-3xl border border-white/10 object-cover" />
          </div>
        )}

        <div className="container-x max-w-3xl py-14">
          <div className="prose-blog" dangerouslySetInnerHTML={{ __html: post.content }} />
          {tags.length > 0 && (
            <div className="mt-12 flex flex-wrap gap-2 border-t border-white/10 pt-8">
              {tags.map((t) => (
                <span key={t} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </article>

      {related.length > 0 && (
        <section className="container-x py-10">
          <h2 className="text-xl font-bold text-white">Related posts</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <Link key={p.id} href={`/blog/${p.slug}`} className="card group flex h-full flex-col p-6">
                <span className="text-xs text-white/50">{formatDate(p.publishedAt ?? p.createdAt)}</span>
                <h3 className="mt-2 font-semibold text-white">{p.title}</h3>
                {p.excerpt && <p className="mt-2 flex-1 text-sm text-white/60 line-clamp-2">{p.excerpt}</p>}
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-fuchsia-400 transition group-hover:gap-2">
                  Read <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
