import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import { getOffices, getServices, getSettings } from "@/lib/content";
import { whatsappLink } from "@/lib/utils";

export default async function SiteFrame({ children }: { children: React.ReactNode }) {
  const [settings, offices, services] = await Promise.all([getSettings(), getOffices(), getServices()]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.company_name,
    legalName: settings.legal_name,
    url: settings.site_url,
    email: settings.email,
    telephone: settings.phone,
    description: settings.description,
    address: offices.map((o) => ({
      "@type": "PostalAddress",
      streetAddress: o.lineList[0] ?? "",
      addressLocality: o.city,
      addressCountry: o.country,
    })),
    sameAs: [settings.social_youtube, settings.social_instagram, settings.social_facebook, settings.social_linkedin].filter(Boolean),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar phone={settings.phone} ctaLabel={settings.nav_cta_label} companyName={settings.company_name} />
      <main className="flex-1">{children}</main>
      <Footer settings={settings} offices={offices} services={services} />
      <WhatsAppButton href={whatsappLink(settings, settings.whatsapp_greeting)} />
    </>
  );
}
