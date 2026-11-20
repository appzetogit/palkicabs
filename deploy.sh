#!/usr/bin/env bash
# Deploy the latest main on the server:  /opt/palkicabs/deploy.sh
# Run as `palki` (or root - it re-runs itself as palki). Touches only PALKI.
set -euo pipefail
APP=/opt/palkicabs
cd /
[ "$(id -un)" = palki ] || exec sudo -u palki -H bash "$APP/deploy.sh" "$@"
cd "$APP"

[ -f Backend/.env ] || { echo "Backend/.env missing"; exit 1; }
[ -f frontend/.env.production ] || { echo "frontend/.env.production missing"; exit 1; }

git fetch origin main
git reset --hard origin/main
sh scripts/scan-for-injected-code.sh   # abort the deploy if injected code is present

(cd Backend && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)

cd Backend
pm2 describe palkicabs-backend >/dev/null 2>&1 \
  && pm2 reload ecosystem.config.cjs --update-env \
  || pm2 start ecosystem.config.cjs
pm2 save

for i in $(seq 1 20); do
  curl -fsS http://127.0.0.1:5025/health >/dev/null && { echo "Deployed OK"; exit 0; }
  sleep 2
done
echo "Backend did not become healthy - check: pm2 logs palkicabs-backend"; exit 1
