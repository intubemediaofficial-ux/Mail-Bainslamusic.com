// One-off: accounts created before signup/approval existed were all admins.
// Usage: npx tsx prisma/migrate-users.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.user.count({ where: { role: "admin" } });
  if (admins > 0) {
    console.log(`Admins already present (${admins}) — nothing to do`);
    return;
  }
  const r = await prisma.user.updateMany({
    data: { role: "admin", status: "approved", shareData: true, approvedAt: new Date() },
  });
  console.log(`Promoted ${r.count} existing user(s) to approved admin`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
