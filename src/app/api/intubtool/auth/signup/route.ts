import bcrypt from "bcryptjs";
import { ok, fail, readJson, str } from "@/app/api/admin/_lib";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// crude per-process limiter: max 10 signups / IP / hour
const hits = new Map<string, { n: number; reset: number }>();
function limited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 3600_000 });
    return false;
  }
  h.n++;
  return h.n > 10;
}

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (limited(ip)) return fail("Too many sign-ups, try again later", 429);

  const body = await readJson(req);
  if (!body) return fail("Invalid payload");
  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address");
  if (password.length < 8) return fail("Password must be at least 8 characters");

  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return fail("An account with this email already exists — sign in instead", 409);

  const hash = await bcrypt.hash(password, 12);
  await prisma.user.create({ data: { email, password: hash, name: name || null, role: "member", status: "pending" } });
  return ok({ status: "pending" }, 201);
}
