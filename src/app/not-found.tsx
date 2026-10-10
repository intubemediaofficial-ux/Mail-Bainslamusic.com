import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import SiteFrame from "@/components/SiteFrame";

export default function NotFound() {
  return (
    <SiteFrame>
      <section className="container-x flex flex-col items-center py-32 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-4xl font-bold text-white">Page not found</h1>
        <p className="mt-3 text-white/60">The page you are looking for does not exist or has moved.</p>
        <Link href="/" className="btn-primary mt-8">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </section>
    </SiteFrame>
  );
}
