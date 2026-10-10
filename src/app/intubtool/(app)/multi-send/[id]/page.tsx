import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import MultiSendDetail from "@/components/intubtool/MultiSendDetail";

export const metadata = { title: "Multi-account Send" };

export default async function Page({ params }: { params: { id: string } }) {
  if (!(await requireAdmin())) redirect("/intubtool");
  return <MultiSendDetail id={params.id} />;
}
