import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Target, Eye } from "lucide-react";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import OfficeCard from "@/components/OfficeCard";
import { getBlocks, getOffices, getServices, getSettings } from "@/lib/content";
import { getIcon } from "@/lib/icons";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return { title: "About", description: s.about_description };
}

export default async function AboutPage() {
  const [s, offices, services, journey, values] = await Promise.all([
    getSettings(),
    getOffices(),
    getServices(),
    getBlocks("journey"),
    getBlocks("values"),
  ]);

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-glow absolute inset-0 -z-10 opacity-70" />
        <div className="container-x py-20 text-center sm:py-28">
          <Reveal>
            <SectionHeading eyebrow={s.about_eyebrow} title={s.about_title} description={s.about_description} />
          </Reveal>
        </div>
      </section>

      <section className="container-x grid gap-5 md:grid-cols-2">
        <Reveal>
          <div className="card h-full p-8">
            <Target className="h-8 w-8 text-fuchsia-400" />
            <h2 className="mt-4 text-2xl font-bold text-white">{s.about_mission_title}</h2>
            <p className="mt-3 leading-relaxed text-white/65">{s.about_mission}</p>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="card h-full p-8">
            <Eye className="h-8 w-8 text-cyan-400" />
            <h2 className="mt-4 text-2xl font-bold text-white">{s.about_vision_title}</h2>
            <p className="mt-3 leading-relaxed text-white/65">{s.about_vision}</p>
          </div>
        </Reveal>
      </section>

      {journey.length > 0 && (
        <section className="container-x py-20 sm:py-28">
          <Reveal>
            <SectionHeading eyebrow="Our journey" title={s.about_journey_title} />
          </Reveal>
          <ol className="relative mx-auto mt-14 max-w-3xl border-l border-white/10 pl-8">
            {journey.map((t, i) => (
              <Reveal key={t.id} delay={i * 0.06}>
                <li className="relative pb-10 last:pb-0">
                  <span className="absolute -left-[41px] top-1 flex h-5 w-5 items-center justify-center rounded-full border border-fuchsia-500 bg-[#07070d]">
                    <span className="h-2 w-2 rounded-full bg-fuchsia-500" />
                  </span>
                  <h3 className="text-lg font-semibold text-white">{t.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/60">{t.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>
      )}

      {values.length > 0 && (
        <section className="container-x">
          <Reveal>
            <SectionHeading eyebrow="What drives us" title={s.about_values_title} />
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => {
              const Icon = getIcon(v.icon);
              return (
                <Reveal key={v.id} delay={i * 0.06}>
                  <div className="card h-full p-6">
                    <Icon className="h-6 w-6 text-fuchsia-400" />
                    <h3 className="mt-4 font-semibold text-white">{v.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">{v.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>
      )}

      <section className="container-x py-20 sm:py-28">
        <Reveal>
          <SectionHeading eyebrow="What we do" title={`${services.length} services, one team`} />
        </Reveal>
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {services.map((sv) => (
            <Link
              key={sv.id}
              href={`/services#${sv.slug}`}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75 transition hover:border-fuchsia-500 hover:text-white"
            >
              {sv.title}
            </Link>
          ))}
        </div>
      </section>

      <section className="container-x">
        <Reveal>
          <SectionHeading eyebrow="Offices" title={offices.map((o) => o.city).join(" & ")} />
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {offices.map((o, i) => (
            <Reveal key={o.id} delay={i * 0.08}>
              <OfficeCard office={o} />
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-12 text-center">
          <Link href="/contact" className="btn-primary">
            Work with us <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
