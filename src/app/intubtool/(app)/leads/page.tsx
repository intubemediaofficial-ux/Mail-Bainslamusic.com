import { Suspense } from "react";
import LeadsPage from "@/components/intubtool/LeadsPage";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Leads Database" };

export default async function Page() {
  const user = await currentUser();
  return (
    <Suspense>
      <LeadsPage isAdmin={user?.role === "admin"} />
    </Suspense>
  );
}
