# Deploy LinkMarket to inonlink.com

Step-by-step for **this** setup. Every command is ready to copy.

| | |
|---|---|
| Domain | `inonlink.com` (DNS at Hostinger) |
| Server | Hetzner CX23 "relay-test", IP `142.132.173.9`, Ubuntu 24.04 |
| Already on the server | **Caddy** on ports 80/443 (another site/relay). We share it. Do **not** install Nginx. |
| Code | `https://github.com/pretty021/link-market` |
| Result | `https://inonlink.com` and `https://www.inonlink.com` |

Time: about 30 minutes.

> **Before you start:** the server downloads the code from GitHub. Make sure your latest code is **pushed**
> (on your PC: `git push`). Otherwise the server gets an old version.

---

## 1. DNS at Hostinger (already done, just check)

In Hostinger → Domains → inonlink.com → DNS records you should have:

| Type | Name | Points to | TTL |
|---|---|---|---|
| A | `@` | `142.132.173.9` | 300 |
| CNAME | `www` | `inonlink.com` | 300 |

There must be **no other** `A` record for `@` (e.g. `2.57.91.91`) and **no** `AAAA` record for `@` or `www`.
Leave the email records (`hostingermail-*`, `autodiscover`, `autoconfig`, `_dmarc`, `TXT @`) as they are.

Check from your PC (both must show `142.132.173.9`):

```bash
nslookup inonlink.com
nslookup www.inonlink.com
```

## 2. Log in and create the `deploy` user

From your PC:

```bash
ssh root@142.132.173.9
```

On the server (set a password when asked; you can press Enter for the other questions):

```bash
apt update && apt upgrade -y
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy 2>/dev/null || true
exit
```

Log in again as `deploy`. From now on, always use this:

```bash
ssh deploy@142.132.173.9
```

> Skip the firewall (ufw) step from the general README. Turning it on could block the relay already on this
> server. LinkMarket stays private anyway (`HOST=127.0.0.1` in step 6).

## 3. Install Node.js, PostgreSQL, Git and PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs postgresql git
sudo npm install -g pm2
node -v          # v22.x
```

Do **not** install `nginx` or `certbot`. Caddy does that job.

## 4. Create the database

Make a database password and **copy it somewhere safe**:

```bash
openssl rand -hex 24
```

Create the user and database. Replace `DB_PASSWORD` with that value, in the first line:

```bash
sudo -u postgres psql -c "CREATE USER linkmarket WITH PASSWORD 'DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE linkmarket OWNER linkmarket ENCODING 'UTF8' TEMPLATE template0;"
```

## 5. Download the code

```bash
cd ~
git clone https://github.com/pretty021/link-market.git
cd link-market
```

If the repository is private, Git asks for a username and password: use your GitHub username and a
**personal access token** as the password (GitHub → Settings → Developer settings → Personal access tokens →
Tokens (classic) → scope `repo`).

## 6. Settings (`.env`)

```bash
cp .env.example .env
nano .env
```

Delete everything in the file and paste this, replacing the three values in CAPITALS:

```dotenv
DATABASE_URL="postgresql://linkmarket:DB_PASSWORD@localhost:5432/linkmarket?schema=public"
ADMIN_EMAIL="YOUR_EMAIL"
ADMIN_PASSWORD="YOUR_ADMIN_PASSWORD"
PORT=3000
HOST="127.0.0.1"
```

- `DB_PASSWORD`: the password from step 4.
- `YOUR_EMAIL` / `YOUR_ADMIN_PASSWORD`: what you'll use to log in as Admin (password 8+ characters).

Save: `Ctrl+O`, `Enter`, then `Ctrl+X`. Then protect the file:

```bash
chmod 600 .env
```

### 6b. Email for sign-up codes

New buyers get a 6-digit code by email before their account is created. Without these
settings, sign-up shows "Email is not set up yet". Add them to `.env`:

```dotenv
SMTP_HOST="smtp.hostinger.com"
SMTP_PORT=587
SMTP_USER="no-reply@inonlink.com"
SMTP_PASS="MAILBOX_PASSWORD"
MAIL_FROM="inonlink <no-reply@inonlink.com>"
```

- Create the mailbox first: Hostinger → **Emails** → inonlink.com → **Create email account**
  (e.g. `no-reply@inonlink.com`). `MAILBOX_PASSWORD` is that mailbox's password.
- Let Hostinger add its email DNS records (MX, SPF, DKIM) when it offers. Without them, codes land in spam.
- Any other SMTP provider works too (Gmail with an App Password: `smtp.gmail.com`, port 587).
- Use port **587**. Hetzner blocks outgoing ports 25 and 465, so 465 hangs and then fails.

After changing `.env`: `pm2 restart linkmarket`.

## 7. Install, build and start

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
NODE_ENV=production npm run db:seed
npm run build
```

Start it and keep it running after reboots:

```bash
pm2 start npm --name linkmarket -- start
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy
```

The last command prints a line that starts with `sudo env PATH=...`. **Copy that line and run it.**

Check it works (must print `200`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login
```

## 8. Connect the domain in Caddy

First see how Caddy runs:

```bash
systemctl status caddy --no-pager | head -3
```

### A) It says `active (running)` (most likely)

Look at the existing config (don't change what's there):

```bash
sudo cat /etc/caddy/Caddyfile
```

Open it and add this block at the **very end**:

```bash
sudo nano /etc/caddy/Caddyfile
```

```caddyfile

inonlink.com, www.inonlink.com {
    request_body {
        max_size 12MB
    }
    reverse_proxy 127.0.0.1:3000
}
```

Save (`Ctrl+O`, `Enter`, `Ctrl+X`), then check and apply. The relay keeps running:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`validate` must end with **"Valid configuration"**. If it shows an error, don't reload. Fix the block or
send the error.

### B) It says `could not be found` (Caddy runs in Docker)

Find the container and its Caddyfile:

```bash
sudo docker ps --format '{{.Names}}  {{.Image}}' | grep -i caddy
```

In that case:

1. In `~/link-market/.env`, **remove** the line `HOST="127.0.0.1"`, then run `pm2 restart linkmarket`.
2. Add the same block to the container's Caddyfile, but with
   `reverse_proxy 172.17.0.1:3000` instead of `127.0.0.1:3000`.
3. Reload Caddy in the container: `sudo docker exec <container-name> caddy reload --config /etc/caddy/Caddyfile`.
4. Close port 3000 to the internet with a **Hetzner Cloud Firewall** (Hetzner console → Firewalls): allow
   inbound 22, 80, 443 and the relay's ports only.

## 9. Open the site

Go to **https://inonlink.com**. The first visit can take up to a minute while Caddy gets the HTTPS certificate.

Log in with `YOUR_EMAIL` / `YOUR_ADMIN_PASSWORD` from step 6. Then create sellers in **Admin → Clients**;
buyers sign up themselves.

You're live.

---

## Updating to a new version

Push the new code from your PC, then on the server:

```bash
ssh deploy@142.132.173.9
cd ~/link-market
git pull
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart linkmarket
```

Never skip `npx prisma migrate deploy`. It applies database changes. Skipping it causes
`column "..." does not exist` errors.

## Daily backup (recommended)

```bash
mkdir -p ~/backups
cat > ~/backup.sh <<'EOF'
#!/bin/bash
set -e
cd ~/link-market
source <(grep '^DATABASE_URL=' .env)
STAMP=$(date +%F)
pg_dump --clean --if-exists --no-owner "${DATABASE_URL%%\?*}" | gzip > ~/backups/db-$STAMP.sql.gz
tar -czf ~/backups/uploads-$STAMP.tar.gz uploads 2>/dev/null || true
find ~/backups -type f -mtime +14 -delete
EOF
chmod +x ~/backup.sh
~/backup.sh && ls -lh ~/backups
(crontab -l 2>/dev/null; echo "0 3 * * * /home/deploy/backup.sh") | crontab -
```

This saves the database and uploaded files every night at 03:00 and keeps 14 days.
Hetzner **Backups → Enable** (server page) additionally snapshots the whole server daily.

## If something goes wrong

```bash
pm2 logs linkmarket --lines 50                    # app errors
sudo journalctl -u caddy --no-pager -n 50          # Caddy / HTTPS errors
```

| Problem | Fix |
|---|---|
| Site doesn't open / certificate error | DNS not ready yet (`nslookup inonlink.com` must show `142.132.173.9`). Wait, then `sudo systemctl reload caddy`. |
| `502 Bad Gateway` | App stopped: `pm2 status`, then `pm2 restart linkmarket`. |
| Can't log in | Use `https://`, not `http://`. |
| `column "..." does not exist` | `npx prisma migrate deploy`, then `pm2 restart linkmarket`. |
| Live updates don't arrive | Reload the page. If it continues, check the Caddy block points to `127.0.0.1:3000`. |
| Relay site broke after editing Caddy | Remove the block you added, `sudo systemctl reload caddy`, and send me the Caddyfile. |
| "System restart required" on login | Run `sudo reboot` when a short break is OK. PM2 and Caddy start again by themselves. |
