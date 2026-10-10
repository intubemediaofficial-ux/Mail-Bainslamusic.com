import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { blastStats, denied } from "./_lib";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return denied();
  const blasts = await prisma.blast.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { accounts: true, leads: true } } } });
  return ok(await Promise.all(blasts.map(async (b) => ({ ...b, stats: await blastStats(b.id) }))));
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return denied();
  const b = await readJson(req);
  const name = str(b?.name, 120);
  if (!name) return fail("Name is required");
  const blast = await prisma.blast.create({
    data: {
      name,
      templates: JSON.stringify([
        {
          subject: "Quick question about {{company}}",
          body: "Hi {{first_name}},\n\nI came across {{company}} and wanted to reach out.\n\n[Write your pitch here — 3–5 lines, one clear ask.]\n\nWould a short call this week make sense?\n\n{{signature}}",
        },
      ]),
      followUpBody: "Hi {{first_name}}, just bumping this in case it got buried. Happy to share a 2-minute overview if useful.\n\n{{signature}}",
    },
  });
  return ok(blast, 201);
}
