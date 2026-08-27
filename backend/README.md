# PrepQ Analytics Backend

Multi-tenant marketing + sales analytics backend. Syncs **Meta Ads**, **Google Ads**, and **Meritto CRM** into Supabase every morning, and serves read-only reporting APIs to a separate Next.js frontend.

PrepQ (CPA/EA courses) is the first client onboarded to this platform; the schema and APIs are organization/client-scoped from the ground up so additional agencies and clients can be added without code changes.

## What this is (and isn't)

- **Is**: a purpose-built TypeScript backend - Fastify REST API + Trigger.dev scheduled sync jobs + Supabase Postgres.
- **Isn't**: a generic ETL framework, a real-time system, or a multi-provider "connector SDK". There are exactly three integrations (Meta, Google Ads, Meritto), each hand-written for its provider's actual API shape.
- Dashboards read **yesterday's synced data**, not live provider data. There is deliberately no WebSocket/Kafka/Redis layer - see `SYNC_ENGINE.md` for why a scheduled batch model is sufficient here.

## Documentation map

| Doc | Covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, multi-tenant model, folder structure, data model |
| [SYNC_ENGINE.md](./SYNC_ENGINE.md) | How the morning sync works, scheduling, idempotency, retries, failure handling |
| [API.md](./API.md) | Every REST endpoint, request/response shapes, auth requirements |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Every environment variable, where to get it, what breaks without it |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Hostinger VPS deployment, Trigger.dev deployment, migrations |

## Quick start (local development)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# fill in SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY at minimum -
# see ENVIRONMENT.md for how to generate INTEGRATION_CREDENTIALS_ENC_KEY

# 3. Apply the database schema to your Supabase project
#    (via the Supabase CLI, or paste each file into the SQL editor in order)
supabase db push
# or, without the CLI:
#   for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done

# 4. Run the API server
npm run dev
# -> http://localhost:8080/health

# 5. Run the scheduled-sync worker (separate terminal, needs TRIGGER_SECRET_KEY)
npm run trigger:dev

# 6. Run the test suite (no live credentials required)
npm test
```

## Project layout

```
backend/
  src/
    config/        env validation, constants (default sync times, page sizes, thresholds)
    database/       Supabase client (service-role + anon)
    auth/            Supabase Auth verification, RBAC, Fastify middleware
    api/
      routes/        health, organizations, clients, integrations, sync, dashboard
      plugins/        error handler, CORS, rate limiting
    integrations/
      meta/           Meta Graph API client, OAuth, transform
      google/         Google Ads API client, OAuth, transform
      meritto/        Meritto CRM client, transform
    sync/
      meta/ google/ meritto/   per-provider sync orchestration
      syncRunTracker.ts        shared sync_runs bookkeeping
    scheduler/
      tasks/           Trigger.dev task + schedule definitions
      registerSchedules.ts    imperative Trigger.dev schedule management
    services/         business logic: integrations, sync status, reporting, fatigue, disposition mapping
    repositories/     Supabase queries, one file per entity group
    validators/       Zod request schemas
    utils/            logger, errors, retry, pagination, crypto, date ranges
    types/            hand-written Database types + domain/provider types
  supabase/migrations/  numbered SQL migrations (schema, RLS, reporting functions)
  tests/              unit + integration tests, fixtures, no live credentials needed
  trigger.config.ts   Trigger.dev v4 project config
  Dockerfile, docker-compose.yml
```

See `ARCHITECTURE.md` for the reasoning behind this structure.

## Frontend contract

The frontend is a **separate Next.js app** and only ever talks to this backend over HTTP (`API.md`) using a Supabase Auth session token. It never receives integration credentials (OAuth tokens, API keys) - those stay encrypted at rest and server-side only. See `ARCHITECTURE.md` → "Security boundary" for the full explanation.

## Status

Every layer here is real, working code - repositories, sync orchestration, reporting calculations, auth/RBAC, and 79 passing tests, `tsc --noEmit` clean. The data layer targets an **already-live, already-migrated Supabase project** (not the speculative schema under `supabase/migrations/` - see `supabase/migrations/SUPERSEDED.md` and `ARCHITECTURE.md` §2); connectivity, every added SQL function, and the credential-storage bridge functions have been verified directly against that project's real (seeded) data. The three provider integrations (Meta/Google/Meritto) are built against each provider's documented API shape with explicit `TODO(provider):` markers wherever a detail is account-specific and cannot be confirmed without live credentials (exact Meritto endpoint paths, Google Ads MCC hierarchy, Meta Lead Ads action-type naming, etc.) - see the `TODO(meritto)`/`TODO(meta)`/`TODO(google)` comments throughout `src/integrations/` and `src/types/` before connecting a real account.

**Not yet verified**: the authenticated repository/service code path end-to-end (requires the project's `service_role` key, which wasn't available in the environment this was built in - only the `anon` key was) and a live OAuth round-trip with real Meta/Google/Meritto credentials. Both are the natural next steps before go-live.
