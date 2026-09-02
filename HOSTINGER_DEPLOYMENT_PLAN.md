# Hostinger Deployment Plan — PrepQ Analytics

**Status: PLAN ONLY.** Nothing in this document has been applied to the repo or any server yet. The frontend Dockerfile, the added `web` service in `docker-compose.yml`, and the nginx config shown below are all *proposed* file contents to review — none of them exist in the repo yet except where explicitly noted as "already exists."

This plan covers deploying both halves of PrepQ Analytics — the Fastify backend (`backend/`) and the Next.js frontend (`frontend/`) — as two independently-running Node processes on a single Hostinger VPS.

---

## 1. Why one VPS, two containers

Hostinger's **shared hosting** plans can't run this app: both the backend (Fastify, long-running, an in-process `node-cron` scheduler ticking every minute) and the frontend (Next.js with server-side rendering and auth, not a static export) need a persistent Node process listening on a port, which shared hosting doesn't provide.

The backend already has a working, documented deployment to a **Hostinger VPS** using Docker (`backend/DEPLOYMENT.md`, `backend/Dockerfile`, `backend/docker-compose.yml`). This plan extends that exact same pattern to the frontend rather than introducing a second hosting product or provider — one VPS, two Docker containers, one nginx reverse proxy in front of both.

```
                              Hostinger VPS
                    ┌───────────────────────────────────────────┐
                    │                                             │
   Browser  ──443──▶│  nginx                                      │
                    │   app.yourdomain.com  ──▶  127.0.0.1:3000    │
                    │   api.yourdomain.com  ──▶  127.0.0.1:8080    │
                    │   (TLS via Let's Encrypt / certbot)          │
                    │                                             │
                    │   ┌─────────────────┐   ┌─────────────────┐ │
                    │   │ web (Docker)     │   │ api (Docker)     │ │
                    │   │ Next.js :3000    │   │ Fastify :8080    │ │
                    │   │ next start       │   │ node-cron         │ │
                    │   │                  │   │  scheduler runs  │ │
                    │   │                  │   │  in this process │ │
                    │   └─────────────────┘   └─────────────────┘ │
                    │                                             │
                    └───────────────────────────────────────────┘
                                        │
                                        ▼
                          Supabase (external, managed —
                          not hosted on this VPS)
```

Both containers restart automatically on crash or VPS reboot (`restart: unless-stopped`), and both get a Docker `HEALTHCHECK` that Hostinger's panel and `docker compose ps` can read directly.

---

## 2. Prerequisites

- **A Hostinger VPS** (KVM plan) with root/sudo SSH access. If the backend is already deployed per `backend/DEPLOYMENT.md`, this is the same VPS — no new server needed.
  - Sizing: the backend alone already does real work (Meritto's full-history backfill sync took ~20 minutes of sustained CPU/network this session). Adding a second Node process for the frontend is comparatively light (mostly SSR rendering + proxying API calls), but as a floor, a plan with **2 vCPU / 4GB RAM or higher** is recommended so a heavy backend sync doesn't starve the frontend. Scale up if you see OOM kills in `docker stats`.
- **A domain you control**, with the ability to add DNS records (Hostinger's own DNS zone, or any registrar).
- **Docker + Docker Compose** on the VPS — already required by the existing backend deployment (`curl -fsSL https://get.docker.com | sh`).
- **Supabase project** — already provisioned and connected (no change needed here; both frontend and backend point at the same project).
- Production values for every environment variable listed in §6 and §7 below, gathered *before* you start (you cannot build the frontend image correctly without its `NEXT_PUBLIC_*` values ready — see the callout in §7).

---

## 3. DNS setup

Add two `A` records at your DNS provider, both pointing at the VPS's public IPv4 address:

| Type | Host | Value | Purpose |
|---|---|---|---|
| A | `app` (→ `app.yourdomain.com`) | `<VPS_IP>` | Frontend |
| A | `api` (→ `api.yourdomain.com`) | `<VPS_IP>` | Backend API |

Propagation is usually minutes but can take longer depending on your registrar's TTL. Verify with `dig app.yourdomain.com` / `dig api.yourdomain.com` from your own machine before moving on to TLS issuance in §8 — certbot's HTTP-01 challenge will fail until DNS resolves correctly.

---

## 4. One-time VPS setup

```bash
# On the VPS, as a sudo-capable user
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in for the group change to take effect

# nginx + certbot for the reverse proxy and TLS certificates
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# basic firewall: allow SSH, HTTP, HTTPS only
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

If the backend is already deployed, Docker is already installed — skip that part and just add nginx/certbot/ufw if they aren't already present.

---

## 5. Directory layout on the VPS

```
/opt/prepq-analytics-backend/    # existing — see backend/DEPLOYMENT.md
/opt/prepq-analytics-frontend/   # new — this plan
```

Two separate directories, two separate `git pull` / `scp` targets, so either service can be redeployed independently without touching the other.

---

## 6. Backend — what changes vs. what's already documented

The backend's deployment itself is **unchanged** from `backend/DEPLOYMENT.md` §4 — same Dockerfile, same `docker compose up -d --build`. Two things need attention specifically because the frontend is now joining it on the same VPS:

1. **`CORS_ALLOWED_ORIGINS`** in the backend's production `.env` must include the frontend's real public origin:
   ```
   CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
   ```
2. **Stale comment cleanup** (pre-existing, unrelated to this plan, but worth fixing while touching this file): `backend/docker-compose.yml`'s trailing comment and `backend/ENVIRONMENT.md`'s "Trigger.dev" section both still reference Trigger.dev, which was removed from this codebase (replaced with the in-process `node-cron` scheduler). Not a functional problem — `.env.example` and `src/config/env.ts` are already correct — just misleading documentation left over from the migration. Flagging here so it isn't mistaken for something this plan introduced; can be cleaned up in a small separate change whenever convenient.

Full backend env var reference: `backend/ENVIRONMENT.md` (ignore its Trigger.dev section per the note above).

---

## 7. Frontend — new Dockerfile

No `frontend/Dockerfile` exists yet. Proposed content, matching the backend's existing multi-stage style (`backend/Dockerfile`) so both images follow the same conventions:

```dockerfile
# syntax=docker/dockerfile:1

# ---- deps: install all dependencies (incl. dev) for the build stage -------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build: compile Next.js (NEXT_PUBLIC_* vars must be present here) -----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Passed as build args so they're baked into the client bundle at build time -
# see the callout below on why this can't just be an env_file at runtime.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# ---- prod-deps: install production-only dependencies -----------------------
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ---- runtime: minimal final image ------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json next.config.mjs ./

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
```

> Confirmed against the repo: it's `next.config.mjs` (already what's used above).

### The build-time env var gotcha (important)

Next.js inlines every `NEXT_PUBLIC_*` variable into the client-side JavaScript bundle **at `next build` time** — not read fresh at container startup like the backend's `.env` is. This means:

- Setting `NEXT_PUBLIC_API_BASE_URL` in a runtime `env_file`/`environment:` block (the way the backend's `docker-compose.yml` does it) **will not work** for the frontend — the value would only reach `next start`'s server process, not the already-compiled browser bundle.
- The correct values must be passed as Docker **build args** (`--build-arg`), as shown in the Dockerfile above, so they exist during `RUN npm run build`.
- If you ever need to change `NEXT_PUBLIC_API_BASE_URL` (e.g. swapping the backend's domain), the frontend image must be **rebuilt**, not just restarted.

### Frontend production env values

| Variable | Production value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Same Supabase project URL the backend uses |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same Supabase anon key the backend uses |
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.yourdomain.com` (the backend's public HTTPS URL — **not** `localhost:8080`) |

---

## 8. Combined `docker-compose.yml`

Proposed: add a `web` service alongside the existing `api` service, either in the backend's existing compose file or a new one in the frontend directory — either works since both are on the same Docker host and can be reached by nginx via `127.0.0.1:<port>` regardless of which compose project manages them. Keeping them as **two separate compose files** (one per directory, matching §5's layout) is recommended so redeploying one never risks touching the other:

**`/opt/prepq-analytics-frontend/docker-compose.yml`** (new):
```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_BASE_URL: https://api.yourdomain.com
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    image: prepq-analytics-frontend:latest
    container_name: prepq-analytics-web
    restart: unless-stopped
    ports:
      - '3000:3000'
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
```

Build args reading from `${...}` pull from a `.env` file sitting next to this compose file (Docker Compose auto-loads it) — put `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` there rather than committing them into the compose file itself, same secret-handling convention the backend already follows.

The existing **`backend/docker-compose.yml` needs no structural change** — just the `CORS_ALLOWED_ORIGINS` update mentioned in §6, and its stale Trigger.dev comment.

---

## 9. nginx reverse proxy + TLS

Two server blocks, one per subdomain. Proposed `/etc/nginx/sites-available/prepq`:

```nginx
server {
    listen 80;
    server_name app.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/prepq /etc/nginx/sites-enabled/prepq
sudo nginx -t
sudo systemctl reload nginx

# Issue certificates and auto-configure the HTTPS server blocks (run once DNS in §3 has propagated)
sudo certbot --nginx -d app.yourdomain.com -d api.yourdomain.com
```

Certbot rewrites the config in place to add `listen 443 ssl;`, the certificate paths, and an HTTP→HTTPS redirect for both server blocks, and installs a systemd timer that auto-renews before the 90-day expiry — no further action needed for renewal.

The backend already sets `trustProxy: true` (`backend/src/app.ts`), so `X-Forwarded-*` headers from this nginx layer are honored correctly for client IPs (rate limiting) and scheme detection — nothing to change there.

---

## 10. First deploy — step by step

```bash
# --- Backend (if not already deployed) ---
scp -r backend/ user@vps:/opt/prepq-analytics-backend
ssh user@vps
cd /opt/prepq-analytics-backend
cp .env.example .env
nano .env   # fill production SUPABASE_*, INTEGRATION_CREDENTIALS_ENC_KEY, provider creds,
            # and CORS_ALLOWED_ORIGINS=https://app.yourdomain.com
docker compose up -d --build
curl http://localhost:8080/health

# --- Frontend (new) ---
scp -r frontend/ user@vps:/opt/prepq-analytics-frontend
ssh user@vps
cd /opt/prepq-analytics-frontend
cat > .env <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=<same as backend>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<same as backend>
EOF
docker compose up -d --build
curl http://localhost:3000

# --- nginx + TLS (§9) ---
sudo certbot --nginx -d app.yourdomain.com -d api.yourdomain.com

# --- End-to-end check ---
# Open https://app.yourdomain.com in a browser, log in, confirm the dashboard
# loads real data with no CORS errors in the browser console.
```

---

## 11. Updating a live deployment

Same pattern for both services, run independently:

```bash
# Backend
cd /opt/prepq-analytics-backend
git pull   # or re-scp
docker compose up -d --build
docker compose logs -f api

# Frontend
cd /opt/prepq-analytics-frontend
git pull   # or re-scp
docker compose up -d --build
docker compose logs -f web
```

Each container's Docker `HEALTHCHECK` means `docker compose ps` shows `healthy`/`unhealthy` directly after a redeploy — check that before considering the deploy done.

---

## 12. Rollback

```bash
# Whichever service needs rolling back:
cd /opt/prepq-analytics-<backend|frontend>
docker compose down
git checkout <previous-tag-or-commit>
docker compose up -d --build
```

No database migration rollback tooling exists (by design — see `backend/DEPLOYMENT.md` §4's note on additive-only migrations), so a rollback here only ever reverts application code, never schema.

---

## 13. Verification checklist

- [ ] `curl https://api.yourdomain.com/health` → `{"status":"ok",...}`
- [ ] `https://app.yourdomain.com` loads over HTTPS with a valid certificate (no browser warning)
- [ ] Login via Supabase auth succeeds end-to-end
- [ ] Dashboard renders real data (Overview page's numbers match what you'd expect) — confirms the frontend's `NEXT_PUBLIC_API_BASE_URL` actually points at the right backend and CORS is configured correctly
- [ ] Browser console shows no CORS or mixed-content errors
- [ ] `docker compose ps` in both directories shows `healthy` for both containers
- [ ] From the VPS: `docker compose logs api` shows the scheduler starting (`"Sync scheduler started (in-process, 1-minute tick)"`)
- [ ] A manual "Sync now" from the dashboard succeeds (exercises frontend → nginx → backend → Supabase → external provider APIs, end to end)

---

## 14. Ongoing operations

- **Logs**: both containers use the `json-file` driver capped at `10m × 3` files — bounded disk usage, no separate log-rotation setup needed.
- **Secrets backup**: `INTEGRATION_CREDENTIALS_ENC_KEY` (backend) is the single most important secret to back up outside the VPS — losing it makes every stored integration credential permanently undecryptable, with no recovery path. Store both `.env` files in a password manager or secrets vault, not just on the VPS disk.
- **Disk space**: `docker image prune` periodically — each `--build` leaves the previous image layer behind until pruned; on a small VPS this can accumulate.
- **Certificate renewal**: automatic via certbot's systemd timer (`systemctl list-timers | grep certbot` to confirm it's active).
- **Monitoring**: nothing beyond Docker's own `HEALTHCHECK` is set up in this plan. If uptime monitoring is wanted, point an external checker (UptimeRobot, Hostinger's own monitoring if available on the plan) at `https://api.yourdomain.com/health` and `https://app.yourdomain.com`.

---

## 15. Open items before this plan can be executed

1. Decide: single combined `docker-compose.yml` vs. two separate ones (§8 recommends separate — confirm that's acceptable).
2. Gather the real domain name to replace every `yourdomain.com` placeholder in this document.
3. Confirm current VPS plan/specs to validate the sizing note in §2, or decide whether to upgrade.
4. (Optional, unrelated to this plan but noticed along the way) Clean up the stale Trigger.dev references in `backend/docker-compose.yml`'s comment and `backend/ENVIRONMENT.md` — cosmetic only, not blocking.
