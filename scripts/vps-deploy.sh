#!/usr/bin/env bash
# First-time + repeat deploy of kvspt.com on this VPS (port 3002, pm2 "kvspt", nginx site "kvspt")
set -euo pipefail
APP=/root/kvspt
NEW=/root/kvspt-new
cd /root
rm -rf "$NEW"; mkdir -p "$NEW"
tar xzf /root/kvspt-src.tgz -C "$NEW"
mkdir -p "$NEW/prisma" "$NEW/uploads"
if [ -f "$APP/.env" ]; then
  cp "$APP/.env" "$NEW/.env"
  [ -f "$APP/prisma/prod.db" ] && cp "$APP/prisma/prod.db" "$NEW/prisma/prod.db" && cp "$APP/prisma/prod.db" "/root/kvspt-backup-$(date +%Y%m%d-%H%M%S).db"
  cp -a "$APP/uploads/." "$NEW/uploads/" 2>/dev/null || true
  cp -a "$APP/node_modules" "$NEW/node_modules" 2>/dev/null || true
else
  ADMIN_PW=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
  cat > "$NEW/.env" <<ENV
DATABASE_URL="file:./prod.db"
NEXTAUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
NEXTAUTH_URL="${PUBLIC_URL:-https://kvspt.com}"
ADMIN_EMAIL="admin@kvspt.com"
ADMIN_PASSWORD="$ADMIN_PW"
NODE_ENV=production
PORT=3002
ENV
  chmod 600 "$NEW/.env"
  echo "$ADMIN_PW" > /root/kvspt-admin-initial-password.txt; chmod 600 /root/kvspt-admin-initial-password.txt
fi
cd "$NEW"
export NODE_OPTIONS=--max-old-space-size=1024
npm install --no-audit --no-fund
set -a; . ./.env; set +a
npx prisma generate
npx prisma db push --skip-generate
if [ ! -f "$NEW/prisma/.seeded" ]; then npx prisma db seed && touch "$NEW/prisma/.seeded"; fi
npm run build
cd /root
pm2 stop kvspt 2>/dev/null || true
rm -rf /root/kvspt-old
[ -d "$APP" ] && mv "$APP" /root/kvspt-old
mv "$NEW" "$APP"
cd "$APP"
if pm2 describe kvspt >/dev/null 2>&1; then pm2 restart kvspt --update-env; else pm2 start npm --name kvspt -- start -- -p 3002; fi
pm2 save
sleep 6
pm2 ls | grep kvspt
curl -s -o /dev/null -w 'local %{http_code}\n' http://127.0.0.1:3002/
echo DEPLOY_DONE
