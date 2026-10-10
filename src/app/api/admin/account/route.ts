import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ok, fail, readJson, str } from "../_lib";

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return fail("Unauthorized", 401);

  const body = await readJson<{ name?: unknown; email?: unknown; currentPassword?: unknown; newPassword?: unknown }>(req);
  if (!body) return fail("Invalid payload");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return fail("Unauthorized", 401);

  const data: { name?: string; email?: string; password?: string } = {};
  const name = str(body.name, 100);
  const email = str(body.email, 200).toLowerCase();
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";

  if (name) data.name = name;
  if (email && email !== user.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Invalid email");
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) return fail("Email already in use");
    data.email = email;
  }
  if (newPassword) {
    if (newPassword.length < 8) return fail("New password must be at least 8 characters");
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
      return fail("Current password is incorrect");
    }
    data.password = await bcrypt.hash(newPassword, 12);
  }
  if (Object.keys(data).length === 0) return fail("Nothing to update");

  const updated = await prisma.user.update({ where: { id: user.id }, data, select: { id: true, name: true, email: true } });
  return ok(updated);
}
