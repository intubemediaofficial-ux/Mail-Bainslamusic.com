import { prisma } from "@/lib/db";
import { ACCENTS, BLOCK_SECTIONS } from "@/lib/defaults";
import { ICONS } from "@/lib/icons";
import { str, bool, int } from "../_lib";

type Json = Record<string, unknown>;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const serviceData = (b: Json) => {
  const title = str(b.title, 200);
  if (!title) throw new Error("Title is required");
  const icon = str(b.icon, 50);
  const accent = str(b.accent, 100);
  return {
    slug: slugify(str(b.slug, 100) || title),
    title,
    short: str(b.short, 300),
    description: str(b.description, 3000),
    points: str(b.points, 3000),
    icon: icon in ICONS ? icon : "Sparkles",
    accent: ACCENTS.includes(accent) ? accent : ACCENTS[0],
    sortOrder: int(b.sortOrder),
    active: bool(b.active),
  };
};

const officeData = (b: Json) => {
  const city = str(b.city, 100);
  if (!city) throw new Error("City is required");
  return {
    label: str(b.label, 100) || `${city} Office`,
    city,
    country: str(b.country, 100),
    lines: str(b.lines, 1000),
    mapQuery: str(b.mapQuery, 300) || `${city}, ${str(b.country, 100)}`,
    sortOrder: int(b.sortOrder),
    active: bool(b.active),
  };
};

const blockData = (b: Json) => {
  const section = str(b.section, 50);
  if (!(section in BLOCK_SECTIONS)) throw new Error("Invalid section");
  const title = str(b.title, 200);
  if (!title) throw new Error("Title is required");
  const icon = str(b.icon, 50);
  return {
    section,
    icon: icon in ICONS ? icon : null,
    title,
    text: str(b.text, 2000),
    sortOrder: int(b.sortOrder),
    active: bool(b.active),
  };
};

export const resources = {
  services: {
    list: (q: URLSearchParams) => prisma.service.findMany({ orderBy: { sortOrder: "asc" }, where: q.get("all") ? {} : undefined }),
    create: (b: Json) => prisma.service.create({ data: serviceData(b) }),
    update: (id: string, b: Json) => prisma.service.update({ where: { id }, data: serviceData(b) }),
    remove: (id: string) => prisma.service.delete({ where: { id } }),
    reorder: (ids: string[]) =>
      prisma.$transaction(ids.map((id, i) => prisma.service.update({ where: { id }, data: { sortOrder: i } }))),
  },
  offices: {
    list: () => prisma.office.findMany({ orderBy: { sortOrder: "asc" } }),
    create: (b: Json) => prisma.office.create({ data: officeData(b) }),
    update: (id: string, b: Json) => prisma.office.update({ where: { id }, data: officeData(b) }),
    remove: (id: string) => prisma.office.delete({ where: { id } }),
    reorder: (ids: string[]) =>
      prisma.$transaction(ids.map((id, i) => prisma.office.update({ where: { id }, data: { sortOrder: i } }))),
  },
  blocks: {
    list: (q: URLSearchParams) => {
      const section = q.get("section");
      return prisma.block.findMany({
        where: section ? { section } : undefined,
        orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
      });
    },
    create: (b: Json) => prisma.block.create({ data: blockData(b) }),
    update: (id: string, b: Json) => prisma.block.update({ where: { id }, data: blockData(b) }),
    remove: (id: string) => prisma.block.delete({ where: { id } }),
    reorder: (ids: string[]) =>
      prisma.$transaction(ids.map((id, i) => prisma.block.update({ where: { id }, data: { sortOrder: i } }))),
  },
};

export type ResourceName = keyof typeof resources;

export const isResource = (name: string): name is ResourceName => name in resources;
