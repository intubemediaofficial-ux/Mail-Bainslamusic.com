import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";

export default function LegalPage({ title, html }: { title: string; html: string }) {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-glow absolute inset-0 -z-10 opacity-70" />
        <div className="container-x py-20 text-center sm:py-24">
          <Reveal>
            <SectionHeading eyebrow="Legal" title={title} />
          </Reveal>
        </div>
      </section>
      <section className="container-x pb-10">
        <div className="card mx-auto max-w-3xl p-8 sm:p-10">
          <div className="prose-blog" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </section>
    </>
  );
}
