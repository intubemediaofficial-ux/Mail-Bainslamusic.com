import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import AccountsHealth from "@/components/intubtool/AccountsHealth";

export const metadata = { title: "Accounts health" };

export default async function Page() {
  if (!(await requireAdmin())) redirect("/intubtool");
  return <AccountsHealth />;
}
