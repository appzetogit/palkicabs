# Deployment

PALKI runs on its own server (`189.72.159.166`, Ubuntu) at **https://palkicabs.com**.

| What | Where |
|---|---|
| Code (git clone of `appzetogit/palkicabs`) | `/opt/palkicabs`, owned by user `palki` |
| Backend process | PM2 `palkicabs-backend` (user `palki`) -> `127.0.0.1:5025` (`Backend/ecosystem.config.cjs`) |
| Database | MongoDB Atlas (`MONGODB_URI` in `Backend/.env`) |
| Redis | local `redis-server`, bound to 127.0.0.1 |
| Frontend | static build served from `/opt/palkicabs/frontend/dist` |
| nginx site | `deploy/nginx/palkicabs.com.conf` -> `/etc/nginx/sites-available/` |
| SSL | Let's Encrypt via certbot, auto-renewed by `certbot.timer` |
| Secrets | `Backend/.env`, `frontend/.env.production` - on the server only, git-ignored |

## DNS

| Type | Host | Value |
|---|---|---|
| A | `@` | `189.72.159.166` |
| A | `www` | `189.72.159.166` |

## First-time setup (fresh server)

```
bash deploy/setup-server.sh        # as root
# copy Backend/.env and frontend/.env.production into /opt/palkicabs (chown palki)
/opt/palkicabs/deploy.sh
certbot --nginx -d palkicabs.com -d www.palkicabs.com   # once DNS points here
```

## Deploying an update

Push to `main`, then on the server:

```
/opt/palkicabs/deploy.sh
```

It pulls `origin/main`, runs the injected-code scanner (aborts if it finds
anything), builds the frontend, installs backend deps, reloads PM2 and waits for
`/health`.

## Why `index.html` must not be cached

`index.html` names the hashed chunks, and each build replaces them. A stale
`index.html` requests chunk filenames that no longer exist and renders a blank
page, so nginx serves it with `no-cache`.
