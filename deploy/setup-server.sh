#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu server for PALKI. Run as root:
#   bash setup-server.sh
# Safe to re-run. Installs nginx, Node 22, PM2, Redis, certbot, firewall,
# creates the unprivileged `palki` user and clones the repo to /opt/palkicabs.
set -euo pipefail
REPO=https://github.com/appzetogit/palkicabs.git
APP=/opt/palkicabs
DOMAIN=palkicabs.com

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx redis-server certbot python3-certbot-nginx git curl ufw ca-certificates
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
npm i -g pm2

id palki >/dev/null 2>&1 || useradd -m -s /bin/bash palki
[ -d "$APP/.git" ] || git clone "$REPO" "$APP"
chown -R palki:palki "$APP"

# redis: local only
sed -i 's/^bind .*/bind 127.0.0.1 -::1/' /etc/redis/redis.conf
systemctl enable --now redis-server

# nginx site
cp "$APP/deploy/nginx/$DOMAIN.conf" "/etc/nginx/sites-available/$DOMAIN.conf"
ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl enable --now nginx && systemctl reload nginx

# firewall
ufw allow OpenSSH; ufw allow 'Nginx Full'; ufw --force enable

# PM2 on boot, as palki
env PATH="$PATH:/usr/bin" pm2 startup systemd -u palki --hp /home/palki >/dev/null
echo "Setup done. Next: put Backend/.env and frontend/.env.production in $APP, then run $APP/deploy.sh"
echo "After DNS points here:  certbot --nginx -d $DOMAIN -d www.$DOMAIN"
