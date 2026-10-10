import { prisma } from "@/lib/db";

let lastCheck = 0;

/** Re-run saved searches whose interval elapsed by queuing a fresh SearchJob (picked up by the search step). */
export async function queueDueSavedSearches() {
  if (Date.now() - lastCheck < 10 * 60_000) return 0;
  lastCheck = Date.now();
  const due = await prisma.savedSearch.findMany({ where: { active: true, nextRunAt: { lte: new Date() } }, take: 20 });
  for (const s of due) {
    let t: Record<string, unknown>;
    try {
      t = JSON.parse(s.template);
    } catch {
      continue;
    }
    const job = await prisma.searchJob.create({
      data: {
        name: `${s.name} · auto ${new Date().toISOString().slice(0, 10)}`,
        companies: String(t.companies ?? "[]"),
        keywords: String(t.keywords ?? "[]"),
        source: String(t.source ?? "salesql"),
        mode: String(t.mode ?? "company"),
        filters: t.filters ? String(t.filters) : null,
        maxPerCompany: Number(t.maxPerCompany) || 25,
        listId: t.listId ? String(t.listId) : null,
        ownerId: s.ownerId,
      },
    });
    await prisma.savedSearch.update({
      where: { id: s.id },
      data: { lastRunAt: new Date(), nextRunAt: new Date(Date.now() + s.intervalDays * 86_400_000), lastJobId: job.id, runs: { increment: 1 } },
    });
  }
  return due.length;
}
