import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Service } from "@/lib/content";
import { getIcon } from "@/lib/icons";

export default function ServiceCard({ service }: { service: Service }) {
  const Icon = getIcon(service.icon);
  return (
    <Link href={`/services#${service.slug}`} className="card group flex h-full flex-col p-6">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${service.accent} text-white shadow-lg`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-5 text-lg font-semibold text-white">{service.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-white/60">{service.short}</p>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-fuchsia-400 transition group-hover:gap-2">
        Learn more <ArrowUpRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
