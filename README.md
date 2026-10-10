# KVSPT — Company Website + CMS

Website for KVSPT / KVSPT DIGITAL ERA LTD (Music · YouTube CMS · Digital Marketing · SEO · Artist Management · Digital Rights · Micro Drama App · Software).

Fully dynamic: every piece of public content is stored in the database and editable from the admin panel at `/admin`.

Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma (SQLite), NextAuth (credentials), TipTap rich-text editor, framer-motion and lucide-react.

## Public pages

- `/` — Home (hero, stats, services, micro drama app, why us, offices, CTA)
- `/services` — All services with anchor links (`/services#cms`, etc.)
- `/about` — Mission, vision, journey, values, offices
- `/blog` and `/blog/[slug]` — Blog list and article pages
- `/contact` — Contact form (saved as enquiries), direct contact, office maps
- `/sitemap.xml`, `/robots.txt` — generated from the database

## Admin panel (`/admin`)

- **Site Settings** — company/legal name, tagline, contact, social links, homepage/about/contact/blog copy, SEO
- **Services**, **Offices**, **Page Blocks** (stats, why-us, journey, values) — create / edit / reorder / hide
- **Blog** — rich text editor (headings, lists, links, images, alignment, HTML source), cover image, category, tags, SEO, draft/publish
- **Enquiries** — contact form submissions with read/unread and quick reply links
- **Account** — change admin name, email and password

## Development

```bash
cp .env.example .env     # then fill in NEXTAUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npm run db:setup         # creates the SQLite DB and seeds default content + admin user
npm run dev              # http://localhost:3000  (admin: http://localhost:3000/admin)
npm run lint
npm run build
```

## Environment variables

See `.env.example`.

- `DATABASE_URL` — Prisma connection string (`file:./dev.db` for SQLite)
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — NextAuth session signing and canonical URL
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — used once by `npm run db:seed` to create the first admin user
- `RESEND_API_KEY` (optional) — when set, contact enquiries are also emailed via Resend (`CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` optional)

Uploaded images are stored in `./uploads` at runtime and served from `/api/uploads/...`.

## Deploy

Use a host with a persistent filesystem (or switch `DATABASE_URL` to Postgres and change the Prisma provider) so the SQLite database and uploads survive deploys. Set the env vars above, run `npm run db:setup` once, then `npm run build && npm start`.
