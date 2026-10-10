import { cache } from "react";
import type { Office as DbOffice, Service as DbService, Block as DbBlock, BlogPost } from "@prisma/client";
import { prisma } from "@/lib/db";
import { defaultSettings, type Settings, type BlockSection } from "@/lib/defaults";
import { splitLines } from "@/lib/utils";

export type Office = DbOffice & { lineList: string[] };
export type Service = DbService & { pointList: string[] };
export type Block = DbBlock;
export type { BlogPost };

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await prisma.siteSetting.findMany().catch(() => []);
  const merged: Settings = { ...defaultSettings };
  for (const row of rows) {
    if (row.key in merged) merged[row.key as keyof Settings] = row.value;
  }
  return merged;
});

export const getOffices = cache(async (): Promise<Office[]> => {
  const rows = await prisma.office
    .findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })
    .catch(() => []);
  return rows.map((o) => ({ ...o, lineList: splitLines(o.lines) }));
});

export const getServices = cache(async (): Promise<Service[]> => {
  const rows = await prisma.service
    .findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })
    .catch(() => []);
  return rows.map((s) => ({ ...s, pointList: splitLines(s.points) }));
});

export const getBlocks = cache(async (section: BlockSection): Promise<Block[]> => {
  return prisma.block
    .findMany({ where: { section, active: true }, orderBy: { sortOrder: "asc" } })
    .catch(() => []);
});

export const getPublishedPosts = cache(async (category?: string): Promise<BlogPost[]> => {
  return prisma.blogPost
    .findMany({
      where: { published: true, ...(category ? { category } : {}) },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    })
    .catch(() => []);
});

export const getPostBySlug = cache(async (slug: string): Promise<BlogPost | null> => {
  return prisma.blogPost.findFirst({ where: { slug, published: true } }).catch(() => null);
});

export const getBlogCategories = cache(async (): Promise<string[]> => {
  const rows = await prisma.blogPost
    .findMany({ where: { published: true, category: { not: null } }, select: { category: true }, distinct: ["category"] })
    .catch(() => []);
  return rows.map((r) => r.category).filter((c): c is string => Boolean(c));
});
