import Link from "next/link";
import { ArrowRight, Play, Sparkles, Smartphone, Download } from "lucide-react";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import ServiceCard from "@/components/ServiceCard";
import OfficeCard from "@/components/OfficeCard";
import { getBlocks, getOffices, getServices, getSettings } from "@/lib/content";
import { fillTemplate, splitLines, whatsappLink } from "@/lib/utils";
import { getIcon } from "@/lib/icons";

export default async function HomePage() {
  const [s, services, offices, stats, whyUs] = await Promise.all([
    getSettings(),
    getServices(),
    getOffices(),
    getBlocks("stats"),
    getBlocks("why-us"),
  ]);
  const featuredCount = Math.max(1, parseInt(s.home_services_count, 10) || 6);
  const featured = services.slice(0, featuredCount);
  const microPoints = splitLines(s.microdrama_points);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-glow absolute inset-0 -z-10" />
        <div className="bg-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />
        <div className="container-x flex flex-col items-center py-24 text-center sm:py-32 lg:py-40">
          {s.hero_badge && (
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {s.hero_badge}
              </span>
            </Reveal>
          )}
          <Reveal delay={0.1}>
            <h1 className="mt-6 max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {s.hero_title} {s.hero_highlight && <span className="gradient-text">{s.hero_highlight}</span>}
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">{s.hero_subtitle}</p>
          </Reveal>
          <Reveal delay={0.3} className="mt-9 flex flex-col gap-3 sm:flex-row">
            {s.hero_primary_label && (
              <Link href={s.hero_primary_href || "/contact"} className="btn-primary">
                {s.hero_primary_label} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {s.hero_secondary_label && (
              <Link href={s.hero_secondary_href || "/services"} className="btn-secondary">
                <Play className="h-4 w-4" /> {s.hero_secondary_label}
              </Link>
            )}
          </Reveal>

          {stats.length > 0 && (
            <Reveal delay={0.4} className="mt-16 w-full">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {stats.map((st) => (
                  <div key={st.id} className="card p-5">
                    <dt className="text-3xl font-extrabold text-white sm:text-4xl">{st.title}</dt>
                    <dd className="mt-1 text-xs font-medium uppercase tracking-wider text-white/50">{st.text}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          )}
        </div>
      </section>

      {/* Services */}
      <section className="container-x py-20 sm:py-28">
        <Reveal>
          <SectionHeading eyebrow={s.home_services_eyebrow} title={s.home_services_title} description={s.home_services_description} />
        </Reveal>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((sv, i) => (
            <Reveal key={sv.id} delay={i * 0.06}>
              <ServiceCard service={sv} />
            </Reveal>
          ))}
        </div>
        {services.length > featured.length && (
          <Reveal className="mt-10 text-center">
            <Link href="/services" className="btn-secondary">
              View all {services.length} services <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        )}
      </section>

      {/* Micro drama app */}
      {s.microdrama_title && (
        <section className="container-x py-10 sm:py-16">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-fuchsia-600/20 via-[#0d0a18] to-cyan-500/10 p-8 sm:p-12 lg:p-16">
              <div className="bg-grid absolute inset-0 -z-0 opacity-60 [mask-image:linear-gradient(to_left,black,transparent)]" />
              <div className="relative grid items-center gap-10 lg:grid-cols-2">
                <div>
                  <p className="eyebrow">{s.microdrama_eyebrow}</p>
                  <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{s.microdrama_title}</h2>
                  <p className="mt-4 text-base leading-relaxed text-white/65">{s.microdrama_description}</p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {microPoints.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm text-white/75">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-400" /> {p}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    {s.microdrama_primary_label && (
                      <Link href={s.microdrama_primary_href || "/contact"} className="btn-primary">
                        <Smartphone className="h-4 w-4" /> {s.microdrama_primary_label}
                      </Link>
                    )}
                    {s.microdrama_secondary_label && (
                      <Link href={s.microdrama_secondary_href || "/services"} className="btn-secondary">
                        <Download className="h-4 w-4" /> {s.microdrama_secondary_label}
                      </Link>
                    )}
                  </div>
                </div>

                <div className="flex justify-center lg:justify-end">
                  <div className="relative h-[420px] w-[210px] rounded-[2.2rem] border-[6px] border-white/10 bg-[#0b0b14] shadow-2xl shadow-fuchsia-900/40">
                    <div className="absolute left-1/2 top-2 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />
                    <div className="absolute inset-3 overflow-hidden rounded-[1.7rem] bg-gradient-to-b from-fuchsia-600 via-violet-700 to-[#0b0b14]">
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <span className="inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {s.microdrama_phone_badge}
                        </span>
                        <p className="mt-2 text-sm font-bold leading-tight text-white">{s.microdrama_phone_title}</p>
                        <p className="text-[11px] text-white/70">{s.microdrama_phone_subtitle}</p>
                        <div className="mt-3 h-1 w-full rounded-full bg-white/20">
                          <div className="h-1 w-2/3 rounded-full bg-white" />
                        </div>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                          <Play className="h-6 w-6 fill-white text-white" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      )}

      {/* Why us */}
      {whyUs.length > 0 && (
        <section className="container-x py-20 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-start">
            <Reveal className="lg:col-span-5">
              <SectionHeading align="left" eyebrow={s.why_eyebrow} title={s.why_title} description={s.why_description} />
              <Link href="/about" className="btn-secondary mt-8">
                About the company <ArrowRight className="h-4 w-4" />
              </Link>
            </Reveal>
            <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
              {whyUs.map((w, i) => {
                const Icon = getIcon(w.icon);
                return (
                  <Reveal key={w.id} delay={i * 0.06}>
                    <div className="card h-full p-6">
                      <Icon className="h-6 w-6 text-fuchsia-400" />
                      <h3 className="mt-4 font-semibold text-white">{w.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-white/60">{w.text}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Offices */}
      {offices.length > 0 && (
        <section className="container-x py-10 sm:py-16">
          <Reveal>
            <SectionHeading eyebrow={s.offices_eyebrow} title={s.offices_title} description={s.offices_description} />
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {offices.map((o, i) => (
              <Reveal key={o.id} delay={i * 0.08}>
                <OfficeCard office={o} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container-x py-20 sm:py-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-fuchsia-600 to-violet-700 px-8 py-14 text-center sm:px-16">
            <div className="bg-grid absolute inset-0 opacity-40" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{s.cta_title}</h2>
              <p className="mx-auto mt-4 max-w-xl text-white/85">{fillTemplate(s.cta_text, s)}</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-violet-700 transition hover:bg-white/90"
                >
                  {s.cta_primary_label} <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={whatsappLink(s)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  {s.cta_secondary_label}
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
