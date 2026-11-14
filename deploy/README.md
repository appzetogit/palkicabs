# Deployment

PALKI runs on a **shared server** (`145.223.21.188`) next to many other
projects. Everything below is scoped to PALKI alone: its own folder, port,
database, PM2 process and nginx site. Never restart nginx, PM2 as a whole, or
another project's process while deploying this one.

Live at **https://palkicabs.buytogetherindia.com**.

| What | Where |
|---|---|
| Code (git clone of `appzetogit/palkicabs`) | `/opt/palkicabs` |
| Backend process | PM2 `palkicabs-backend` → `127.0.0.1:5025` (see `Backend/ecosystem.config.cjs`) |
| Database | MongoDB `127.0.0.1:27017`, database `palkicabs_taxi` |
| Frontend | static build served from `/opt/palkicabs/frontend/dist` |
| nginx site | `nginx/palkicabs.buytogetherindia.com.conf` → `/etc/nginx/sites-available/` (symlinked into `sites-enabled`) |
| SSL | Let's Encrypt via certbot (`--nginx`), auto-renewed by `certbot.timer` |
| Secrets | `Backend/.env`, `Backend/firebase-service-account.json`, `frontend/.env.production` — on the server only, git-ignored |

The nginx file in this folder is a copy of what is installed, so a rebuilt box
can be brought back to the same state. It is **not** applied automatically.

## Deploying an update

```
cd /opt/palkicabs
git pull
cd frontend && npm ci && npm run build      # only when frontend/ changed
cd ../Backend && npm ci --omit=dev          # only when Backend/package*.json changed
pm2 restart palkicabs-backend --update-env  # only when Backend/ or .env changed
```

`--update-env` matters when `.env` has changed; without it the process keeps its
old environment.

## Why `index.html` must not be cached

`index.html` names the hashed chunks, and each build replaces them. If a browser
holds a stale `index.html`, it requests chunk filenames that no longer exist,
gets 404s, and renders a **blank page**.

The nginx config therefore splits the two:

- `location = /index.html` → `no-cache, must-revalidate`
- `location /assets/` → `public, immutable`, one year

Keep that split if the config is ever rewritten.

## nginx changes

Edit only PALKI's site file, then:

```
nginx -t && systemctl reload nginx
```

`reload`, never `restart`: a reload keeps every other site on the box serving.
