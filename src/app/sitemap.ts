import type { MetadataRoute } from "next";
import { navLinks } from "@/lib/defaults";
import { getPublishedPosts, getSettings } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [s, posts] = await Promise.all([getSettings(), getPublishedPosts()]);
  const base = s.site_url.replace(/\/$/, "");
  return [
    ...navLinks.map((l) => ({
      url: `${base}${l.href === "/" ? "" : l.href}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: l.href === "/" ? 1 : 0.8,
    })),
    ...["/privacy", "/terms"].map((href) => ({
      url: `${base}${href}`,
      lastModified: new Date(),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
