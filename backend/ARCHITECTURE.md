# Architecture

## 1. Design principles

1. **Meritto stays the source of truth for sales data.** We mirror it; we never write leads back. Every Meritto row keeps its raw payload (`raw` / `attribution_raw` jsonb columns) for audit.
2. **No invented attribution.** If Meritto doesn't capture campaign/ad-set/creative on a lead, those fields stay `null` - the system never guesses.
3. **Entities are identity, metrics are facts, derived numbers live in code.** `meta_campaigns`/`google_campaigns`/`leads` store identity and config. `meta_ad_daily_metrics`/`google_ad_daily_metrics` store raw daily facts (impressions, clicks, spend). CPL, ROAS, qualified rate, funnel percentages, fatigue trends - all of that is computed in `src/services/metricCalculations.ts`, the live project's own reporting views, and this backend's added date-ranged SQL functions, never pre-baked into a stored column.
4. **Batch, not streaming.** The dashboard is read once each morning after sync. There is no ingest webhook, no event bus, no long-lived connection. This is a direct, deliberate scope decision - see `SYNC_ENGINE.md`.
5. **Three integrations, not a framework.** `src/integrations/meta`, `.../google`, `.../meritto` each own their API client, OAuth/auth handling, and transform functions independently. There is no shared `Connector` base class or plugin registry - adding a fourth provider means writing a fourth folder, not extending an abstraction that was guessing at requirements it didn't have yet.

## 2. Multi-tenant data model

**This backend targets an already-existing, independently-built Supabase schema** - it was not designed from these migrations. `supabase/migrations/*.sql` in this repo is the original speculative design, now superseded (see `supabase/migrations/SUPERSEDED.md`); the live schema has its own 26 migrations already applied, plus four small additive ones this backend needed (credential-access bridge functions, date-ranged reporting functions, the disposition-rule mapping table, and a `sync_jobs.metadata` column - see that same file for exact names).

```
organizations                 (agency/company - the top-level tenant)
  └── organization_members    (Supabase Auth user + role: owner/admin/manager/analyst/viewer)
  └── profiles                (auth.users mirror: email/full_name/avatar_url, populated by a trigger)
  └── clients                 (a managed brand, e.g. PrepQ)
        └── client_members         (per-client role grants - see §"RBAC" below, NOT the same as org role)
        └── courses                (products/programs, e.g. CPA, EA - fee/currency inline)
        └── targets                (monthly lead/qualified/enrollment/revenue targets per course)
        └── sales_reps             (owner/agent dimension, auto-provisioned from Meritto owner names)
        └── lead_statuses          (per-client status catalog: uncalled/not_reachable/junk/not_qualified/qualified by default)
        └── lead_status_rules      (added by this backend - Meritto disposition string -> lead_statuses.code)
        └── integration_providers  (catalog: meta / google_ads / meritto)
        └── integrations           (one row per client+provider; status only, no credentials)
              └── integration_accounts   (chosen ad account/customer id per integration)
                    secrets.integration_credentials  (separate schema, NOT exposed via the Data API - see below)
        └── sync_jobs              (one row per client+provider; added `metadata` holds cron/timezone/Trigger.dev schedule id)
        └── sync_runs              (audit trail of every sync execution, FK'd to sync_jobs)
        └── meta_campaigns -> meta_adsets -> meta_ads
        └── meta_ad_daily_metrics
        └── google_campaigns -> google_ad_groups -> google_ads
        └── google_ad_daily_metrics
        └── creatives -> creative_ads (join table linking a creative to a meta_ads or google_ads row)
        └── leads                 (FK-based attribution: meta_campaign_id/meta_adset_id/meta_ad_id
                                    OR google_campaign_id/google_ad_group_id/google_ad_id, never both -
                                    resolved from Meritto's free-text campaign/creative names at sync
                                    time, see src/repositories/attributionLookupRepo.ts)
        └── lead_activities
        └── payments
        └── meritto_events         (webhook-shaped audit table - not used by this backend's scheduled-pull sync)
  └── audit_logs                   (org/client-scoped action log - not yet wired up by this backend)
```

Full column-level detail: query the live project directly (`list_tables` / `execute_sql` via the Supabase MCP tools, or `supabase db pull`) - it's the source of truth, not any file in this repo.

### Why credentials live in a separate `secrets` schema, not `integrations`

`secrets.integration_credentials` has RLS enabled with **zero policies** and is not part of Supabase's exposed Data API schema list - it is unreachable via the REST client (`supabase-js`) entirely, by design, even with the service-role key. The only way in or out is through three `SECURITY DEFINER` bridge functions this backend added (`get_integration_credentials` / `upsert_integration_credentials` / `clear_integration_credentials`), each with `EXECUTE` revoked from `anon`/`authenticated` and granted only to `service_role`. See `src/repositories/integrationsRepo.ts`.

### RBAC: org role vs. client role

`organization_members.role` and `client_members.role` share the same five-value vocabulary (owner/admin/manager/analyst/viewer) but are **not the same thing**. An org owner/admin has implicit access to every client in their org (mirroring the database's own `is_org_admin`/`has_client_access` functions) - manager/analyst/viewer do not get implicit access and need an explicit `client_members` row, whose `role` column then applies for that client specifically (a user can be `analyst` on one client and `manager` on another). See `src/auth/rbac.ts::assertClientAccess`.

### Why `client_id` is on every table, not just derivable via join

Every marketing-data and lead-data table carries its own `client_id`, even though it's technically derivable by joining up through campaign → integration_account → integration → client. This is deliberate: it lets Row Level Security policies scope access with a single equality check instead of a multi-table join in every policy, and it lets every repository query filter directly without a join. This is a standard, accepted denormalization for multi-tenant Postgres schemas.

### Why RLS exists when the backend already checks access in code

`src/auth/rbac.ts` (`assertClientAccess`) is the **primary** authorization boundary - every API route resolves it before touching data, and the backend's repositories use the Postgres **service role** key, which bypasses RLS entirely. RLS on the live project is defense-in-depth: it guarantees tenant isolation even if a future code path (e.g. a direct Supabase read from the Next.js frontend using the user's own session) forgets to check `assertClientAccess` first. Both layers independently enforce "an analyst without an explicit grant cannot read another client's data" - see `tests/unit/auth/tenantIsolation.test.ts`.

## 3. Request flow

```
Next.js frontend
  │  Authorization: Bearer <supabase-access-token>
  ▼
Fastify (src/app.ts)
  │
  ├─ authenticate            verifies the token via Supabase Auth, loads org memberships
  ├─ requireClientAccess     resolves client_id from the route, checks org role / client_members
  ├─ requireRole(min)        (mutating routes only) checks role >= manager/admin
  │
  ▼
Route handler (src/api/routes/*)
  ▼
Service (src/services/*)        business logic, orchestration
  ▼
Repository (src/repositories/*)  Supabase queries (service-role client)
  ▼
Supabase Postgres
```

## 4. Sync flow (see SYNC_ENGINE.md for full detail)

```
Trigger.dev schedule (per client, per provider, e.g. 06:00 Meta)
  ▼
scheduler/tasks/{provider}SyncTask.ts   resolves clientId -> clientIntegrationId
  ▼
sync/{provider}/{provider}Sync.ts       orchestrates: fetch -> transform -> upsert
  │    (wrapped by sync/syncRunTracker.ts: creates/completes a sync_runs row)
  ▼
integrations/{provider}/{provider}Client.ts   paginated API calls, retry/backoff
  ▼
integrations/{provider}/{provider}Transform.ts   raw provider shape -> normalized shape
  ▼
repositories/{provider}Repo.ts          idempotent upsert into Supabase
```

## 5. Security boundary

- **Credentials never reach the frontend.** They're encrypted application-side (AES-256-GCM, `src/utils/crypto.ts`), stored in `secrets.integration_credentials` - a schema that isn't part of Supabase's exposed Data API at all - and reached only through three `SECURITY DEFINER` bridge functions granted to `service_role` alone (see §2 above). `repositories/integrationsRepo.ts::getDecryptedCredentials` is the single call site, used exclusively from `sync/*` and `services/integrationService.ts` (server-side, never serialized into an HTTP response). Every other read path uses `PublicIntegration`, a type that structurally has no ciphertext fields at all - there's no `res.send(row)` shortcut that could leak one.
- **Logs never contain tokens.** `src/utils/logger.ts` redacts `access_token`, `refresh_token`, `client_secret`, `api_key`, `api_secret`, `credentials_*`, and `Authorization`/`Cookie` headers at the Pino level.
- **Rate limiting** is global (`api/plugins/rateLimit.plugin.ts`) plus a tighter override on sensitive routes (integration connect/disconnect, manual sync trigger - see `config/constants.ts::RATE_LIMIT.sensitive`).
- **Centralized error handling** (`api/plugins/errorHandler.plugin.ts`) means no route handler can accidentally leak a stack trace or raw Postgres error to the client; only `AppError` subclasses' `message`/`code` reach the response body.

## 6. Why Trigger.dev for scheduling instead of node-cron / a custom queue

The spec explicitly rules out building bespoke real-time/queue infrastructure (Kafka, Redis streams, Airbyte). Scheduled jobs still need: per-client configurable cron, retries with backoff, run history/logs, and the ability to run independently of the Fastify process's uptime (a VPS restart shouldn't skip this morning's sync). Trigger.dev v4 provides exactly this (`schedules.create` for per-client imperative schedules, task-level retry config, a hosted run history) without us writing a scheduler, a job queue, or a retry engine. The Fastify API and the Trigger.dev tasks are two independently deployable processes that both read/write the same Supabase database - see `DEPLOYMENT.md`.

## 7. What's intentionally out of scope

- Real-time dashboard updates (websockets, live subscriptions) - the spec is explicit that morning-sync freshness is sufficient.
- A generic multi-provider connector abstraction - three hand-written integrations are simpler and more debuggable than a framework built for a fourth provider that doesn't exist yet.
- Writing back to Meritto - it is read-only, by design, everywhere in this codebase.
