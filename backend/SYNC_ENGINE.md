# Sync Engine

## Why a morning batch sync, not real-time

The dashboard is opened once each morning by the agency, sales, and founder teams (per the original PrepQ brief). There is no requirement for intra-day freshness. Building webhook ingestion, an event bus, or live subscriptions for that usage pattern would add operational surface area (dead-letter queues, replay tooling, at-least-once delivery semantics) with no corresponding user benefit. A scheduled pull, run once a day per provider, is simpler to operate, cheaper to run, and just as correct for this use case.

## Default schedule

| Time (client-local) | Provider |
|---|---|
| 06:00 | Meta |
| 06:10 | Google Ads |
| 06:20 | Meritto |

Meritto is scheduled last deliberately - by the time it runs, that day's Meta/Google spend rows already exist, so any reporting query that joins spend to leads (campaign/creative performance) has both sides available.

These are **defaults** (`src/config/constants.ts::DEFAULT_SYNC_SCHEDULE`). Unlike an earlier design, they are **not** registered when a client is created - the live project's `sync_jobs.integration_id` is a required foreign key, so a schedule can't exist until a provider is actually connected. Instead, `services/integrationService.ts::registerScheduleOnConnect` fires the moment a provider finishes connecting (`connectIntegration` reaching `status: 'connected'`), creating the client's `sync_jobs` row and the Trigger.dev schedule together. Each client can override its own per-provider schedule afterward via `PATCH /api/sync/:provider/schedule` (see `API.md`), which updates the exact cron expression/timezone/Trigger.dev schedule id stored in `sync_jobs.metadata` (a column this backend added - the live project's own `frequency` enum on `sync_jobs` is too coarse, hourly/daily/weekly/manual, to express a specific per-client morning time).

## How scheduling actually works

Each provider has two Trigger.dev task definitions in `src/scheduler/tasks/`:

1. A plain `task()` (`meta-sync`, `google-ads-sync`, `meritto-sync`) - the actual unit of work. Takes `{ clientId, integrationId, runType, lookbackDays? }` and calls the corresponding `sync/{provider}/{provider}Sync.ts` function. This is what a **manual "sync now"** click triggers (`POST /api/sync/:provider/run` → `services/syncService.ts::triggerManualSync` → `<task>.trigger(payload)`).
2. A `schedules.task()` (`meta-sync-scheduled`, etc.) - the cron entrypoint. Trigger.dev calls this with `{ externalId, timestamp, timezone, ... }`; `externalId` is the client id (set when the schedule was created), so the task looks up that client's `integrations` row (via `getIntegrationIdForClientProvider`) and then calls the exact same sync function as the manual path.

Both paths converge on the same `sync/{provider}/{provider}Sync.ts` function, so "what happens on a scheduled run" and "what happens when someone clicks sync now" are never two different code paths that can drift.

`scheduler/registerSchedules.ts` wraps Trigger.dev's `schedules.create()` (imperative scheduling, not a hardcoded `cron` on the task definition) precisely because the cron expression is per-client, not fixed at deploy time. `deduplicationKey: "${clientId}-${provider}"` makes re-registering a schedule idempotent - updating a client's sync time calls the same function again rather than creating a duplicate schedule.

## The sync run lifecycle

Every sync, scheduled or manual, goes through `src/sync/syncRunTracker.ts::runTrackedSync`:

1. **Create** a `sync_runs` row (`status: 'running'`).
2. **Run** the provider-specific executor, which:
   - Fetches paginated data from the provider API (`integrations/{provider}/{provider}Client.ts`).
   - Transforms it into the normalized shape (`integrations/{provider}/{provider}Transform.ts`).
   - Upserts it (`repositories/{provider}Repo.ts`), tracking created/updated/failed counts on a shared `SyncRunCounters` object.
3. **Complete** the run: `status` becomes `success` (no failures), `partial` (some records failed but the run didn't throw - e.g. a handful of Meritto leads whose activity log couldn't be fetched), or `failed` (the executor threw). Duration, counts, and error details are always written, whichever branch is hit.

This means a sync run can **never** leave `sync_runs` stuck in `running` - `completeSyncRun` is called from both the success path and the `catch` block.

## Idempotency

Every entity table has a unique constraint on `(client_id, <platform_id>)`, and every daily-metric table on `(ad_id, date)`. Repository upsert functions (`repositories/metaRepo.ts`, `googleRepo.ts`, `merittoRepo.ts`) always use Postgres `upsert(...).onConflict(...)`, never plain `insert`. Re-running the exact same sync (accidentally twice, or as a manual retry after a partial failure) **cannot create duplicate rows** - see `tests/integration/sync/idempotency.test.ts`, which asserts that running the same batch twice reports `0 created` the second time.

| Provider | Entity key | Daily metric key |
|---|---|---|
| Meta | `(client_id, meta_campaign_id)`, `(client_id, meta_adset_id)`, `(client_id, meta_ad_id)`, `(client_id, meta_creative_id)` | `(ad_id, date)` |
| Google | `(client_id, google_campaign_id)`, `(client_id, google_ad_group_id)`, `(client_id, google_ad_id)` | `(ad_id, date)` |
| Meritto | `(client_id, meritto_lead_id)`, `(client_id, meritto_activity_id)` where present, `(client_id, meritto_payment_id)` | n/a - Meritto has no daily metric table, leads carry their own `created_at_source` |

Activities without a stable `meritto_activity_id` (some Meritto accounts may not expose one) are inserted rather than upserted - see the comment in `repositories/merittoRepo.ts::upsertMerittoActivities` for the accepted tradeoff (possible duplication on retry vs. silent data loss).

## Retries

`src/utils/retry.ts::withRetry` + `src/utils/httpClient.ts::httpJson` implement exponential backoff shared by all three provider clients:

- **Retryable**: HTTP 429, HTTP 5xx, and network-level errors (`ECONNRESET`, `ETIMEDOUT`, etc.), or anything explicitly thrown as `RetryableError`.
- **Not retryable**: any other 4xx (401, 403, 404, ...), or anything thrown as `PermanentError` - these fail the sync run immediately rather than wasting five attempts on a request that will never succeed (e.g. an expired token that isn't refreshable, a malformed query).
- Default: 5 attempts, 500ms initial delay, factor 2, capped at 30s (`config/constants.ts::RETRY`).

Token expiration is handled a layer above the generic retry: `sync/meta/metaSync.ts::ensureFreshToken` and `sync/google/googleSync.ts::ensureFreshToken` proactively refresh/extend the access token before the sync's first API call if it's close to expiring, so a token refresh is never "one of the five retry attempts" - it's a precondition the sync checks first.

Trigger.dev **also** retries the task itself at the task level (`retry: { maxAttempts: 3, ... }` in each `scheduler/tasks/*.ts` file) as a second, coarser layer: if an entire sync run fails outright (e.g. Supabase was briefly unreachable), Trigger.dev reruns the whole task, which creates a **new** `sync_runs` row - the old failed one stays in history untouched. Combined with idempotent upserts, this makes every sync safely rerunnable at any granularity: a single failed HTTP call, or the whole job.

## Initial historical import vs. daily sync

- **Meta / Google**: entity sync (campaigns/ad sets/ads) always pulls the full current set (these are low-volume, typically hundreds of rows); daily metrics pull a rolling lookback window (`DEFAULT_LOOKBACK_DAYS = 3`) to absorb late-arriving/re-attributed conversions, not just "yesterday". A first-time connect naturally backfills metrics for that window; a longer historical backfill would use the same `sync/{provider}/{provider}Sync.ts` function with a larger `lookbackDays` passed via `runType: 'manual'`.
- **Meritto**: `runType: 'backfill'` pulls the full lead history (no `updated_since` filter) - used for the initial import documented in the original handoff brief (Section 8: "initial historical import"). `runType: 'scheduled'`/`'manual'` pull a `MERITTO_RECONCILIATION_LOOKBACK_DAYS = 14` window, which self-heals any lead whose status/activity changed in the last two weeks even if a previous sync missed it - this is the "reconciliation" behavior the spec calls for, since there is no live webhook ingestion in this build.

## Failure visibility

`GET /api/sync/status` and `GET /api/sync/schedules` (see `API.md`) expose, per client and provider: last successful run, last failed run, records fetched/created/updated/failed, and the error message of the last failure. This is what a future "Sync Center" frontend page would render. `sync_runs` has no dedicated `error_details`/`duration_ms` columns in the live schema - the error name + stack trace live in `sync_runs.metadata.errorDetails` (a jsonb column, alongside `runType`/`triggeredBy`/`triggerDevRunId`); duration is derivable from `started_at`/`completed_at`. `error_message` stays the human-readable summary column.

## Rerunning a failed sync

Because every sync is idempotent and independently tracked, recovering from a failure is always: call `POST /api/sync/:provider/run` again (or wait for tomorrow's schedule). There is no manual cleanup step, no "did this partially apply" ambiguity - the upsert semantics guarantee a rerun converges to the same state a from-scratch sync would produce.
