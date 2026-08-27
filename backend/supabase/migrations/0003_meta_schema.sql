-- ============================================================================
-- 0003_meta_schema.sql
-- Meta (Facebook/Instagram) Ads entity mirror: Campaign -> Ad Set -> Ad ->
-- Creative, plus daily performance. Entity tables hold identity/config only;
-- KPIs are derived at query time from meta_ad_daily_metrics.
-- ============================================================================

create table if not exists meta_campaigns (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references clients(id) on delete cascade,
  client_integration_id  uuid not null references client_integrations(id) on delete cascade,
  meta_campaign_id       text not null,
  name                   text,
  objective              text,
  status                 text,
  daily_budget           numeric(14, 2),
  lifetime_budget        numeric(14, 2),
  start_time             timestamptz,
  stop_time              timestamptz,
  raw                    jsonb,
  last_synced_at         timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (client_id, meta_campaign_id)
);

create index if not exists idx_meta_campaigns_client on meta_campaigns(client_id);

create table if not exists meta_ad_sets (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references clients(id) on delete cascade,
  campaign_id            uuid not null references meta_campaigns(id) on delete cascade,
  meta_adset_id          text not null,
  name                   text,
  status                 text,
  optimization_goal      text,
  billing_event          text,
  daily_budget           numeric(14, 2),
  lifetime_budget        numeric(14, 2),
  raw                    jsonb,
  last_synced_at         timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (client_id, meta_adset_id)
);

create index if not exists idx_meta_adsets_client on meta_ad_sets(client_id);
create index if not exists idx_meta_adsets_campaign on meta_ad_sets(campaign_id);

create table if not exists meta_ad_creatives (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references clients(id) on delete cascade,
  meta_creative_id       text not null,
  name                   text,
  title                  text,
  body                   text,
  thumbnail_url          text,
  image_url              text,
  video_id               text,
  object_type            text,
  call_to_action_type    text,
  raw                    jsonb,
  last_synced_at         timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (client_id, meta_creative_id)
);

create index if not exists idx_meta_creatives_client on meta_ad_creatives(client_id);

create table if not exists meta_ads (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references clients(id) on delete cascade,
  ad_set_id              uuid not null references meta_ad_sets(id) on delete cascade,
  creative_id            uuid references meta_ad_creatives(id) on delete set null,
  meta_ad_id             text not null,
  meta_creative_id       text,
  name                   text,
  status                 text,
  raw                    jsonb,
  last_synced_at         timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (client_id, meta_ad_id)
);

create index if not exists idx_meta_ads_client on meta_ads(client_id);
create index if not exists idx_meta_ads_adset on meta_ads(ad_set_id);
create index if not exists idx_meta_ads_creative on meta_ads(creative_id);

-- ----------------------------------------------------------------------------
-- Daily performance. Raw/additive facts only - CTR/CPC/CPM etc. are computed
-- in the reporting layer from impressions/clicks/spend, not stored redundantly
-- (except the platform-reported values in `raw` for audit/debugging).
-- ----------------------------------------------------------------------------
create table if not exists meta_ad_daily_metrics (
  id            bigserial primary key,
  client_id     uuid not null references clients(id) on delete cascade,
  ad_id         uuid not null references meta_ads(id) on delete cascade,
  date          date not null,
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  spend         numeric(14, 2) not null default 0,
  reach         bigint,
  frequency     numeric(10, 4),
  leads         bigint not null default 0,        -- from Meta's on-platform lead actions, if using Lead Ads
  actions       jsonb,                              -- full actions[] breakdown from Insights API, for audit
  raw           jsonb,
  last_synced_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (ad_id, date)
);

create index if not exists idx_meta_daily_client_date on meta_ad_daily_metrics(client_id, date);
create index if not exists idx_meta_daily_ad_date on meta_ad_daily_metrics(ad_id, date);

comment on table meta_ad_daily_metrics is 'One row per Meta ad per calendar day. Idempotency key: (ad_id, date). Re-syncing the same day upserts in place.';

create trigger trg_meta_campaigns_updated_at before update on meta_campaigns
  for each row execute function set_updated_at();
create trigger trg_meta_adsets_updated_at before update on meta_ad_sets
  for each row execute function set_updated_at();
create trigger trg_meta_ads_updated_at before update on meta_ads
  for each row execute function set_updated_at();
create trigger trg_meta_creatives_updated_at before update on meta_ad_creatives
  for each row execute function set_updated_at();
