import type { BlogPost } from "@prisma/client";

export type PostDraft = {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  coverImage: string;
  category: string;
  tags: string;
  author: string;
  metaTitle: string;
  metaDesc: string;
  published: boolean;
  publishedAt: string;
};

export function toDraft(p?: BlogPost | null, defaultAuthor = ""): PostDraft {
  return {
    title: p?.title ?? "",
    slug: p?.slug ?? "",
    content: p?.content ?? "",
    excerpt: p?.excerpt ?? "",
    coverImage: p?.coverImage ?? "",
    category: p?.category ?? "",
    tags: p?.tags ?? "",
    author: p?.author ?? defaultAuthor,
    metaTitle: p?.metaTitle ?? "",
    metaDesc: p?.metaDesc ?? "",
    published: p?.published ?? false,
    publishedAt: p?.publishedAt ? toLocalInput(p.publishedAt) : "",
  };
}

function toLocalInput(d: Date | string) {
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
