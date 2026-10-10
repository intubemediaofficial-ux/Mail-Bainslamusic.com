import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const s = await getSettings();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] },
    sitemap: `${s.site_url.replace(/\/$/, "")}/sitemap.xml`,
  };
}
