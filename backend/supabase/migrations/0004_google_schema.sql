-- ============================================================================
-- 0004_google_schema.sql
-- Google Ads entity mirror: Campaign -> Ad Group -> Ad (never "ad set" -
-- that is Meta's term), plus asset/creative references and daily performance.
-- Google Ads reports cost in micros (1,000,000 micros = 1 unit of currency);
-- we store cost_micros as-is and convert only at the reporting layer to avoid
-- floating point drift.
-- ============================================================================

create table if not exists google_campaigns (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references clients(id) on delete cascade,
  client_integration_id  uuid not null references client_integrations(id) on delete cascade,
  google_customer_id     text not null,
  google_campaign_id     text not null,
  name                   text,
  status                 text,
  advertising_channel_type text,
  campaign_budget_micros bigint,
  start_date             date,
  end_date               date,
  raw                    jsonb,
  last_synced_at         timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (client_id, google_campaign_id)
);

create index if not exists idx_google_campaigns_client on google_campaigns(client_id);

create table if not exists google_ad_groups (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,
  campaign_id        uuid not null references google_campaigns(id) on delete cascade,
  google_ad_group_id text not null,
  name               text,
  status             text,
  type               text,
  raw                jsonb,
  last_synced_at     timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id, google_ad_group_id)
);

create index if not exists idx_google_adgroups_client on google_ad_groups(client_id);
create index if not exists idx_google_adgroups_campaign on google_ad_groups(campaign_id);

create table if not exists google_ads_entities (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  ad_group_id     uuid not null references google_ad_groups(id) on delete cascade,
  google_ad_id    text not null,
  name            text,
  status          text,
  ad_type         text,
  final_urls      text[],
  headlines       jsonb,          -- responsive search ad assets, if applicable
  descriptions    jsonb,
  raw             jsonb,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, google_ad_id)
);

comment on table google_ads_entities is 'Named google_ads_entities (not google_ads) to avoid clashing with the "Google Ads" product name.';

create index if not exists idx_google_ads_client on google_ads_entities(client_id);
create index if not exists idx_google_ads_adgroup on google_ads_entities(ad_group_id);

-- ----------------------------------------------------------------------------
-- Creative/asset references. Google Ads exposes assets (images, headlines,
-- descriptions, videos) linked to ads rather than a single "creative" object
-- like Meta. We store what the Asset/AdGroupAd APIs return per ad.
-- TODO(google): confirm which asset field group (asset_link vs ad.ad.*) the
-- account's ad types actually populate before relying on image_url here.
-- ----------------------------------------------------------------------------
create table if not exists google_ad_assets (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  ad_id         uuid references google_ads_entities(id) on delete cascade,
  google_asset_id text,
  asset_type    text,             -- IMAGE, TEXT, VIDEO, YOUTUBE_VIDEO, ...
  text_content  text,
  image_url     text,
  raw           jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_google_assets_ad on google_ad_assets(ad_id);

create table if not exists google_ad_daily_metrics (
  id              bigserial primary key,
  client_id       uuid not null references clients(id) on delete cascade,
  ad_id           uuid not null references google_ads_entities(id) on delete cascade,
  date            date not null,
  impressions     bigint not null default 0,
  clicks          bigint not null default 0,
  cost_micros     bigint not null default 0,
  conversions     numeric(14, 4) not null default 0,
  conversions_value numeric(14, 4) not null default 0,
  raw             jsonb,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (ad_id, date)
);

create index if not exists idx_google_daily_client_date on google_ad_daily_metrics(client_id, date);
create index if not exists idx_google_daily_ad_date on google_ad_daily_metrics(ad_id, date);

comment on table google_ad_daily_metrics is 'One row per Google ad per calendar day. cost_micros / 1,000,000 = spend in account currency.';

create trigger trg_google_campaigns_updated_at before update on google_campaigns
  for each row execute function set_updated_at();
create trigger trg_google_adgroups_updated_at before update on google_ad_groups
  for each row execute function set_updated_at();
create trigger trg_google_ads_updated_at before update on google_ads_entities
  for each row execute function set_updated_at();
