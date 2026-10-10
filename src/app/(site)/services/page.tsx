import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import { getServices, getSettings } from "@/lib/content";
import { getIcon } from "@/lib/icons";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return { title: s.services_eyebrow || "Services", description: s.services_description };
}

export default async function ServicesPage() {
  const [s, services] = await Promise.all([getSettings(), getServices()]);
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-glow absolute inset-0 -z-10 opacity-70" />
        <div className="container-x py-20 text-center sm:py-28">
          <Reveal>
            <SectionHeading eyebrow={s.services_eyebrow} title={s.services_title} description={s.services_description} />
          </Reveal>
          <Reveal delay={0.1} className="mt-10 flex flex-wrap justify-center gap-2">
            {services.map((sv) => (
              <a
                key={sv.id}
                href={`#${sv.slug}`}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/75 transition hover:border-fuchsia-500 hover:text-white"
              >
                {sv.title}
              </a>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="container-x space-y-8 pb-10">
        {services.map((sv, i) => {
          const Icon = getIcon(sv.icon);
          const reverse = i % 2 === 1;
          return (
            <Reveal key={sv.id}>
              <article id={sv.slug} className="card grid scroll-mt-24 gap-8 p-7 sm:p-10 lg:grid-cols-2 lg:items-center">
                <div className={reverse ? "lg:order-2" : ""}>
                  <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${sv.accent} text-white shadow-lg`}>
                    <Icon className="h-7 w-7" />
                  </div>
                  <h2 className="mt-5 text-2xl font-bold text-white sm:text-3xl">{sv.title}</h2>
                  <p className="mt-3 text-base leading-relaxed text-white/65">{sv.description}</p>
                  <Link href={`/contact?service=${encodeURIComponent(sv.title)}`} className="btn-primary mt-7">
                    Enquire about {sv.title.split(" ")[0]} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <ul className={`grid gap-3 ${reverse ? "lg:order-1" : ""}`}>
                  {sv.pointList.map((p) => (
                    <li key={p} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-sm text-white/80">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${sv.accent}`}>
                        <Check className="h-3 w-3 text-white" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          );
        })}
      </section>

      <section className="container-x py-16">
        <Reveal>
          <div className="card flex flex-col items-center gap-6 p-10 text-center sm:flex-row sm:justify-between sm:text-left">
            <div>
              <h2 className="text-2xl font-bold text-white">{s.services_cta_title}</h2>
              <p className="mt-2 text-white/60">{s.services_cta_text}</p>
            </div>
            <Link href="/contact" className="btn-primary shrink-0">
              Talk to us <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
