import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import MultiSendPage from "@/components/intubtool/MultiSendPage";

export const metadata = { title: "Multi-account Send" };

export default async function Page() {
  if (!(await requireAdmin())) redirect("/");
  return <MultiSendPage />;
}
