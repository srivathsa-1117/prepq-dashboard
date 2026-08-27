-- ============================================================================
-- 0008_disposition_rules.sql
-- Client-configurable mapping from Meritto's raw disposition/stage strings to
-- the five dashboard statuses (uncalled | not_reachable | junk | not_qualified
-- | qualified). This intentionally lives in data, not code - different
-- Meritto instances use different disposition vocabularies, and the handoff
-- brief is explicit that "free-text dispositions are the failure mode that
-- kills this project" (Section 5). The Meritto sync writes source_disposition
-- verbatim either way, so a bad/missing mapping is always debuggable and the
-- rule set can be corrected retroactively without re-pulling from Meritto.
-- ============================================================================

create table if not exists client_disposition_rules (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  source_disposition  text not null,          -- exact Meritto disposition/stage string, case-insensitive match
  dashboard_status    text not null check (dashboard_status in ('uncalled', 'not_reachable', 'junk', 'not_qualified', 'qualified')),
  requires_dq_reason  boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (client_id, source_disposition)
);

comment on table client_disposition_rules is 'Maps a client''s raw Meritto disposition strings to the five dashboard statuses. Unmapped dispositions fall back to services/merittoDispositionMap.ts default heuristics and are logged for follow-up.';

alter table client_disposition_rules enable row level security;

create policy client_disposition_rules_select on client_disposition_rules for select
  using (fn_can_access_client(client_id));

create trigger trg_client_disposition_rules_updated_at before update on client_disposition_rules
  for each row execute function set_updated_at();
