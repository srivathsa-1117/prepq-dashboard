# PrepQ Analytics — Frontend

Next.js 14 (App Router) + TypeScript + Tailwind + hand-written shadcn-style/Radix
components. Consumes the Fastify backend in `../backend` — this app never talks to
Supabase tables directly except for Auth.

Exactly three authenticated product pages, per spec: **Overview**, **Campaigns**,
**Creatives**. Integration management is a drawer off the header, not a fourth page.

## Folder structure

```
frontend/
  app/
    layout.tsx                 Root layout: Theme/Query/Auth/OrgClient providers
    page.tsx                   "/" -> redirect to /overview
    login/page.tsx             Email/password sign-in + sign-up (Supabase Auth)
    auth/callback/route.ts     OAuth code exchange
    (app)/                     Route group for the authenticated shell
      layout.tsx                 Wraps children in <AppShell>
      overview/page.tsx
      campaigns/page.tsx
      creatives/page.tsx
    globals.css                 1:1 CSS-variable translation of prepq-dashboard-v2.html's palette
  components/
    ui/                         Hand-written Radix primitives (button, card, select, sheet, table, …)
    shell/                      AppShell, Sidebar, Topbar, ClientSwitcher, UserMenu,
                                 SyncStatus, ThemeToggle, MobileNav, IntegrationsDrawer
    filters/                    DateFilter, CourseFilter, SourceFilter, PlatformFilter
    overview/                   MetricCard, Funnel, TrendChart, TargetsEditor, EnrolledLeadsRevenue,
                                 AgingBuckets, SpeedToLead, FollowupDepth, LeadQuality, DisqualificationReasons,
                                 ArrivalHeatmap, SalesTeamTable, SourcePerformance, CohortTable,
                                 RevenueSummary
    campaigns/                  CampaignKpis, CampaignTable, CampaignDetailDrawer
    creatives/                  CreativeHeroKpis, CreativeFilters, CreativeGrid, CreativeCard,
                                 AssetPreview, CreativeDetailDrawer, CreativePerformanceChart
    common/                     AsyncSection, EmptyState, ErrorState, FatigueBadge
  lib/
    api/                        Dedicated service layer — every backend call goes through here
    hooks/                      react-query hooks + URL-backed filter state
    providers/                  Auth, OrgClient (org/client resolution + switching), Theme, Query
    supabase/                   Browser + server Supabase clients (Auth only)
    types/api.ts                Types mirroring the backend's response shapes exactly
    utils/                      format.ts, colors.ts, cn.ts, campaignTotals.ts, creativeStatus.ts
  middleware.ts                 Route protection + Supabase session refresh
  tailwind.config.ts            Maps all colors to the CSS custom properties in globals.css
```

## Routes

| Route | Purpose |
|---|---|
| `/` | Redirects to `/overview` |
| `/login` | Email/password sign-in and sign-up via Supabase Auth |
| `/auth/callback` | OAuth code → session exchange (route handler) |
| `/overview` | Product page 1 |
| `/campaigns` | Product page 2 (campaign drilldown opens as a `Sheet`, not a route) |
| `/creatives` | Product page 3 (creative drilldown opens as a `Sheet`, not a route) |

No `/leads`, `/sales`, `/analytics`, or `/integrations` routes exist. Integrations live in
`components/shell/IntegrationsDrawer.tsx`, opened from the user menu in the topbar.

## Backend API endpoints consumed

All through `lib/api/*.ts`:

- `GET /api/organizations`, `GET /api/organizations/:id/clients`, `GET /api/clients/:id`
- `GET /api/dashboard/filter-options` — course + lead-source option lists (added this phase)
- `GET /api/dashboard/overview`, `/trends`, `/funnel`, `/sales`, `/source-performance`,
  `/campaign-performance`, `/creative-performance`, `/revenue`
- `GET /api/dashboard/campaigns/:campaignId` — campaign drilldown (added this phase)
- `GET /api/dashboard/creatives/:creativeId` — creative drilldown (added this phase)
- `GET /api/integrations`, `GET /api/integrations/:provider`, `GET /api/integrations/:provider/accounts`,
  `POST /api/integrations/:provider/connect`, `POST /api/integrations/:provider/disconnect`,
  `POST /api/integrations/:provider/test`
- `GET /api/sync/status`, `POST /api/sync/:provider/run`

Every request attaches the current Supabase session's access token as a Bearer header
(`lib/api/client.ts`); the backend re-validates client membership/RLS on every call — client
selection in the UI is a convenience only, never the security boundary (see
`lib/providers/OrgClientProvider.tsx`).

## Environment variables

See `.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

Same Supabase project the backend connects to. The anon key is safe client-side — dashboard
data never comes from direct Supabase queries, only from the backend API, so integration
credentials and service-role access never reach the browser.

## Local development

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in Supabase URL/anon key
npm run dev                  # http://localhost:3000
```

Requires the backend running (`../backend`, default `http://localhost:8080`) and a Supabase
project with email/password sign-ups enabled (Auth settings - on by default). If "Confirm email"
is enabled there, a new sign-up won't get a session until the user clicks the confirmation link;
disable it for faster local testing, or use `/auth/callback` which already handles that redirect.

## Build

```bash
npm run typecheck   # tsc --noEmit
npm run lint         # eslint . --ext .ts,.tsx
npm run build         # next build (also type-checks)
npm run start          # serve the production build
```

Verified: `npm run typecheck`, `npm run lint`, and `npm run build` all pass cleanly against
this codebase (Next.js 14.2.35, production build succeeds with all three product pages
statically prerendered).

## How the reference HTML was translated

`prepq-dashboard-v2.html` was the visual/metric reference, not the application architecture:

- **Palette**: every `:root` custom property (light, `prefers-color-scheme: dark`, and
  `[data-theme="dark"]` blocks) was copied verbatim into `app/globals.css`, then wired into
  `tailwind.config.ts` as named colors (`bg-chip`, `text-ink2`, `text-meta`, `border-baseline`,
  `f1`–`f6`, `seq1`–`seq7`, …) instead of Tailwind's default palette. Dark mode uses
  `data-theme` (via `next-themes attribute="data-theme"`), matching the reference's own
  mechanism rather than next-themes' default `.dark` class.
- **Formatting**: the reference's vanilla-JS `fmt/pct/inr/inrL/dur` helpers became
  `lib/utils/format.ts` (`formatNumber/formatPercent/formatCurrencyCompact/formatDuration/…`),
  same rounding and locale behavior.
- **Charts**: the reference's manual SVG/Canvas drawing became Recharts components
  (`TrendChart`, `Funnel`, `CreativePerformanceChart`, `CampaignDetailDrawer`'s trend), with
  colors passed straight through as `var(--x)` strings — Recharts renders CSS custom
  properties directly, so no `getComputedStyle` reads are needed the way the vanilla file did.
- **Structure**: the reference was one static HTML file with all sections always present and
  vanilla JS toggling visibility/state. That's replaced with real React composition — each
  card/table/chart is its own component fetching its own slice of data via a react-query hook,
  four states each (loading skeleton / error / empty / data) via `<AsyncSection>`, URL-backed
  filter state (`useDashboardFilters`) instead of in-memory JS state, and client/org switching
  and auth that didn't exist in the static file at all.
- **New in this app, absent from the reference**: the entire Creatives page (asset-driven card
  grid, fatigue badges, drilldown), the Campaign drilldown drawer, and the Integrations drawer —
  none of these existed in the single-page reference and were built from the write-up spec plus
  the backend's actual response shapes.

## Known follow-ups

- `npm audit` flags Next.js 14.2.35 (latest patched 14.x) and `@supabase/supabase-js@2.45.4`
  against advisories that are only fully resolved by major-version upgrades (Next 15/16,
  supabase-js 2.112.x). The supabase-js pin is deliberate — 2.112.x has a confirmed
  select-query-parser regression that breaks every repository's types on the backend (see
  `backend/ARCHITECTURE.md`) — so it stays pinned until that's fixed upstream or the backend's
  hand-written `Database` types are reworked to avoid triggering it. A Next.js 15/16 migration
  is a deliberate, separate decision (React 19, App Router changes) and wasn't undertaken here.
