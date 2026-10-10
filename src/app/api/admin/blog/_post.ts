import { str, bool } from "../_lib";

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

export function postData(b: Record<string, unknown>, existingPublishedAt: Date | null = null) {
  const title = str(b.title, 250);
  if (!title) throw new Error("Title is required");
  const content = typeof b.content === "string" ? b.content.slice(0, 500_000) : "";
  const published = bool(b.published, false);
  const rawDate = str(b.publishedAt, 40);
  const parsed = rawDate ? new Date(rawDate) : null;
  const publishedAt = published
    ? parsed && !Number.isNaN(parsed.getTime())
      ? parsed
      : existingPublishedAt ?? new Date()
    : parsed && !Number.isNaN(parsed.getTime())
      ? parsed
      : existingPublishedAt;
  return {
    title,
    slug: slugify(str(b.slug, 150) || title) || `post-${Date.now()}`,
    content,
    excerpt: str(b.excerpt, 600) || null,
    coverImage: str(b.coverImage, 1000) || null,
    category: str(b.category, 80) || null,
    tags: str(b.tags, 500) || null,
    author: str(b.author, 120) || null,
    metaTitle: str(b.metaTitle, 200) || null,
    metaDesc: str(b.metaDesc, 400) || null,
    published,
    publishedAt,
  };
}
