import { MapPin, ExternalLink } from "lucide-react";
import type { Office } from "@/lib/content";

export default function OfficeCard({ office }: { office: Office }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(office.mapQuery)}`;
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-fuchsia-500/15 text-fuchsia-400">
          <MapPin className="h-5 w-5" />
        </span>
        <div>
          <p className="eyebrow !text-[10px]">{office.label}</p>
          <h3 className="text-lg font-semibold text-white">
            {office.city}, {office.country}
          </h3>
        </div>
      </div>
      <address className="mt-4 text-sm not-italic leading-relaxed text-white/60">
        {office.lineList.map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
      </address>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-fuchsia-400 hover:text-fuchsia-300"
      >
        Open in Google Maps <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
