import type { Metadata } from "next";
import { Mail, Phone, Clock, MessageCircle } from "lucide-react";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import ContactForm from "@/components/ContactForm";
import OfficeCard from "@/components/OfficeCard";
import { getOffices, getServices, getSettings } from "@/lib/content";
import { telHref, whatsappLink } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return { title: "Contact", description: `Contact ${s.company_name}. Email ${s.email} or call ${s.phone}.` };
}

export default async function ContactPage({ searchParams }: { searchParams: { service?: string } }) {
  const [s, offices, services] = await Promise.all([getSettings(), getOffices(), getServices()]);
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-glow absolute inset-0 -z-10 opacity-70" />
        <div className="container-x py-20 text-center sm:py-28">
          <Reveal>
            <SectionHeading eyebrow={s.contact_eyebrow} title={s.contact_title} description={s.contact_description} />
          </Reveal>
        </div>
      </section>

      <section className="container-x grid gap-10 pb-10 lg:grid-cols-12">
        <Reveal className="lg:col-span-7">
          <ContactForm
            initialService={searchParams.service ?? ""}
            serviceTitles={services.map((sv) => sv.title)}
            companyName={s.company_name}
            email={s.email}
            whatsapp={whatsappLink(s)}
          />
        </Reveal>

        <div className="space-y-5 lg:col-span-5">
          <Reveal delay={0.05}>
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white">Direct contact</h3>
              <ul className="mt-4 space-y-4 text-sm">
                <li>
                  <a href={`mailto:${s.email}`} className="flex items-center gap-3 text-white/70 hover:text-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia-500/15 text-fuchsia-400">
                      <Mail className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-xs uppercase tracking-wider text-white/40">Email</span>
                      {s.email}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={telHref(s.phone)} className="flex items-center gap-3 text-white/70 hover:text-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia-500/15 text-fuchsia-400">
                      <Phone className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-xs uppercase tracking-wider text-white/40">Phone</span>
                      {s.phone}
                    </span>
                  </a>
                </li>
                <li>
                  <a href={whatsappLink(s)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-white/70 hover:text-white">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                      <MessageCircle className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-xs uppercase tracking-wider text-white/40">WhatsApp</span>
                      {s.phone}
                    </span>
                  </a>
                </li>
                {s.hours && (
                  <li className="flex items-center gap-3 text-white/70">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia-500/15 text-fuchsia-400">
                      <Clock className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-xs uppercase tracking-wider text-white/40">Hours</span>
                      {s.hours}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          </Reveal>
          {offices.map((o, i) => (
            <Reveal key={o.id} delay={0.1 + i * 0.05}>
              <OfficeCard office={o} />
            </Reveal>
          ))}
        </div>
      </section>

      {offices.length > 0 && (
        <section className="container-x grid gap-5 py-16 md:grid-cols-2">
          {offices.map((o) => (
            <Reveal key={o.id}>
              <div className="card overflow-hidden">
                <iframe
                  title={`${o.city} office map`}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(o.mapQuery)}&output=embed`}
                  className="h-72 w-full grayscale invert-[0.9] hue-rotate-180"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="p-4 text-sm text-white/70">
                  <span className="font-semibold text-white">{o.label}:</span> {o.lineList.join(", ")}
                </div>
              </div>
            </Reveal>
          ))}
        </section>
      )}
    </>
  );
}
