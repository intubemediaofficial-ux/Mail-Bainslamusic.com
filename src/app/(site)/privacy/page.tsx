import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { getSettings } from "@/lib/content";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return { title: s.privacy_title, description: `${s.privacy_title} of ${s.legal_name || s.company_name}.` };
}

export default async function Page() {
  const s = await getSettings();
  return <LegalPage title={s.privacy_title} html={s.privacy_html} />;
}
