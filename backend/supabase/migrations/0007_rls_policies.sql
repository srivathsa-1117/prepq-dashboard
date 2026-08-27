-- ============================================================================
-- 0007_rls_policies.sql
-- Row Level Security as defense-in-depth. The backend service (service-role
-- key) bypasses RLS and is the PRIMARY authorization boundary (see
-- src/auth/rbac.ts + src/auth/middleware.ts) - these policies protect against
-- any accidental direct Supabase access (e.g. a future client-side read using
-- the anon key + user JWT) from ever crossing tenant boundaries.
-- ============================================================================

create or replace function fn_current_org_role(p_organization_id uuid)
returns org_role
language sql
stable
security definer
set search_path = public
as $$
  select role from organization_members
  where organization_id = p_organization_id and user_id = auth.uid()
  limit 1
$$;

create or replace function fn_can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from clients c
    join organization_members om
      on om.organization_id = c.organization_id and om.user_id = auth.uid()
    where c.id = p_client_id
      and (
        om.role in ('owner', 'admin', 'manager')
        or exists (
          select 1 from client_access ca
          where ca.client_id = p_client_id and ca.user_id = auth.uid()
        )
      )
  )
$$;

-- ----------------------------------------------------------------------------
-- organizations / membership
-- ----------------------------------------------------------------------------
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table clients enable row level security;
alter table client_access enable row level security;
alter table client_products enable row level security;
alter table client_product_fees enable row level security;
alter table client_targets enable row level security;

create policy org_select on organizations for select
  using (fn_current_org_role(id) is not null);

create policy org_members_select on organization_members for select
  using (fn_current_org_role(organization_id) is not null);

create policy clients_select on clients for select
  using (fn_can_access_client(id));

create policy client_access_select on client_access for select
  using (fn_can_access_client(client_id));

create policy client_products_select on client_products for select
  using (fn_can_access_client(client_id));

create policy client_product_fees_select on client_product_fees for select
  using (fn_can_access_client(client_id));

create policy client_targets_select on client_targets for select
  using (fn_can_access_client(client_id));

-- ----------------------------------------------------------------------------
-- integrations + sync (status is readable by anyone with client access;
-- credentials columns are still never selected by the API layer for
-- non-admin roles - see repositories/integrationsRepo.ts)
-- ----------------------------------------------------------------------------
alter table client_integrations enable row level security;
alter table sync_schedules enable row level security;
alter table sync_runs enable row level security;

create policy client_integrations_select on client_integrations for select
  using (fn_can_access_client(client_id));

create policy sync_schedules_select on sync_schedules for select
  using (fn_can_access_client(client_id));

create policy sync_runs_select on sync_runs for select
  using (fn_can_access_client(client_id));

-- ----------------------------------------------------------------------------
-- Marketing data (Meta + Google) - read-only for clients with access
-- ----------------------------------------------------------------------------
alter table meta_campaigns enable row level security;
alter table meta_ad_sets enable row level security;
alter table meta_ads enable row level security;
alter table meta_ad_creatives enable row level security;
alter table meta_ad_daily_metrics enable row level security;

alter table google_campaigns enable row level security;
alter table google_ad_groups enable row level security;
alter table google_ads_entities enable row level security;
alter table google_ad_assets enable row level security;
alter table google_ad_daily_metrics enable row level security;

create policy meta_campaigns_select on meta_campaigns for select using (fn_can_access_client(client_id));
create policy meta_adsets_select on meta_ad_sets for select using (fn_can_access_client(client_id));
create policy meta_ads_select on meta_ads for select using (fn_can_access_client(client_id));
create policy meta_creatives_select on meta_ad_creatives for select using (fn_can_access_client(client_id));
create policy meta_daily_select on meta_ad_daily_metrics for select using (fn_can_access_client(client_id));

create policy google_campaigns_select on google_campaigns for select using (fn_can_access_client(client_id));
create policy google_adgroups_select on google_ad_groups for select using (fn_can_access_client(client_id));
create policy google_ads_select on google_ads_entities for select using (fn_can_access_client(client_id));
create policy google_assets_select on google_ad_assets for select using (fn_can_access_client(client_id));
create policy google_daily_select on google_ad_daily_metrics for select using (fn_can_access_client(client_id));

-- ----------------------------------------------------------------------------
-- Meritto data - read-only for clients with access
-- ----------------------------------------------------------------------------
alter table meritto_leads enable row level security;
alter table meritto_lead_activities enable row level security;
alter table meritto_payments enable row level security;
alter table meritto_raw_events enable row level security;

create policy meritto_leads_select on meritto_leads for select using (fn_can_access_client(client_id));
create policy meritto_activities_select on meritto_lead_activities for select using (fn_can_access_client(client_id));
create policy meritto_payments_select on meritto_payments for select using (fn_can_access_client(client_id));

-- Raw events are audit/debug data - restrict to admins+ rather than every viewer.
create policy meritto_raw_events_select on meritto_raw_events for select
  using (
    exists (
      select 1 from clients c
      join organization_members om on om.organization_id = c.organization_id and om.user_id = auth.uid()
      where c.id = meritto_raw_events.client_id
        and om.role in ('owner', 'admin', 'manager')
    )
  );

-- ----------------------------------------------------------------------------
-- No INSERT/UPDATE/DELETE policies are defined for any tenant data table.
-- All writes happen exclusively through the backend service using the
-- service-role key, which bypasses RLS entirely - this is intentional: it
-- keeps "never write leads back to Meritto" and "never let a client mutate
-- another client's rows" true by construction, not by policy diligence.
-- ----------------------------------------------------------------------------
