import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ToolShell from "@/components/intubtool/ToolShell";

export const metadata: Metadata = { title: { default: "Bainsla Mail Tool", template: "%s · Bainsla Mail Tool" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function IntubToolLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/intubtool/login?callbackUrl=/intubtool");
  const pendingUsers = user.role === "admin" ? await prisma.user.count({ where: { status: "pending" } }) : 0;
  return (
    <ToolShell userEmail={user.email} isAdmin={user.role === "admin"} pendingUsers={pendingUsers}>
      {children}
    </ToolShell>
  );
}
