-- ============================================================================
-- 0005_meritto_schema.sql
-- Meritto CRM mirror. Meritto is the source of truth for sales data; this
-- schema is READ-ONLY from our side - we never write leads back to Meritto.
--
-- TODO(meritto): exact field names below (course/program, source, disposition
-- vocabulary, activity types) are modeled on the PrepQ handoff brief and
-- Meritto's publicly documented concepts (Lead API, activity log, Payments
-- API - see https://www.meritto.com/developer-portal/). Confirm every field
-- against a real Lead API response for this account before go-live; do not
-- assume the mapping below is exact.
-- ============================================================================

create table if not exists meritto_leads (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references clients(id) on delete cascade,
  client_integration_id  uuid not null references client_integrations(id) on delete cascade,
  meritto_lead_id        text not null,

  created_at_source      timestamptz not null,   -- lead creation time in Meritto
  product_code           text,                    -- 'CPA' | 'EA' | ... (client_products.code)

  -- Attribution: preserved exactly as Meritto provides it. Never invented -
  -- if Meritto does not capture campaign/ad-set/creative on the lead record,
  -- these stay null and attribution_raw documents what was actually present.
  source                 text,                    -- 'Meta' | 'Google' | 'Organic' | ...
  campaign                text,
  ad_set                 text,
  creative                text,
  attribution_raw         jsonb,

  owner                  text,                    -- salesperson assigned
  status                 text not null default 'uncalled',
  -- uncalled | not_reachable | junk | not_qualified | qualified (client-configurable mapping,
  -- see services/merittoDispositionMap - do not hardcode dashboard statuses in the connector)
  source_disposition     text,                    -- raw Meritto stage/disposition string, unmapped
  dq_reason               text,

  call_attempts           int not null default 0,
  first_call_at           timestamptz,
  connect_attempt         int,
  connected                boolean not null default false,

  demo_booked_at           timestamptz,
  demo_attended_at         timestamptz,
  enrolled_at              timestamptz,
  fee_paid                 numeric(14, 2),

  raw                      jsonb,                  -- last full Meritto lead payload
  last_synced_at           timestamptz not null default now(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (client_id, meritto_lead_id)
);

create index if not exists idx_meritto_leads_client on meritto_leads(client_id);
create index if not exists idx_meritto_leads_client_created on meritto_leads(client_id, created_at_source);
create index if not exists idx_meritto_leads_client_status on meritto_leads(client_id, status);
create index if not exists idx_meritto_leads_campaign on meritto_leads(client_id, source, campaign, ad_set, creative);

comment on table meritto_leads is 'Mirror of Meritto lead records. Source of truth stays Meritto; never write back.';

create table if not exists meritto_lead_activities (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  lead_id             uuid not null references meritto_leads(id) on delete cascade,
  meritto_activity_id text,
  activity_type       text,        -- call | email | sms | whatsapp | status_change | note ...
  activity_at         timestamptz not null,
  disposition         text,
  notes                text,
  agent                text,
  raw                  jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists idx_meritto_activities_lead on meritto_lead_activities(lead_id, activity_at);
create index if not exists idx_meritto_activities_client on meritto_lead_activities(client_id);
-- Meritto activity ids may not always be present/stable; unique only when non-null.
create unique index if not exists uq_meritto_activities_platform_id
  on meritto_lead_activities(client_id, meritto_activity_id)
  where meritto_activity_id is not null;

comment on table meritto_lead_activities is 'Call/email/status-change log per lead. Source of first_call_at, call_attempts, connect_attempt on meritto_leads.';

create table if not exists meritto_payments (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,
  lead_id            uuid not null references meritto_leads(id) on delete cascade,
  meritto_payment_id text not null,
  amount             numeric(14, 2) not null,
  currency           text not null default 'INR',
  paid_at            timestamptz,
  payment_status     text,
  raw                jsonb,
  created_at         timestamptz not null default now(),
  unique (client_id, meritto_payment_id)
);

create index if not exists idx_meritto_payments_lead on meritto_payments(lead_id);

comment on table meritto_payments is 'Payment/enrollment records, when the Payments API is available. Preferred source of enrolled_at/fee_paid over a sales-entered stage.';

-- ----------------------------------------------------------------------------
-- Append-only raw payload audit trail (API pulls and, if enabled later,
-- webhook deliveries). Never mutated, only inserted - used for replay/debug.
-- ----------------------------------------------------------------------------
create table if not exists meritto_raw_events (
  id              bigserial primary key,
  client_id       uuid not null references clients(id) on delete cascade,
  received_at     timestamptz not null default now(),
  event_source    text not null default 'api_sync',  -- 'api_sync' | 'webhook'
  event_type      text,
  meritto_lead_id text,
  payload         jsonb not null
);

create index if not exists idx_meritto_raw_events_client on meritto_raw_events(client_id, received_at desc);
create index if not exists idx_meritto_raw_events_lead on meritto_raw_events(meritto_lead_id);

create trigger trg_meritto_leads_updated_at before update on meritto_leads
  for each row execute function set_updated_at();
