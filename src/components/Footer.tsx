import Link from "next/link";
import { Mail, Phone, MapPin } from "lucide-react";
import Logo from "./Logo";
import { YoutubeIcon, InstagramIcon, FacebookIcon, LinkedinIcon } from "./SocialIcons";
import { navLinks, type Settings } from "@/lib/defaults";
import type { Office, Service } from "@/lib/content";
import { telHref } from "@/lib/utils";

export default function Footer({ settings, offices, services }: { settings: Settings; offices: Office[]; services: Service[] }) {
  const socials = [
    { href: settings.social_youtube, Icon: YoutubeIcon, label: "YouTube" },
    { href: settings.social_instagram, Icon: InstagramIcon, label: "Instagram" },
    { href: settings.social_facebook, Icon: FacebookIcon, label: "Facebook" },
    { href: settings.social_linkedin, Icon: LinkedinIcon, label: "LinkedIn" },
  ].filter((s) => s.href);

  return (
    <footer className="mt-24 border-t border-white/10 bg-black/40">
      <div className="container-x grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Logo companyName={settings.company_name} />
          {settings.tagline && (
            <p className="mt-4 text-sm font-semibold tracking-wide text-fuchsia-300/90">{settings.tagline}</p>
          )}
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">{settings.description}</p>
          {socials.length > 0 && (
            <div className="mt-6 flex gap-3">
              {socials.map(({ href, Icon, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/70 transition hover:border-fuchsia-500 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Company</h3>
          <ul className="mt-4 space-y-2.5">
            {navLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm text-white/60 transition hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Services</h3>
          <ul className="mt-4 space-y-2.5">
            {services.map((s) => (
              <li key={s.slug}>
                <Link href={`/services#${s.slug}`} className="text-sm text-white/60 transition hover:text-white">
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white">Contact</h3>
          <ul className="mt-4 space-y-4 text-sm text-white/60">
            <li>
              <a href={`mailto:${settings.email}`} className="flex items-center gap-2.5 transition hover:text-white">
                <Mail className="h-4 w-4 shrink-0 text-fuchsia-400" /> {settings.email}
              </a>
            </li>
            <li>
              <a href={telHref(settings.phone)} className="flex items-center gap-2.5 transition hover:text-white">
                <Phone className="h-4 w-4 shrink-0 text-fuchsia-400" /> {settings.phone}
              </a>
            </li>
            {offices.map((o) => (
              <li key={o.id} className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-400" />
                <span>
                  <span className="block font-medium text-white/80">{o.label}</span>
                  {o.lineList.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-x flex flex-col items-center justify-between gap-2 py-6 text-xs text-white/50 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {settings.legal_name || settings.company_name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="transition hover:text-white">Privacy Policy</Link>
            <Link href="/terms" className="transition hover:text-white">Terms of Service</Link>
            {settings.footer_note && <span>{settings.footer_note}</span>}
          </div>
        </div>
      </div>
    </footer>
  );
}
