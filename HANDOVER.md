# KVSPT website + IntubTool — Handover / Setup Guide

This package is the complete source code of the **KVSPT company website (with admin CMS + blog)** and the built-in
**IntubTool** (lead search, email campaigns, Multi-account Send, Gmail account health) at `/intubtool`.

It contains **no data**: no `.env`, no database, no uploads. You start with a fresh database, your own admin login
and your own Gmail/Google credentials. All KVSPT-specific text (company name, offices, services, legal pages) is just
seeded content and can be changed from the admin panel after the first login.

Stack: Next.js 14 (App Router) · TypeScript · Tailwind · Prisma 5 + SQLite · NextAuth (credentials) · TipTap ·
Nodemailer / ImapFlow (Gmail SMTP+IMAP) · ExcelJS. Needs **Node.js 20 LTS** and a host with a persistent disk
(VPS). Vercel/serverless will NOT work as-is (SQLite file + background scheduler + local uploads).

---

## 1. Run locally (5 minutes)

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # fill NEXTAUTH_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:setup                 # creates prisma/dev.db + seeds default content and the admin user
npm run dev                      # http://localhost:3000  · admin: /admin/login · IntubTool: /intubtool/login
```

The admin user created from `.env` is the owner of both `/admin` (website CMS) and `/intubtool` (admin role).

## 2. Environment variables (`.env`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `file:./prod.db` (path is relative to `prisma/`) |
| `NEXTAUTH_SECRET` | yes | `openssl rand -hex 32` |
| `NEXTAUTH_URL` | yes | public URL, e.g. `https://yourdomain.com` (also the default base URL for Gmail OAuth redirect) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first seed only | used once by `prisma db seed` to create the admin |
| `PORT` | prod | e.g. `3002`; must match nginx `proxy_pass` |
| `TZ` | recommended | `Asia/Kolkata` (or your zone) — IntubTool send windows, daily limits and the 8 AM health check use server local time |
| `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` | optional | email forwarding of website contact-form enquiries |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | can instead be entered in IntubTool → Settings → Gmail |
| `SALESQL_API_KEY`, `SALESQL_WEB_TOKEN`, `LINKEDIN_LI_AT`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | optional | IntubTool lead search / enrichment / AI drafts; all can also be set in IntubTool → Settings |

## 3. Production deploy on a VPS (Ubuntu 22.04/24.04, nginx + pm2)

```bash
# once: node 20 + pm2 + nginx + certbot
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx
sudo npm i -g pm2

# app
sudo mkdir -p /root/app && cd /root/app     # or any dir; unpack the source here
npm install --no-audit --no-fund
cat > .env <<ENV
DATABASE_URL="file:./prod.db"
NEXTAUTH_SECRET="$(openssl rand -hex 32)"
NEXTAUTH_URL="https://yourdomain.com"
ADMIN_EMAIL="admin@yourdomain.com"
ADMIN_PASSWORD="choose-a-strong-password"
NODE_ENV=production
PORT=3002
TZ=Asia/Kolkata
ENV
chmod 600 .env
set -a; . ./.env; set +a
npx prisma db push && npx prisma db seed
npm run build
pm2 start npm --name app -- start -- -p 3002
pm2 save && pm2 startup           # follow the printed command so pm2 starts on reboot
```

nginx (`/etc/nginx/sites-available/app`, then symlink into `sites-enabled`, `nginx -t`, `systemctl reload nginx`,
then `certbot --nginx -d yourdomain.com -d www.yourdomain.com`):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300;
    }
}
```

Things that must survive future deploys: `.env`, `prisma/prod.db`, `uploads/` (runtime image uploads, served at
`/api/uploads/...`). `scripts/vps-deploy.sh` + `scripts/README.md` show the zero-downtime redeploy pattern used on the
original server (unpack to a new dir, copy those three things over, `prisma db push`, build, swap, `pm2 restart`) —
adapt the paths/port/process name.

Updating later: pull/unpack new code → `npm install` → `npx prisma db push` → `npm run build` → `pm2 restart app`.

## 4. After the first login

Website (`/admin`): Site Settings (name, tagline, contact, socials, SEO, GA / Search Console / Meta Pixel IDs,
WhatsApp number), Services, Offices, Page Blocks, Blog, Legal pages (Privacy / Terms / FAQ), Enquiries, Account.

IntubTool (`/intubtool`, same admin login; other people sign up at `/intubtool/signup` and the admin approves them
under Users):

1. **Google OAuth (for "Connect with Google")** — Google Cloud Console → new project → *APIs & Services → OAuth consent
   screen*: External, app name, support email, **authorized domain = your domain**, privacy `https://yourdomain.com/privacy`,
   terms `https://yourdomain.com/terms`, scope `https://mail.google.com/` → **Publish app** (otherwise refresh tokens expire
   after 7 days and only test users can connect). Then *Credentials → OAuth client ID (Web application)* with redirect URI
   `https://yourdomain.com/api/intubtool/gmail/callback`. Put Client ID + Secret in IntubTool → Settings → Gmail
   (or `.env`). Users see an "unverified app" warning until Google brand verification is done — Advanced → continue.
2. **Alternative without OAuth** — each Gmail user creates an App Password (Google Account → Security → 2-Step
   Verification → App passwords) and enters Gmail + App Password in Settings → Gmail. Both can be set; App Password is
   used automatically as a backup if OAuth fails.
3. Settings → `public_base_url` only if the app is served under a different URL than `NEXTAUTH_URL`.
4. Multi-account Send (admin only): `/intubtool/multi-send` (lists, accounts with quota + include toggle, upload
   database, content, Start) and `/intubtool/multi-send/accounts` (account health, alerts via email / CallMeBot WhatsApp,
   reconnect links, admin connect).

Gmail limits reminder: free Gmail ≈ 500 mails/day hard cap, but cold outreach from a new account is safe only at
~20–40/day; bounces > 5–10 % get the account blocked for 24 h. The tool pauses the account automatically.

## 5. Ready-made prompt for Devin (paste into a new session with this repo/zip attached)

> This zip is a Next.js 14 + Prisma/SQLite project (company website with admin CMS at /admin, plus an email outreach
> tool at /intubtool). Read HANDOVER.md first. Set it up and deploy it to my VPS `<IP>` (SSH user `<user>`, password
> or key I will give you via secure prompt) for domain `<yourdomain.com>` using pm2 + nginx + certbot as described in
> section 3, with `TZ=Asia/Kolkata`, port `<3002>`, process name `<app>`. Create the admin user with email `<me@domain>`
> and ask me for the password through a secure prompt. After it is live, verify https://<yourdomain.com>, /admin/login and
> /intubtool/login return 200, then tell me the admin URL. Do not add features; just deploy. Then help me create the
> Google OAuth client (section 4.1) and enter the Client ID/Secret in IntubTool Settings.
