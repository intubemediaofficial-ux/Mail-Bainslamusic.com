import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getSettings } from "@/lib/content";

export const dynamic = "force-dynamic";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  let metadataBase: URL | undefined;
  try {
    metadataBase = new URL(s.site_url);
  } catch {
    metadataBase = undefined;
  }
  const title = s.seo_title || `${s.company_name} — ${s.tagline}`;
  const description = s.seo_description || s.description;
  const images = s.seo_og_image ? [{ url: s.seo_og_image }] : undefined;
  return {
    metadataBase,
    title: { default: title, template: `%s | ${s.company_name}` },
    description,
    keywords: s.seo_keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    openGraph: { type: "website", siteName: s.company_name, title, description, url: s.site_url, images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} flex min-h-screen flex-col antialiased`}>{children}</body>
    </html>
  );
}
