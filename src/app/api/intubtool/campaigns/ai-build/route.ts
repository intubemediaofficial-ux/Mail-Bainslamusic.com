import { ok, fail, readJson, str, int } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";
import { getScope } from "@/lib/intubtool/scope";
import { AiError, generateSequence } from "@/lib/intubtool/ai";
import { stepsData } from "@/lib/intubtool/campaign-input";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const scope = await getScope();
  if (!scope) return fail("Unauthorized", 401);
  const b = await readJson(req);
  if (!b) return fail("Invalid payload");
  const goal = str(b.goal, 500);
  if (!goal) return fail("Describe the goal of the campaign");
  try {
    const seq = await generateSequence({
      goal,
      audience: str(b.audience, 500) || "music industry professionals",
      offer: str(b.offer, 1000) || "music distribution, YouTube Content ID / CMS and promotion services by Bainsla Music",
      steps: Math.min(6, Math.max(1, int(b.steps, 3))),
      tone: str(b.tone, 60) || "friendly, professional",
      language: str(b.language, 60) || "English",
      company: "Bainsla Music",
    });
    const steps = stepsData(seq.steps);
    if (!steps.length) return fail("AI sequence was invalid, try again");
    const c = await prisma.campaign.create({
      data: { name: str(b.name, 150) || seq.name.slice(0, 150), ownerId: scope.owner, steps: { create: steps } },
    });
    return ok({ id: c.id }, 201);
  } catch (e) {
    return fail(e instanceof AiError ? e.message : `AI failed: ${(e as Error).message}`.slice(0, 300), e instanceof AiError ? 400 : 502);
  }
}
