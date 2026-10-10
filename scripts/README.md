# Deploying to the VPS (205.209.115.156)

kvspt runs alongside virasat (port 3000) and wahvirasat (port 3001) on the same server:

- app dir: `/root/kvspt` (`.env`, `prisma/prod.db`, `uploads/` live here and survive deploys)
- process: pm2 `kvspt` → `npm start -- -p 3002`
- nginx: `/etc/nginx/sites-enabled/kvspt` (kvspt.com, www.kvspt.com; certbot for TLS)

Deploy a new version:

```bash
git archive --format=tar.gz -o kvspt-src.tgz HEAD
scp kvspt-src.tgz scripts/vps-deploy.sh root@205.209.115.156:/root/
ssh root@205.209.115.156 'chmod +x /root/vps-deploy.sh && /root/vps-deploy.sh'
```

The script unpacks to `/root/kvspt-new`, copies `.env` / DB / uploads / node_modules from the current install,
runs `prisma db push`, builds, then swaps directories and restarts pm2. On first install it generates `.env`
(admin password written to `/root/kvspt-admin-initial-password.txt`).
