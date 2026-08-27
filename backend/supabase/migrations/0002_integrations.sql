-- ============================================================================
-- 0002_integrations.sql
-- Per-client integration connections (Meta, Google Ads, Meritto) and their
-- sync schedules. Credentials are encrypted at the application layer (AES-256-GCM,
-- see src/utils/crypto.ts) before being written here - the DB only ever sees
-- ciphertext plus the metadata needed to decrypt it.
-- ============================================================================

do $$ begin
  create type integration_provider as enum ('meta', 'google_ads', 'meritto');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type integration_status as enum (
    'disconnected',        -- never connected
    'pending_account_selection', -- OAuth done, ad account not chosen yet
    'connected',
    'error',                -- last refresh/test failed
    'expired'                -- token expired and could not be refreshed
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists client_integrations (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references clients(id) on delete cascade,
  provider               integration_provider not null,
  status                 integration_status not null default 'disconnected',

  -- Provider-side account identifiers, e.g. Meta ad account id ("act_123"),
  -- Google Ads customer id ("123-456-7890"), Meritto account/instance id.
  external_account_id    text,
  external_account_name  text,

  -- Application-layer encrypted credential blob. Never selected by API
  -- responses that reach the frontend (see repositories/integrationsRepo.ts).
  credentials_ciphertext text,
  credentials_iv         text,
  credentials_auth_tag   text,
  credentials_algo       text not null default 'aes-256-gcm',
  token_expires_at       timestamptz,
  scopes                 text[],

  connected_by           uuid references auth.users(id),
  connected_at           timestamptz,
  last_refreshed_at      timestamptz,
  last_tested_at         timestamptz,
  last_error             text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (client_id, provider)
);

create index if not exists idx_client_integrations_client on client_integrations(client_id);

comment on table client_integrations is 'One row per (client, provider). Holds encrypted credentials and connection status. Never expose credentials_* columns to the frontend.';

create trigger trg_client_integrations_updated_at before update on client_integrations
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- sync_schedules: per-client, per-provider cron configuration. Backs the
-- Trigger.dev imperative schedules (schedules.create) - trigger_dev_schedule_id
-- lets us update/deactivate the remote schedule when this row changes.
-- ----------------------------------------------------------------------------
create table if not exists sync_schedules (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references clients(id) on delete cascade,
  provider                integration_provider not null,
  cron_expression         text not null,       -- e.g. '0 6 * * *' (UTC, no seconds)
  timezone                text not null default 'UTC',
  enabled                 boolean not null default true,
  trigger_dev_schedule_id text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (client_id, provider)
);

comment on table sync_schedules is 'Configurable per-client morning sync schedule. Default suggestion: Meta 06:00, Google 06:10, Meritto 06:20 client-local time.';

create trigger trg_sync_schedules_updated_at before update on sync_schedules
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- sync_runs: one row per sync execution (scheduled or manual), independently
-- rerunnable and auditable.
-- ----------------------------------------------------------------------------
do $$ begin
  create type sync_run_status as enum ('running', 'success', 'partial_failure', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type sync_run_type as enum ('scheduled', 'manual', 'backfill');
exception
  when duplicate_object then null;
end $$;

create table if not exists sync_runs (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete cascade,
  client_integration_id uuid references client_integrations(id) on delete set null,
  provider              integration_provider not null,
  run_type              sync_run_type not null default 'scheduled',
  status                sync_run_status not null default 'running',

  started_at            timestamptz not null default now(),
  finished_at           timestamptz,
  duration_ms           integer,

  records_fetched       integer not null default 0,
  records_created       integer not null default 0,
  records_updated       integer not null default 0,
  records_failed        integer not null default 0,

  error_message         text,
  error_details         jsonb,

  triggered_by          uuid references auth.users(id), -- null = system/scheduled
  trigger_dev_run_id     text,                            -- correlates with Trigger.dev's run id

  created_at            timestamptz not null default now()
);

create index if not exists idx_sync_runs_client_provider on sync_runs(client_id, provider, started_at desc);
create index if not exists idx_sync_runs_status on sync_runs(status) where status in ('running', 'failed', 'partial_failure');

comment on table sync_runs is 'Audit trail + status source for every sync execution. Powers the Sync Center API.';
