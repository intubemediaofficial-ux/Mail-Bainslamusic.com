import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/admin/login");
  const unread = await prisma.enquiry.count({ where: { read: false } }).catch(() => 0);
  return (
    <AdminShell userEmail={session.user.email ?? ""} unread={unread}>
      {children}
    </AdminShell>
  );
}
