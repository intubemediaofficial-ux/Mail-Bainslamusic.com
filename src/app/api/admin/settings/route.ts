import { prisma } from "@/lib/db";
import { defaultSettings } from "@/lib/defaults";
import { ok, fail, readJson, revalidateSite } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.siteSetting.findMany();
  const values: Record<string, string> = { ...defaultSettings };
  for (const r of rows) if (r.key in values) values[r.key] = r.value;
  return ok(values);
}

export async function PUT(req: Request) {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body || typeof body !== "object") return fail("Invalid payload");

  const entries = Object.entries(body).filter(
    ([key, value]) => key in defaultSettings && typeof value === "string"
  ) as [string, string][];
  if (entries.length === 0) return fail("No valid settings supplied");

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.siteSetting.upsert({ where: { key }, update: { value: value.slice(0, 10000) }, create: { key, value: value.slice(0, 10000) } })
    )
  );
  revalidateSite();
  return ok({ updated: entries.length });
}
