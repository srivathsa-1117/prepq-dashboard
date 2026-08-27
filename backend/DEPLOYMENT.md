# Deployment & Operations Runbook

Two independent deployments make up this backend:

1. **The Fastify API** - runs in Docker on a Hostinger VPS (this doc, §4).
2. **The Trigger.dev scheduled sync tasks** - deployed to Trigger.dev's infrastructure via their CLI (§5). It is a separate deploy step, not part of the Docker image - Trigger.dev hosts and schedules the sync jobs itself.

Both talk to the same Supabase Postgres database.

---

## 1. Database setup

**This backend is already connected to a live, already-migrated Supabase project** - the schema it targets isn't the files under `supabase/migrations/` in this repo (those are an earlier, superseded design; see `supabase/migrations/SUPERSEDED.md`). Nothing in §1 needs to run against that project.

Four small additive migrations this backend specifically needed were already applied directly to it:
- `backend_credentials_bridge_functions` (+ its `_v2` follow-up) - `get_integration_credentials` / `upsert_integration_credentials` / `clear_integration_credentials`
- `backend_date_ranged_reporting_functions` (+ a null-handling fix) - `fn_campaign_performance_range` / `fn_creative_performance_range` / `fn_source_performance_range`
- `lead_status_rules` - the client-configurable disposition-mapping table
- `sync_jobs_metadata_column` - cron/timezone/Trigger.dev-schedule-id storage

### Standing up a *new* deployment against a different Supabase project

If you're cloning this backend for a different agency/organization on a fresh Supabase project, there is no schema file in this repo to apply - **pull the real DDL from the connected project first** (`supabase db pull` against it, or the Supabase MCP tools' `list_tables`/`execute_sql` for `pg_get_viewdef`/`pg_get_functiondef` dumps), then apply that to the new project, then replay the four migrations listed above (their SQL is in this doc's git history / the Supabase dashboard's migration log for the original project). This is real, non-trivial setup work - there is currently no single "run this to provision a fresh project" script.

Regenerate `src/types/database.ts` from whichever project you're pointed at (this repo's copy is a snapshot, not live-linked):
```bash
supabase gen types typescript --project-id <ref> > src/types/database.ts
```
Note: `secrets.integration_credentials` lives outside the exposed schema and won't appear in this output - the three bridge functions above are what `src/repositories/integrationsRepo.ts` actually calls.

### Seeding the first organization/client

There's no seed script - create the first organization and client through the API once you have an authenticated user (see §6). The connected project already has a `create_organization_with_owner(p_name, p_slug)` RPC function (`SECURITY DEFINER`, inserts the organization and makes the calling `auth.uid()` its `owner` in one call) - this backend doesn't currently expose a route for it, so bootstrap the very first organization directly via Supabase:
```bash
# 1. Sign in via the frontend (Google OAuth) to get a Supabase session token
# 2. Call the RPC as that authenticated user (e.g. via supabase-js with the user's
#    access token, or curl against PostgREST with an Authorization: Bearer header) -
#    NOT via psql/service-role, since it relies on auth.uid() from the JWT:
curl -X POST "$SUPABASE_URL/rest/v1/rpc/create_organization_with_owner" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer <user-access-token>" \
  -H "content-type: application/json" \
  -d '{"p_name":"Agency Name","p_slug":"agency-slug"}'
# 3. From here on, use POST /api/clients as that user - see API.md
```

---

## 2. Configure environment variables

See `ENVIRONMENT.md` for the full reference. Minimum to boot the API server:
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
INTEGRATION_CREDENTIALS_ENC_KEY=
```
Provider credentials (`META_*`, `GOOGLE_ADS_*`, `MERITTO_*`) are only needed once you actually connect that provider for a client - the server starts fine without them.

---

## 3. Run locally

```bash
npm install
cp .env.example .env   # fill in required vars
npm run dev             # Fastify API on :8080, hot reload via tsx
npm run trigger:dev     # separate terminal - local Trigger.dev dev server for scheduled/manual sync tasks
npm test                # 76 tests, no live credentials required
```

---

## 4. Deploy the API to a Hostinger VPS

### One-time server setup
```bash
# On the VPS
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out/in after this
```

### Deploy
```bash
# From your machine, or a CI runner with SSH access to the VPS:
scp -r backend/ user@your-vps:/opt/prepq-analytics-backend
ssh user@your-vps
cd /opt/prepq-analytics-backend

# Configure production secrets (never commit this file)
cp .env.example .env
nano .env   # fill in production SUPABASE_*, INTEGRATION_CREDENTIALS_ENC_KEY, META_*/GOOGLE_ADS_*/MERITTO_* etc.

# Build and run
docker compose up -d --build

# Verify
curl http://localhost:8080/health
docker compose logs -f api
```

### Reverse proxy + TLS
Put the container behind nginx (or Hostinger's built-in reverse proxy) terminating TLS, proxying to `127.0.0.1:8080`. Set `CORS_ALLOWED_ORIGINS` to your deployed frontend's `https://` origin. `trustProxy: true` is already set in `src/app.ts` so `X-Forwarded-*` headers from the proxy are honored (correct client IPs for rate limiting).

### Updating a deployment
```bash
cd /opt/prepq-analytics-backend
git pull   # or re-scp the updated source
docker compose up -d --build
```
The container has a Docker `HEALTHCHECK` (`GET /health` every 30s) - `docker compose ps` shows `healthy`/`unhealthy` directly, and most orchestration (including Hostinger's own panel, if used) can restart on failure automatically.

### Rolling back
```bash
docker compose down
git checkout <previous-tag-or-commit>
docker compose up -d --build
```
There's no database migration rollback tooling here (matching the "keep it purpose-built, not a generic framework" scope) - migrations are additive by convention; a genuinely destructive schema change should ship as a new migration that handles both old and new shapes during the transition, not a `down` script.

---

## 5. Deploy Trigger.dev scheduled sync tasks

```bash
# One-time: create/link a Trigger.dev project at https://cloud.trigger.dev
npx trigger.dev@latest login

# Deploy the tasks in src/scheduler/tasks/
npm run trigger:deploy
```

This uploads `meta-sync`, `google-ads-sync`, `meritto-sync` and their `*-scheduled` counterparts to Trigger.dev's infrastructure. Trigger.dev needs network access to Supabase (to read `integrations`/`integration_accounts`, call the credential bridge functions, and write sync results) and to Meta/Google/Meritto's APIs - no inbound access to your VPS is required, since the tasks call out, they aren't called into.

Set the same `SUPABASE_*`, `INTEGRATION_CREDENTIALS_ENC_KEY`, and provider credential env vars in the Trigger.dev project's environment variables (Project → Environment Variables in the dashboard, or `syncEnvVars` in `trigger.config.ts` if you prefer to source them from your own secret manager at deploy time).

**Schedules are NOT created by deploying tasks** - they're created per-client via `scheduler/registerSchedules.ts`, which runs from the API server (triggered by `POST /api/clients` on client creation, or `PATCH /api/sync/:provider/schedule`). Deploy the API server and register at least one client before expecting any scheduled runs to fire.

---

## 6. Connect Meta

1. Frontend redirects the user through Meta's OAuth dialog (`https://www.facebook.com/v20.0/dialog/oauth?client_id=<META_APP_ID>&redirect_uri=<META_OAUTH_REDIRECT_URI>&scope=ads_read`).
2. Meta redirects back to your frontend with `?code=...`.
3. Frontend calls:
   ```bash
   curl -X POST https://your-api/api/integrations/meta/connect \
     -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
     -d '{"client_id":"<uuid>","authorization_code":"<code from step 2>"}'
   # -> { "integration": { "status": "pending_account_selection", ... } }
   ```
4. Frontend calls `GET /api/integrations/meta/accounts?client_id=<uuid>` to list ad accounts, then finalizes:
   ```bash
   curl -X POST https://your-api/api/integrations/meta/connect \
     -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
     -d '{"client_id":"<uuid>","external_account_id":"act_123","external_account_name":"PrepQ Main"}'
   # -> { "integration": { "status": "connected", ... } }
   ```

## 7. Connect Google Ads

Same two-step shape as Meta, using `GOOGLE_ADS_OAUTH_REDIRECT_URI` and scope `https://www.googleapis.com/auth/adwords`, with `access_type=offline&prompt=consent` in the OAuth URL (required to receive a refresh token). Endpoint: `/api/integrations/google_ads/connect`, account id is the Google Ads customer id (digits only, no dashes).

## 8. Connect Meritto

Single step - no OAuth dance, Meritto uses an API key/secret pair:
```bash
curl -X POST https://your-api/api/integrations/meritto/connect \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"client_id":"<uuid>","api_key":"...","api_secret":"..."}'
```
This performs a live test call before saving credentials - a wrong key/secret fails the request immediately with `INTEGRATION_ERROR` rather than saving a broken connection. **Before this will work in production**, `MERITTO_API_BASE_URL` and the actual auth header scheme in `src/integrations/meritto/merittoClient.ts` must be confirmed against Meritto's account-specific developer portal access - see the `TODO(meritto)` comments there and in `ENVIRONMENT.md`.

## 9. Run a manual sync

```bash
curl -X POST https://your-api/api/sync/meta/run \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"client_id":"<uuid>"}'
# -> 202 { "triggerRunId": "..." }
```
Poll `GET /api/sync/status?client_id=<uuid>&provider=meta` until `lastRun.status` is no longer `running`.

## 10. Schedule the morning sync

Registered automatically with defaults (06:00/06:10/06:20) when a client is created. To change a client's time:
```bash
curl -X PATCH https://your-api/api/sync/meta/schedule \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"cron_expression":"0 6 * * *","timezone":"Asia/Kolkata","enabled":true}'
```
Repeat per provider (`meta`, `google_ads`, `meritto`) with staggered times.

## 11. Inspect failures

1. `GET /api/sync/status?client_id=<uuid>` - shows `lastFailed` per provider with `errorMessage`.
2. Trigger.dev dashboard (cloud.trigger.dev → your project → Runs) - full execution logs for the underlying task run, correlated via `sync_runs.trigger_dev_run_id`.
3. `sync_runs.error_details` (jsonb) - error name + stack trace, queryable directly:
   ```sql
   select id, provider, status, error_message, error_details, started_at
   from sync_runs
   where client_id = '<uuid>' and status = 'failed'
   order by started_at desc limit 10;
   ```
4. Application logs (`docker compose logs api`) - structured JSON via Pino in production, with every OAuth token/API key redacted (see `ARCHITECTURE.md` §5) - safe to share with a teammate for debugging without leaking credentials.

A failed sync never blocks the next scheduled run - just retry manually (§9) or wait for tomorrow's schedule; idempotent upserts mean there's no partial-state cleanup needed (see `SYNC_ENGINE.md`).
