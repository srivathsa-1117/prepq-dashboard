# Environment Variables

Copy `.env.example` to `.env` and fill in. Validated at startup by `src/config/env.ts` (Zod) - the process exits immediately with a clear error if anything required is missing or malformed, rather than failing confusingly later.

## Server

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `8080` | |
| `HOST` | no | `0.0.0.0` | |
| `LOG_LEVEL` | no | `info` | `fatal`\|`error`\|`warn`\|`info`\|`debug`\|`trace`\|`silent` |
| `CORS_ALLOWED_ORIGINS` | no | `http://localhost:3000` | Comma-separated. Set to your deployed Next.js frontend origin(s) in production. |

## Supabase

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | **yes** | Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | **yes** | Project Settings → API → `anon` `public` key. Used **only** to verify incoming user access tokens (`supabase.auth.getUser(token)`) - never for data access. |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Project Settings → API → `service_role` key. **Full database access, bypasses RLS.** Server-side only - never send this to a browser or commit it. This is what every repository query uses. |
| `SUPABASE_JWT_SECRET` | no | Project Settings → API → JWT Settings. Reserved for a future local-verification optimization; not required for the current auth flow. |

## Credential encryption

| Variable | Required | Notes |
|---|---|---|
| `INTEGRATION_CREDENTIALS_ENC_KEY` | **yes** | 32-byte key, base64-encoded, used for AES-256-GCM encryption of stored OAuth tokens / API keys. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Losing this key makes every stored integration credential permanently undecryptable** - back it up like any other production secret (e.g. in your VPS's secret manager, not just the `.env` file). Rotating it requires re-connecting every client integration. |

## Meta (Facebook/Instagram) Marketing API

| Variable | Required for Meta sync | Notes |
|---|---|---|
| `META_APP_ID` | yes | From a Meta App in [developers.facebook.com](https://developers.facebook.com/) with the Marketing API product added. |
| `META_APP_SECRET` | yes | Same app. Never expose client-side. |
| `META_GRAPH_API_VERSION` | no (default `v20.0`) | Meta deprecates Graph API versions on a schedule (~2 years) - bump deliberately, not automatically. |
| `META_OAUTH_REDIRECT_URI` | yes | Must exactly match a redirect URI configured on the Meta App, and be the URL your **frontend** OAuth flow redirects to (it hands the resulting `authorization_code` to `POST /api/integrations/meta/connect`). |

**TODO before go-live**: confirm the app has been through Meta's App Review for `ads_read` (and any other scopes actually needed) - apps in development mode only see data for users with a role on the app / test ad accounts.

## Google Ads API

| Variable | Required for Google sync | Notes |
|---|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | yes | From the Google Ads account's API Center. **Requires Google's approval for "Standard" access** before it can read accounts you don't own directly (the agency-managing-a-client-account scenario) - a token in "Test" access mode only works against test accounts. |
| `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` | yes | OAuth2 client from Google Cloud Console with the Google Ads API enabled. |
| `GOOGLE_ADS_OAUTH_REDIRECT_URI` | yes | Must match the OAuth client's configured redirect URI; the frontend's OAuth consent flow must request `access_type=offline&prompt=consent` or Google will not return a `refresh_token` (see `integrations/google/googleAdsAuth.ts`). |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | only if calling through an MCC | The manager account's customer id (digits only). Required when the connected account is managed under an agency MCC rather than owned directly. |
| `GOOGLE_ADS_API_VERSION` | no (default `v25`) | Google sunsets each major version ~1 year after release (monthly releases as of 2026) - an outdated version 404s every call rather than erroring on auth. Check the [Google Ads API release notes](https://developers.google.com/google-ads/api/docs/release-notes) periodically and bump the default here when it lapses. |

## Meritto CRM

| Variable | Required for Meritto sync | Notes |
|---|---|---|
| `MERITTO_API_BASE_URL` | yes | **TODO**: obtain from Meritto's account manager / [developer portal](https://www.meritto.com/developer-portal/) for this specific PrepQ account. Not a public, self-serve value. |
| `MERITTO_API_KEY` / `MERITTO_API_SECRET` | yes | **TODO**: same source. `src/integrations/meritto/merittoClient.ts` assumes a header-based key/secret scheme (`x-api-key`/`x-api-secret`) as a placeholder - confirm the actual auth scheme before connecting a real account; it may differ. |
| `MERITTO_WEBHOOK_SECRET` | no (unused in this build) | Reserved for a future webhook-based ingest path, not required by the current scheduled-pull design - see `SYNC_ENGINE.md`. |

## Trigger.dev

| Variable | Required | Notes |
|---|---|---|
| `TRIGGER_PROJECT_ID` | yes (for scheduled sync) | From your project at [cloud.trigger.dev](https://cloud.trigger.dev). Also set in `trigger.config.ts`. |
| `TRIGGER_SECRET_KEY` | yes (for scheduled sync) | Project → API Keys. Needed by `npm run trigger:dev` locally and by the deploy step in CI/CD. |
| `INTERNAL_SERVICE_SECRET` | no (reserved) | Not currently used by any route; reserved for a future service-to-service auth need if one arises. |

## What breaks without each variable

- Missing any `SUPABASE_*` required var → the process refuses to start (env validation fails fast).
- Missing `INTEGRATION_CREDENTIALS_ENC_KEY` → the process refuses to start (nothing can be stored safely without it).
- Missing a provider's credentials (e.g. `META_APP_ID`) → the server **still starts** (other providers/features are unaffected) but that provider's OAuth connect flow throws a clear `Error` naming exactly which variable is missing (see `integrations/meta/metaAuth.ts` etc.) - it fails at the moment someone tries to connect that provider, not silently.
