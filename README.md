# LinkMarket

A marketplace for accounts with three roles (**Admin**, **Client** = seller, **Customer** = buyer):
live listings, a fair 5-minute hold, check review, deal chat and notifications, all updating in real time.

**Stack:** Next.js 14 · TypeScript · PostgreSQL + Prisma · Socket.IO (custom Node server) · Tailwind CSS.

- [Deploy on a VPS (production)](#deploy-on-a-vps)
- [Update to a new version](#update-to-a-new-version)
- [Backups](#backups)
- [Troubleshooting](#troubleshooting)
- [Local development](#local-development)
- [How it works (for developers)](#how-it-works-for-developers)

---

## Deploy on a VPS

This guide takes a fresh **Ubuntu 22.04 or 24.04** server to a live HTTPS site at your own domain.
It takes about 30–45 minutes. Copy each command block in order.

**You need**

- A VPS with Ubuntu, **2 GB RAM or more** (1 GB works with the swap step below), and its **IP address**.
- SSH access as `root` (your VPS provider gives you the password or key).
- A domain name (step 1).
- Access to this GitHub repository: `https://github.com/pretty021/link-market`.

**In the commands below, replace:**

| Placeholder | With |
|---|---|
| `YOUR_SERVER_IP` | your VPS IP address, e.g. `203.0.113.10` |
| `yourdomain.com` | the domain you buy, e.g. `linkmarket.shop` |
| `you@email.com` | your email (for the HTTPS certificate) |

> **Important:** logging in only works over **HTTPS**. In production the login cookie is "Secure", so the
> browser refuses it on plain `http://`. Do all the steps, including HTTPS (step 9), before you try to log in.
> To test earlier, see [Test before the domain is ready](#test-before-the-domain-is-ready).

### 1. Buy the domain and point it to your server

1. Buy a domain from any registrar (Namecheap, Cloudflare, Porkbun, GoDaddy…).
2. In the registrar's **DNS settings**, add two records:

   | Type | Host / Name | Value | TTL |
   |---|---|---|---|
   | `A` | `@` | `YOUR_SERVER_IP` | Automatic / 300 |
   | `A` | `www` | `YOUR_SERVER_IP` | Automatic / 300 |

3. Remove any default "parking" `A` or `CNAME` records for `@` and `www`.

DNS can take from a few minutes up to a few hours. Continue with the next steps meanwhile;
you only need it working at step 9. Check it any time from your own computer:

```bash
nslookup yourdomain.com
# The "Address" must be YOUR_SERVER_IP
```

### 2. First login and a safe user

On your computer:

```bash
ssh root@YOUR_SERVER_IP
```

On the server, update it and create a normal user called `deploy` (you'll be asked to set its password):

```bash
apt update && apt upgrade -y
adduser deploy
usermod -aG sudo deploy
# Let deploy log in with the same SSH key as root (skip if you use passwords):
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy 2>/dev/null || true
exit
```

From now on, log in as `deploy`:

```bash
ssh deploy@YOUR_SERVER_IP
```

### 3. Firewall

Only SSH (22) and web (80, 443) are open. The app's own port 3000 stays private.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
sudo ufw status
```

### 4. Swap (only if your VPS has less than 2 GB RAM)

Building the app needs memory. Skip this step on 2 GB+.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 5. Install Node.js, PostgreSQL, Nginx and Git

```bash
# Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL, Nginx, Git, and Certbot (HTTPS)
sudo apt install -y postgresql nginx git certbot python3-certbot-nginx

# PM2 keeps the app running and restarts it after a reboot
sudo npm install -g pm2

node -v      # should print v22.x
psql --version
```

### 6. Create the database

Generate a strong database password and **save it** (you need it in step 7):

```bash
openssl rand -hex 24
```

Create the database user and database (replace `DB_PASSWORD` with the value above):

```bash
sudo -u postgres psql -c "CREATE USER linkmarket WITH PASSWORD 'DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE linkmarket OWNER linkmarket ENCODING 'UTF8' TEMPLATE template0;"
```

### 7. Get the code and configure it

```bash
cd ~
git clone https://github.com/pretty021/link-market.git
cd link-market
```

> If the repository is **private**, Git asks for a username and password. Use your GitHub username and a
> **personal access token** as the password (GitHub → Settings → Developer settings → Personal access tokens).

Create the settings file:

```bash
cp .env.example .env
nano .env
```

Set these values, then save with `Ctrl+O`, `Enter`, and exit with `Ctrl+X`:

```dotenv
DATABASE_URL="postgresql://linkmarket:DB_PASSWORD@localhost:5432/linkmarket?schema=public"
ADMIN_EMAIL="you@email.com"
ADMIN_PASSWORD="a-strong-password-you-will-remember"
PORT=3000
HOST="127.0.0.1"
```

`HOST="127.0.0.1"` keeps port 3000 private: only Nginx/Caddy on the same server can reach it.

New buyers confirm their email with a 6-digit code, so production also needs an SMTP mailbox
(for example one created in your domain host's email panel):

```dotenv
SMTP_HOST="smtp.hostinger.com"
SMTP_PORT=587
SMTP_USER="no-reply@yourdomain.com"
SMTP_PASS="mailbox-password"
MAIL_FROM="inonlink <no-reply@yourdomain.com>"
```

Protect the file (it holds passwords):

```bash
chmod 600 .env
```

### 8. Install, set up the database, build and start

```bash
npm ci                                   # install dependencies (takes a few minutes; don't add --omit=dev)
npx prisma generate                      # prepare the database client
npx prisma migrate deploy                # create all tables
NODE_ENV=production npm run db:seed      # create your Admin account (no sample data)
npm run build                            # build the website (takes a few minutes)
```

Start it with PM2 and make it start again after a reboot:

```bash
pm2 start npm --name linkmarket -- start
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy
```

The last command prints a line starting with `sudo env PATH=...`. **Copy that line and run it.**

Check that the app answers locally:

```bash
pm2 status                                       # "linkmarket" should be "online"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login   # should print 200
```

> Run **one** instance only (as above). Do not use `pm2 start -i max` / cluster mode: live presence and rate
> limits are kept in the app's memory.

### 9. Nginx and HTTPS

Create the Nginx site (replace `yourdomain.com` in **two** places):

```bash
sudo nano /etc/nginx/sites-available/linkmarket
```

Paste:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Chat files can be up to 10 MB.
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Live updates (Socket.IO WebSockets)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 1h;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Only the real visitor IP (used for login rate limits; can't be faked by the client).
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/linkmarket /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                 # must say "syntax is ok" and "test is successful"
sudo systemctl reload nginx
```

When `nslookup yourdomain.com` shows your server IP (step 1), get the free HTTPS certificate:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -m you@email.com --agree-tos --redirect -n
```

Certbot renews the certificate automatically. Check renewal works:

```bash
sudo certbot renew --dry-run
```

### 9b. If your server already runs Caddy (use this instead of step 9)

Check what already uses the web ports:

```bash
sudo ss -tlnp | grep -E ':80 |:443 '
```

If it shows **`caddy`**, another site already uses this server. **Don't install or start Nginx** (it would
fight Caddy for ports 80/443). Add LinkMarket to Caddy instead. Caddy gets the HTTPS certificate automatically,
so you don't need certbot, and it handles live updates (WebSockets) and the real visitor IP on its own.

1. Find the Caddy config:

   ```bash
   systemctl status caddy --no-pager | head -5     # "active (running)" = Caddy is a system service
   sudo cat /etc/caddy/Caddyfile                    # the existing sites
   ```

2. Add this block at the **end** of `/etc/caddy/Caddyfile` (keep everything already there):

   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```

   ```caddyfile
   yourdomain.com, www.yourdomain.com {
       request_body {
           max_size 12MB
       }
       reverse_proxy 127.0.0.1:3000
   }
   ```

3. Check and apply it (the other sites keep running):

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

4. Once DNS points to the server, open `https://yourdomain.com`. The first visit can take ~30 seconds while
   Caddy gets the certificate. If it fails, see `sudo journalctl -u caddy --no-pager -n 50`.

If Caddy runs in Docker instead (`systemctl status caddy` says "could not be found"), its config lives in that
container's Caddyfile; add the same block there and make sure the container can reach the host's port 3000.

### 10. Open your site

Go to **https://yourdomain.com**, click **Log in**, and use the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

Then:

1. Open **Profile** and change the Admin password if you like.
2. Create Client (seller) accounts from **Admin → Clients**. Customers (buyers) sign up themselves.
3. Remove `ADMIN_PASSWORD` from `.env` if you want (it's only used by the seed): `nano ~/link-market/.env`.

You're live.

### Test before the domain is ready

You can use the app before DNS and HTTPS are ready through an SSH tunnel (browsers allow the secure
login cookie on `localhost`). On **your computer**:

```bash
ssh -L 3000:127.0.0.1:3000 deploy@YOUR_SERVER_IP
```

Keep that window open and visit **http://localhost:3000** in your browser.

---

## Update to a new version

After new code is pushed to GitHub, on the server:

```bash
cd ~/link-market
git pull
npm ci
npx prisma generate
npx prisma migrate deploy      # applies any new database changes; never skip this
npm run build
pm2 restart linkmarket
```

Uploaded files (`uploads/`) and `.env` are not in Git, so updates never touch them.

## Backups

Everything important is the **database** and the **uploads** folder. This saves both every night at 03:00
and keeps 14 days.

```bash
mkdir -p ~/backups
nano ~/backup.sh
```

Paste:

```bash
#!/bin/bash
set -e
cd ~/link-market
source <(grep '^DATABASE_URL=' .env)
STAMP=$(date +%F)
pg_dump --clean --if-exists --no-owner "${DATABASE_URL%%\?*}" | gzip > ~/backups/db-$STAMP.sql.gz
tar -czf ~/backups/uploads-$STAMP.tar.gz uploads 2>/dev/null || true
find ~/backups -type f -mtime +14 -delete
```

Then:

```bash
chmod +x ~/backup.sh
~/backup.sh && ls -lh ~/backups          # test it once
(crontab -l 2>/dev/null; echo "0 3 * * * /home/deploy/backup.sh") | crontab -
```

Copy backups off the server from time to time (e.g. `scp deploy@YOUR_SERVER_IP:~/backups/* .`).

**Restore** a backup (replace the date with the file you want). This replaces the current data:

```bash
pm2 stop linkmarket
cd ~/link-market
source <(grep '^DATABASE_URL=' .env)
gunzip -c ~/backups/db-2026-01-31.sql.gz | psql "${DATABASE_URL%%\?*}"
tar -xzf ~/backups/uploads-2026-01-31.tar.gz -C ~/link-market
pm2 start linkmarket
```

## Troubleshooting

See what the app is doing:

```bash
pm2 logs linkmarket --lines 100
```

| Problem | Fix |
|---|---|
| **Can't log in**, or logged out right away | You must use **https://**. Finish step 9, or use the [SSH tunnel](#test-before-the-domain-is-ready). |
| `502 Bad Gateway` | The app isn't running. Run `pm2 status`, then `pm2 logs linkmarket`. Start it with `pm2 restart linkmarket`. |
| Error `column "..." does not exist` | A database update wasn't applied. Run `npx prisma migrate deploy`, then `pm2 restart linkmarket`. |
| Live updates don't arrive / the dot in the header is yellow | Nginx is missing the WebSocket lines. Compare with step 9, then `sudo nginx -t && sudo systemctl reload nginx`. |
| `413 Request Entity Too Large` on upload | `client_max_body_size 12m;` is missing in the Nginx site. |
| `npm run build` stops with "Killed" | Not enough memory. Do [step 4 (swap)](#4-swap-only-if-your-vps-has-less-than-2-gb-ram). |
| Certbot fails | DNS isn't pointing to the server yet. Check `nslookup yourdomain.com`, wait, and run certbot again. |
| Changes not visible after `git pull` | You must `npm run build` and `pm2 restart linkmarket`. |
| Forgot the Admin password | Set a new `ADMIN_PASSWORD` **and a new `ADMIN_EMAIL`** in `.env`, run `NODE_ENV=production npm run db:seed` to create a second Admin, log in with it. |

Useful commands:

```bash
pm2 status                         # is it running?
pm2 restart linkmarket             # restart the app
sudo systemctl status nginx        # is Nginx running?
sudo systemctl status postgresql   # is the database running?
df -h                              # free disk space
```

---

## Local development

Requirements: Node.js 20+ and PostgreSQL 14+ (UTF8 database).

```bash
cp .env.example .env              # set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed                   # Admin + sample data
npm run dev                       # http://localhost:3000
```

Sample accounts (development seed only; password `password123`):

| Role | Email |
|---|---|
| Admin | `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` |
| Client | `client@example.com`, `client2@example.com` |
| Customer | `customer@example.com` (cart limit 2), `customer2@example.com`, `customer3@example.com` |

To run a second dev server next to the first, give it its own build folder so they don't clash:
`PORT=3001 NEXT_DIST_DIR=.next-2 npm run dev`.

### Tests

Tests use a **real, disposable PostgreSQL database** (every table is emptied).

```bash
DATABASE_URL="postgresql://.../linkmarket_test" npx prisma migrate deploy   # once
TEST_DATABASE_URL="postgresql://.../linkmarket_test" npm test
```

They cover: 50 Customers confirming one post at once (exactly one wins), Checked vs. expiry at the deadline,
the full post lifecycle, login and blocking, cart limits, role-based counts, check and chat visibility,
chat notifications, cancel hold and chat files.

---

## How it works (for developers)

### Folder structure

```
prisma/
  schema.prisma            database schema
  migrations/              SQL migrations (incl. CHECK constraints)
  seed.ts                  first Admin from .env; sample data in development
src/
  server/
    index.ts               custom server: Next.js + Socket.IO + 5s expiry worker + /uploads
    outbox.ts              socket events, sent only after the database transaction commits
    services/              all business logic (API routes and tests call the same functions)
  app/
    api/**/route.ts        REST handlers: auth + Zod validation + a service call
    (auth)/                login, register
    (app)/                 admin, client, customer (feed, cart), chat, profile
    page.tsx               landing page
  components/              app shell, chat, notifications, list toolbar, UI primitives
  lib/                     auth, http helpers, validation, realtime, storage, browser helpers
tests/                     Vitest suites against a real database
```

### Fair holds under heavy traffic

- **Confirm** is one conditional `UPDATE ... WHERE status='PUBLISHED' AND "holderId" IS NULL ...`.
  When many buyers click at once, PostgreSQL lets exactly one row update win; the rest get HTTP 409.
- **Checked** requires the deadline not to have passed; **expiry** requires that it has. Only one can succeed.
- Messages, notifications and status side effects happen in the same transaction, only for the winner.
- Database CHECK constraints reject inconsistent rows even if code had a bug.
- All time comes from the database clock; every response carries `serverNow` so countdowns are accurate.
- Expired holds are released on every read and by a background worker every 5 seconds.

### Realtime

Sockets log in with the session cookie and join rooms per user, role, post and conversation.
Pages update live (`post:*`, `cart:updated`, `message:new`, `notification:new`, …) and re-fetch after a reconnect.
