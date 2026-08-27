/**
 * Core multi-tenant domain types. Mirrors the live Supabase schema (see
 * ARCHITECTURE.md - this project's data layer targets a pre-existing,
 * independently-built schema, not the speculative one under
 * supabase/migrations/, which is now superseded/reference-only).
 */

export type OrgRole = 'owner' | 'admin' | 'manager' | 'analyst' | 'viewer';

export const ORG_ROLES: readonly OrgRole[] = ['owner', 'admin', 'manager', 'analyst', 'viewer'];

/** organization_members.role and client_members.role share the exact same vocabulary (DB check constraints). */
export type ClientRole = OrgRole;

export type IntegrationProvider = 'meta' | 'google_ads' | 'meritto';

export const INTEGRATION_PROVIDERS: readonly IntegrationProvider[] = ['meta', 'google_ads', 'meritto'];

/** Matches the `integrations_status_check` constraint exactly - no 'pending_account_selection' value exists in the DB. */
export type IntegrationStatus = 'disconnected' | 'connected' | 'error' | 'paused';

/**
 * The two-step OAuth connect flow (exchange code -> pick ad account) is an
 * application-level concept layered on top of the DB's 4-value status: an
 * integration is "pending account selection" when its row exists, has
 * stored credentials, but no linked integration_accounts row yet. See
 * services/integrationService.ts.
 */
export type IntegrationConnectionPhase = IntegrationStatus | 'pending_account_selection';

/** Matches `sync_runs_status_check`: running/success/failed/partial (not "partial_failure"). */
export type SyncRunStatus = 'running' | 'success' | 'failed' | 'partial';
export type SyncRunType = 'scheduled' | 'manual' | 'backfill';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClientStatus = 'active' | 'paused' | 'archived';

export interface Client {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: ClientStatus;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

/** courses table - the "product" concept (PrepQ's CPA/EA). Fee lives inline, unlike the speculative design's separate fees table. */
export interface ClientCourse {
  id: string;
  clientId: string;
  code: string;
  name: string;
  fee: number;
  currency: string;
  status: 'active' | 'inactive' | 'archived';
}

export interface ClientTarget {
  id: string;
  clientId: string;
  courseId: string;
  month: string; // ISO date, first of month
  leadTarget: number;
  qualifiedTarget: number;
  enrollmentTarget: number;
  revenueTarget: number;
}

/**
 * The authenticated request context assembled by src/auth/middleware.ts.
 * Every authorization decision downstream of authentication reads from this.
 */
export interface AuthContext {
  userId: string;
  email: string | null;
  /** Role per organization the user belongs to. */
  memberships: Array<{ organizationId: string; role: OrgRole }>;
}

/**
 * Resolved per-client access. `role` is the CLIENT-scoped role: an org
 * owner/admin's implicit role for any client in their org, or the specific
 * role granted via client_members for everyone else - these are not always
 * the same value as the caller's org role (mirrors has_client_access /
 * has_client_write_access in the database).
 */
export interface ClientScope {
  clientId: string;
  organizationId: string;
  role: ClientRole;
}
