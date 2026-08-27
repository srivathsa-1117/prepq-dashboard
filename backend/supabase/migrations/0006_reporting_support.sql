-- ============================================================================
-- 0006_reporting_support.sql
-- Read-only SQL support for the reporting API: entity-flattening views that
-- normalize Meta and Google into a common shape, plus two aggregate functions
-- for the joins that are impractical to express efficiently through the
-- Supabase JS query builder (campaign performance, creative performance).
--
-- Everything else in the reporting API (funnel, speed-to-lead, cohort,
-- heatmap, uncalled aging) is computed in TypeScript from raw meritto_leads
-- rows - see src/services/reportingService.ts - so that business-rule logic
-- (bucket boundaries, fatigue suppression thresholds, etc.) stays in one
-- place and is unit-testable without a database.
--
-- NOTE ON THE SPEND<->LEAD JOIN: Meritto stores attribution as free-text
-- (campaign/ad_set/creative names or UTM values), not platform IDs. Joining
-- ad-platform spend to Meritto leads is therefore necessarily a
-- case-insensitive name match, exactly as flagged in the original handoff
-- brief (Section 4.2): "this only works if naming/UTM discipline holds."
-- ============================================================================

create or replace view v_meta_daily_flat as
select
  c.client_id,
  'meta'::text as provider,
  m.date,
  camp.id as campaign_id,
  camp.name as campaign_name,
  camp.meta_campaign_id as campaign_platform_id,
  aset.id as ad_group_id,
  aset.name as ad_group_name,
  ad.id as ad_id,
  ad.name as ad_name,
  cre.id as creative_id,
  coalesce(cre.name, ad.name) as creative_name,
  coalesce(cre.thumbnail_url, cre.image_url) as creative_preview_url,
  m.impressions,
  m.clicks,
  m.spend,
  m.leads
from meta_ad_daily_metrics m
join meta_ads ad on ad.id = m.ad_id
join meta_ad_sets aset on aset.id = ad.ad_set_id
join meta_campaigns camp on camp.id = aset.campaign_id
join clients c on c.id = m.client_id
left join meta_ad_creatives cre on cre.id = ad.creative_id;

create or replace view v_google_daily_flat as
select
  c.client_id,
  'google_ads'::text as provider,
  m.date,
  camp.id as campaign_id,
  camp.name as campaign_name,
  camp.google_campaign_id as campaign_platform_id,
  ag.id as ad_group_id,
  ag.name as ad_group_name,
  ad.id as ad_id,
  ad.name as ad_name,
  ad.id as creative_id,                        -- Google has no single creative id; the ad itself is the unit
  ad.name as creative_name,
  (
    select ga.image_url from google_ad_assets ga
    where ga.ad_id = ad.id and ga.image_url is not null
    limit 1
  ) as creative_preview_url,
  m.impressions,
  m.clicks,
  (m.cost_micros::numeric / 1000000.0) as spend,
  0::bigint as leads                            -- Google Ads conversions are not treated as CRM leads here
from google_ad_daily_metrics m
join google_ads_entities ad on ad.id = m.ad_id
join google_ad_groups ag on ag.id = ad.ad_group_id
join google_campaigns camp on camp.id = ag.campaign_id
join clients c on c.id = m.client_id;

create or replace view v_ad_performance_daily as
select * from v_meta_daily_flat
union all
select * from v_google_daily_flat;

comment on view v_ad_performance_daily is 'Common Meta+Google shape for daily ad performance. Used by campaign/creative/source reporting.';

-- ----------------------------------------------------------------------------
-- fn_campaign_performance: spend/impressions/clicks per campaign, left-joined
-- to Meritto lead counts (by case-insensitive campaign name match + source).
-- ----------------------------------------------------------------------------
create or replace function fn_campaign_performance(
  p_client_id uuid,
  p_date_from date,
  p_date_to date,
  p_source text default null,      -- 'Meta' | 'Google'
  p_course text default null,
  p_campaign text default null
)
returns table (
  provider text,
  campaign_name text,
  campaign_platform_id text,
  impressions bigint,
  clicks bigint,
  spend numeric,
  leads bigint,
  qualified bigint,
  enrolled bigint,
  revenue numeric
)
language sql
stable
as $$
  with spend_agg as (
    select
      v.provider,
      v.campaign_name,
      v.campaign_platform_id,
      sum(v.impressions) as impressions,
      sum(v.clicks) as clicks,
      sum(v.spend) as spend
    from v_ad_performance_daily v
    where v.client_id = p_client_id
      and v.date between p_date_from and p_date_to
      and (p_source is null or (case when v.provider = 'meta' then 'Meta' else 'Google' end) = p_source)
      and (p_campaign is null or v.campaign_name ilike p_campaign)
    group by 1, 2, 3
  ),
  lead_agg as (
    select
      case when l.source ilike 'meta' then 'meta' else 'google_ads' end as provider,
      l.campaign as campaign_name,
      count(*) as leads,
      count(*) filter (where l.status = 'qualified') as qualified,
      count(*) filter (where l.enrolled_at is not null) as enrolled,
      sum(coalesce(l.fee_paid, 0)) filter (where l.enrolled_at is not null) as revenue
    from meritto_leads l
    where l.client_id = p_client_id
      and l.created_at_source::date between p_date_from and p_date_to
      and (p_source is null or l.source = p_source)
      and (p_course is null or l.product_code = p_course)
      and (p_campaign is null or l.campaign ilike p_campaign)
      and l.campaign is not null
    group by 1, 2
  )
  select
    coalesce(s.provider, l.provider) as provider,
    coalesce(s.campaign_name, l.campaign_name) as campaign_name,
    s.campaign_platform_id,
    coalesce(s.impressions, 0) as impressions,
    coalesce(s.clicks, 0) as clicks,
    coalesce(s.spend, 0) as spend,
    coalesce(l.leads, 0) as leads,
    coalesce(l.qualified, 0) as qualified,
    coalesce(l.enrolled, 0) as enrolled,
    coalesce(l.revenue, 0) as revenue
  from spend_agg s
  full outer join lead_agg l
    on l.provider = s.provider and lower(l.campaign_name) = lower(s.campaign_name)
$$;

-- ----------------------------------------------------------------------------
-- fn_creative_performance: creative-level spend + lead join, per Section 14
-- of the spec. Junk/qualified rates and fatigue windowing are finished in
-- TypeScript (services/fatigueService.ts) on top of this result set, since
-- fatigue needs two independent 14-day windows per creative that are clearer
-- to express and unit test outside SQL.
-- ----------------------------------------------------------------------------
create or replace function fn_creative_performance(
  p_client_id uuid,
  p_date_from date,
  p_date_to date,
  p_source text default null,
  p_course text default null
)
returns table (
  provider text,
  creative_name text,
  creative_preview_url text,
  campaign_name text,
  ad_group_name text,
  impressions bigint,
  clicks bigint,
  spend numeric,
  leads bigint,
  qualified bigint,
  junk bigint,
  enrolled bigint,
  revenue numeric
)
language sql
stable
as $$
  with spend_agg as (
    select
      v.provider,
      v.creative_name,
      max(v.creative_preview_url) as creative_preview_url,
      v.campaign_name,
      max(v.ad_group_name) as ad_group_name,
      sum(v.impressions) as impressions,
      sum(v.clicks) as clicks,
      sum(v.spend) as spend
    from v_ad_performance_daily v
    where v.client_id = p_client_id
      and v.date between p_date_from and p_date_to
      and (p_source is null or (case when v.provider = 'meta' then 'Meta' else 'Google' end) = p_source)
    group by 1, 2, 4
  ),
  lead_agg as (
    select
      case when l.source ilike 'meta' then 'meta' else 'google_ads' end as provider,
      l.creative as creative_name,
      l.campaign as campaign_name,
      count(*) as leads,
      count(*) filter (where l.status = 'qualified') as qualified,
      count(*) filter (where l.status = 'junk') as junk,
      count(*) filter (where l.enrolled_at is not null) as enrolled,
      sum(coalesce(l.fee_paid, 0)) filter (where l.enrolled_at is not null) as revenue
    from meritto_leads l
    where l.client_id = p_client_id
      and l.created_at_source::date between p_date_from and p_date_to
      and (p_source is null or l.source = p_source)
      and (p_course is null or l.product_code = p_course)
      and l.creative is not null
    group by 1, 2, 3
  )
  select
    coalesce(s.provider, l.provider) as provider,
    coalesce(s.creative_name, l.creative_name) as creative_name,
    s.creative_preview_url,
    coalesce(s.campaign_name, l.campaign_name) as campaign_name,
    s.ad_group_name,
    coalesce(s.impressions, 0) as impressions,
    coalesce(s.clicks, 0) as clicks,
    coalesce(s.spend, 0) as spend,
    coalesce(l.leads, 0) as leads,
    coalesce(l.qualified, 0) as qualified,
    coalesce(l.junk, 0) as junk,
    coalesce(l.enrolled, 0) as enrolled,
    coalesce(l.revenue, 0) as revenue
  from spend_agg s
  full outer join lead_agg l
    on l.provider = s.provider
   and lower(l.creative_name) = lower(s.creative_name)
   and lower(coalesce(l.campaign_name, '')) = lower(coalesce(s.campaign_name, ''))
$$;

-- ----------------------------------------------------------------------------
-- fn_qualified_rate_window: trailing qualified-rate for a single creative
-- over an arbitrary date window - the primitive fatigue comparison needs.
-- ----------------------------------------------------------------------------
create or replace function fn_qualified_rate_window(
  p_client_id uuid,
  p_creative text,
  p_date_from date,
  p_date_to date
)
returns table (leads bigint, qualified bigint)
language sql
stable
as $$
  select
    count(*) as leads,
    count(*) filter (where status = 'qualified') as qualified
  from meritto_leads
  where client_id = p_client_id
    and creative = p_creative
    and created_at_source::date between p_date_from and p_date_to
$$;
