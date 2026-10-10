#!/usr/bin/env bash
# First-time + repeat deploy of mail.bainslamusic.com on 162.35.107.192 (port 3050, pm2 "mail-bainsla", nginx site "mail.bainslamusic.com")
set -euo pipefail
APP=/var/www/mail-bainsla
NEW=/var/www/mail-bainsla-new
BK=/root/backups/mail-bainsla
mkdir -p "$BK"
cd /var/www
rm -rf "$NEW"; mkdir -p "$NEW"
tar xzf /root/mail-bainsla-src.tgz -C "$NEW"
mkdir -p "$NEW/prisma" "$NEW/uploads"
if [ -f "$APP/.env" ]; then
  cp "$APP/.env" "$NEW/.env"
  [ -f "$APP/prisma/prod.db" ] && cp "$APP/prisma/prod.db" "$NEW/prisma/prod.db" && cp "$APP/prisma/prod.db" "$BK/prod-$(date +%Y%m%d-%H%M%S).db"
  [ -f "$APP/prisma/.seeded" ] && cp "$APP/prisma/.seeded" "$NEW/prisma/.seeded"
  cp -a "$APP/uploads/." "$NEW/uploads/" 2>/dev/null || true
  cp -a "$APP/node_modules" "$NEW/node_modules" 2>/dev/null || true
else
  ADMIN_PW=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
  cat > "$NEW/.env" <<ENV
DATABASE_URL="file:./prod.db"
NEXTAUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
NEXTAUTH_URL="${PUBLIC_URL:-https://mail.bainslamusic.com}"
ADMIN_EMAIL="intubemediaofficial@gmail.com"
ADMIN_PASSWORD="$ADMIN_PW"
NODE_ENV=production
PORT=3050
TZ=Asia/Kolkata
ENV
  chmod 600 "$NEW/.env"
  echo "$ADMIN_PW" > /root/mail-bainsla-admin-initial-password.txt; chmod 600 /root/mail-bainsla-admin-initial-password.txt
fi
cd "$NEW"
export NODE_OPTIONS=--max-old-space-size=1024
npm install --no-audit --no-fund
set -a; . ./.env; set +a
npx prisma generate
npx prisma db push --skip-generate
if [ ! -f "$NEW/prisma/.seeded" ]; then npx prisma db seed && touch "$NEW/prisma/.seeded"; fi
npm run build
cd /var/www
pm2 stop mail-bainsla 2>/dev/null || true
if [ -d "$APP" ]; then OLD="$BK/app-$(date +%Y%m%d-%H%M%S)"; mv "$APP" "$OLD"; rm -rf "$OLD/node_modules" "$OLD/.next"; fi
mv "$NEW" "$APP"
cd "$APP"
if pm2 describe mail-bainsla >/dev/null 2>&1; then pm2 restart mail-bainsla --update-env; else pm2 start npm --name mail-bainsla -- start -- -p 3050; fi
pm2 save
sleep 6
pm2 ls | grep mail-bainsla
curl -s -o /dev/null -w 'local %{http_code}\n' http://127.0.0.1:3050/
echo DEPLOY_DONE
