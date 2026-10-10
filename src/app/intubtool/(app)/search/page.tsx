import { Suspense } from "react";
import SearchPage from "@/components/intubtool/SearchPage";

export const metadata = { title: "LinkedIn Search" };

export default function Page() {
  return (
    <Suspense>
      <SearchPage />
    </Suspense>
  );
}
