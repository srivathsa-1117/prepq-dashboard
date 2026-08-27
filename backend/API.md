# API Reference

Base URL: `http://localhost:8080` (dev) / your deployed VPS URL.

All endpoints except `GET /health` require:

```
Authorization: Bearer <supabase-access-token>
```

The token is a Supabase Auth session access token (obtained by the Next.js frontend via Google OAuth sign-in). The backend never issues its own session tokens.

Every response is JSON. Errors follow:

```json
{ "error": { "code": "FORBIDDEN", "message": "...", "details": { } } }
```

Common error codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (400), `CONFLICT` (409), `RATE_LIMITED` (429), `INTEGRATION_ERROR` (502), `INTERNAL_ERROR` (500).

Routes marked **[client]** resolve `client_id` from either the `client_id` route param or the `client_id` query param and enforce tenant access via `requireClientAccess` (see `ARCHITECTURE.md` §5). Routes marked **role: X** additionally require the caller's role in that client's organization to be at least X (`viewer < analyst < manager < admin < owner`).

---

## Health

### `GET /health`
No auth. Returns backend + database connectivity status. Never includes secrets.

```json
{ "status": "ok", "environment": "production", "uptimeSeconds": 1234.5, "checks": { "database": true } }
```

---

## Organizations & Clients

### `GET /api/organizations`
Lists organizations the caller belongs to, with their role in each.

### `GET /api/organizations/:organizationId/clients`
Lists clients in an organization the caller has access to.

### `POST /api/clients`
Creates a client. **role: admin** (checked against `organization_id` in the body). Registers the default 06:00/06:10/06:20 sync schedule immediately.

```json
// Request
{ "organization_id": "uuid", "name": "PrepQ", "slug": "prepq", "timezone": "Asia/Kolkata" }
```

### `GET /api/clients/:clientId` **[client]**
Returns the client record.

### `POST /api/clients/:clientId/access` **[client, role: admin]**
Grants a user an explicit, client-scoped role (`client_members` row) - only org owners/admins have implicit access to every client, everyone else (including org managers) needs this. Body: `{ "user_id": "uuid", "role": "manager" | "analyst" | "viewer" | "admin" | "owner" }`.

### `DELETE /api/clients/:clientId/access/:userId` **[client, role: admin]**
Revokes access.

---

## Integrations

All under `/api/integrations`, provider is one of `meta` | `google_ads` | `meritto`. `client_id` is a required query param on every route in this group.

### `GET /api/integrations` **[client]**
Lists all three integrations' status for the client (never includes credentials).

### `GET /api/integrations/:provider` **[client]**
Integration status + latest sync run summary for one provider. Response includes both the raw DB `status` (`disconnected` | `connected` | `error` | `paused` - there is no 5th "pending" value in the database) and a computed `phase` field that also distinguishes `pending_account_selection` (credentials stored, no ad account linked yet) for the frontend - see `services/integrationService.ts::computePhase`.

### `GET /api/integrations/:provider/accounts` **[client, role: manager]**
Lists ad accounts (Meta) / accessible customers (Google) available to the currently-stored OAuth credentials. For Meritto, returns the single connected account, if any.

### `POST /api/integrations/:provider/connect` **[client, role: manager, rate-limited]**
Two-step for Meta/Google OAuth, one-step for Meritto:

```json
// Meta/Google step 1 - exchange the OAuth code from the frontend redirect
{ "client_id": "uuid", "authorization_code": "..." }
// -> integration.status = "disconnected", phase = "pending_account_selection"

// Meta/Google step 2 - finalize with the chosen ad account / customer id
{ "client_id": "uuid", "external_account_id": "act_123", "external_account_name": "PrepQ Main" }
// -> integration.status = "connected"

// Meritto - single step, API key/secret pair
{ "client_id": "uuid", "api_key": "...", "api_secret": "..." }
```

Returns `{ "integration": PublicIntegration }` - never the credentials themselves.

### `POST /api/integrations/:provider/disconnect` **[client, role: manager, rate-limited]**
Clears stored credentials, sets status to `disconnected`. `204 No Content`.

### `POST /api/integrations/:provider/refresh` **[client, role: manager]**
Forces an OAuth token refresh (Meta/Google) outside the normal sync-time refresh. No-op for Meritto (API key/secret don't expire on a schedule).

### `POST /api/integrations/:provider/test` **[client, role: manager]**
Performs a lightweight live API call to verify the connection still works. Updates `last_tested_at` / `last_error`.

---

## Sync

### `GET /api/sync/status` **[client]**
Query param `provider` optional. Without it, returns all three providers' status. With it, also includes the 20 most recent `sync_runs` rows.

```json
{
  "provider": "meta",
  "lastSuccessful": { "id": "...", "status": "success", "recordsCreated": 12, "recordsUpdated": 340, "startedAt": "...", "completedAt": "...", "...": "..." },
  "lastFailed": null,
  "lastRun": { "...": "..." },
  "recentRuns": [ "..." ],
  "schedule": { "enabled": true, "frequency": "daily", "metadata": { "cronExpression": "0 6 * * *", "timezone": "Asia/Kolkata", "triggerDevScheduleId": "..." } }
}
```
`status` is one of `running` | `success` | `failed` | `partial` (some records failed but the run didn't throw). There is no separate `duration_ms`/`error_details` column - duration is `completedAt - startedAt`, and error details live in `metadata.errorDetails`.

### `GET /api/sync/schedules` **[client]**
Lists the configured `sync_jobs` row for all three providers (only present once that provider has been connected at least once - see `SYNC_ENGINE.md`).

### `POST /api/sync/:provider/run` **[client, role: manager, rate-limited]**
Triggers an on-demand sync via Trigger.dev. Body: `{ "lookback_days": 7 }` (optional). Returns `202 { "triggerRunId": "..." }` immediately - poll `GET /api/sync/status` for completion.

### `PATCH /api/sync/:provider/schedule` **[client, role: admin]**
Updates the per-client sync schedule. Requires the provider to already be connected (a schedule can't exist before an `integrations` row does) - returns `400 VALIDATION_ERROR` otherwise.

```json
{ "cron_expression": "0 6 * * *", "timezone": "Asia/Kolkata", "enabled": true }
```

---

## Dashboard (read-only reporting)

All under `/api/dashboard`, all **[client]**, `client_id` required query param. Shared filters (all optional except one date option):

| Param | Values |
|---|---|
| `range` | `7d` \| `30d` \| `mtd` \| `qtd` (mutually exclusive with `date_from`/`date_to`) |
| `date_from`, `date_to` | `YYYY-MM-DD`, both required if used instead of `range` |
| `course` | product code, e.g. `CPA` |
| `source` | `Meta` \| `Google` \| ... |
| `campaign` | exact campaign name |
| `creative` | exact creative name |

### `GET /api/dashboard/overview`
Leads, qualified/junk rate, enrolled, spend, revenue, CPL/CPQ/CPE, ROAS, period-over-period delta, current-month target pacing, median speed-to-lead.

### `GET /api/dashboard/trends`
Daily time series: leads, qualified, enrolled, spend, impressions, clicks, CPL - one row per day in the range.

### `GET /api/dashboard/funnel`
Leads → connected → qualified → demo booked → demo attended → enrolled, each with % of total and % of the previous stage.

### `GET /api/dashboard/sales`
Speed-to-lead buckets + median, uncalled aging (ignores the range filter - live queue), follow-up depth distribution, cohort conversion by creation month (ignores range filter), arrival heatmap (day-of-week × 3h block).

### `GET /api/dashboard/source-performance`
Per-source (Meta/Google/...) leads, qualified, enrolled, spend, revenue, CPL/CPQ/CPE, ROAS.

### `GET /api/dashboard/campaign-performance`
Per-campaign spend + lead metrics, joined by case-insensitive name match between ad platform and Meritto attribution (see `ARCHITECTURE.md` limitations note).

### `GET /api/dashboard/creative-performance`
Per-creative spend, CTR, leads, CPL, qualified/junk rate, enrolled, cost per qualified/enrollment, revenue, ROAS, and `fatigue` (trailing-14-day vs. preceding-14-day qualified rate comparison; `null`/`"insufficient_data"` when either window has fewer than 10 leads).

### `GET /api/dashboard/revenue`
Total revenue, total spend, blended ROAS, and a per-course breakdown.

---

## Roles reference

| Role | Can view client data | Can connect/disconnect/sync-now | Can manage schedules, grant access, create clients |
|---|---|---|---|
| viewer | ✓ (if explicitly granted) | | |
| analyst | ✓ (if explicitly granted) | | |
| manager | ✓ (all clients in org) | ✓ | |
| admin | ✓ (all clients in org) | ✓ | ✓ |
| owner | ✓ (all clients in org) | ✓ | ✓ |
