import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { getSettings } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return { title: s.terms_title, description: `${s.terms_title} of ${s.legal_name || s.company_name}.` };
}

export default async function Page() {
  const s = await getSettings();
  return <LegalPage title={s.terms_title} html={s.terms_html} />;
}
