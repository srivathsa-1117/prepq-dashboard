-- ============================================================================
-- 0001_core_multitenancy.sql
-- Organization -> Users -> Organization Members -> Clients hierarchy.
-- auth.users is managed by Supabase Auth; we never create our own users table.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- organizations: the agency-side tenant root. One row per agency/customer of
-- the SaaS product. PrepQ's agency is the first organization.
-- ----------------------------------------------------------------------------
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table organizations is 'Top-level tenant: an agency or company using the platform.';

-- ----------------------------------------------------------------------------
-- organization_members: links auth.users to an organization with a role.
-- A user may belong to multiple organizations (e.g. a contractor working
-- with several agencies), each with its own role.
-- ----------------------------------------------------------------------------
do $$ begin
  create type org_role as enum ('owner', 'admin', 'manager', 'analyst', 'viewer');
exception
  when duplicate_object then null;
end $$;

create table if not exists organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            org_role not null default 'viewer',
  invited_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_org_members_user on organization_members(user_id);
create index if not exists idx_org_members_org on organization_members(organization_id);

comment on table organization_members is 'Role-based membership of a Supabase Auth user in an organization.';

-- ----------------------------------------------------------------------------
-- clients: a brand/account managed by an organization. PrepQ is the first
-- client row for the demo organization.
-- ----------------------------------------------------------------------------
create table if not exists clients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  slug            text not null,
  timezone        text not null default 'Asia/Kolkata',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists idx_clients_org on clients(organization_id);

comment on table clients is 'A managed brand/account (e.g. PrepQ) belonging to an organization.';

-- ----------------------------------------------------------------------------
-- client_access: explicit per-user client scoping. owner/admin/manager roles
-- implicitly see every client in their organization; analyst/viewer roles are
-- restricted to the clients listed here (principle of least privilege for
-- non-management roles working across many client accounts).
-- ----------------------------------------------------------------------------
create table if not exists client_access (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  granted_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (client_id, user_id)
);

create index if not exists idx_client_access_user on client_access(user_id);
create index if not exists idx_client_access_client on client_access(client_id);

comment on table client_access is 'Explicit client grants for analyst/viewer roles. Ignored for owner/admin/manager.';

-- ----------------------------------------------------------------------------
-- client_products: the "courses" concept from PrepQ, generalized. Each client
-- defines its own product list instead of hardcoding CPA/EA in code.
-- ----------------------------------------------------------------------------
create table if not exists client_products (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  code        text not null,             -- e.g. 'CPA', 'EA'
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, code)
);

create table if not exists client_product_fees (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  product_code  text not null,
  fee           numeric(14, 2) not null,
  currency      text not null default 'INR',
  updated_at    timestamptz not null default now(),
  unique (client_id, product_code)
);

comment on table client_product_fees is 'Fallback course fee used when a lead has no actual fee_paid captured from Meritto payments.';

create table if not exists client_targets (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  product_code  text not null,
  month         date not null,           -- first of month
  lead_target   int not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, product_code, month)
);

create index if not exists idx_client_targets_client_month on client_targets(client_id, month);

comment on table client_targets is 'Monthly lead targets per product, used for pacing calculations.';

-- ----------------------------------------------------------------------------
-- updated_at trigger helper, reused by every table below.
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_organizations_updated_at before update on organizations
  for each row execute function set_updated_at();
create trigger trg_org_members_updated_at before update on organization_members
  for each row execute function set_updated_at();
create trigger trg_clients_updated_at before update on clients
  for each row execute function set_updated_at();
create trigger trg_client_products_updated_at before update on client_products
  for each row execute function set_updated_at();
create trigger trg_client_targets_updated_at before update on client_targets
  for each row execute function set_updated_at();
