import UsersPage from "@/components/intubtool/UsersPage";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Users" };

export default async function Page() {
  if (!(await requireAdmin())) redirect("/intubtool");
  return <UsersPage />;
}
