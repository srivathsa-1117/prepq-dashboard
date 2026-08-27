import { supabaseAdmin } from '../database/supabaseClient.js';
import type { OrgRole } from '../types/domain.js';

export interface MembershipRow {
  organizationId: string;
  role: OrgRole;
}

/** All organization memberships for a user - the backbone of AuthContext. */
export async function getMembershipsForUser(userId: string): Promise<MembershipRow[]> {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId);

  if (error) throw error;

  return (data ?? []).map((row) => ({ organizationId: row.organization_id, role: row.role as OrgRole }));
}

export async function getOrganizationById(organizationId: string) {
  const { data, error } = await supabaseAdmin.from('organizations').select('*').eq('id', organizationId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOrganizationsForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('organization_members')
    .select('role, organizations(id, name, slug, created_at, updated_at)')
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).map((row) => ({ role: row.role, organization: row.organizations }));
}
