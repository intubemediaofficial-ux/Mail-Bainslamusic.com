import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AccountForm from "./AccountForm";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/admin/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } });
  if (!user) redirect("/admin/login");
  return <AccountForm name={user.name ?? ""} email={user.email} />;
}
