import { supabaseAdmin } from '../database/supabaseClient.js';
import type { Client, ClientRole } from '../types/domain.js';
import type { Database } from '../types/database.js';

type ClientRow = Database['public']['Tables']['clients']['Row'];

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    slug: row.slug,
    status: row.status as Client['status'],
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getClientById(clientId: string): Promise<Client | null> {
  const { data, error } = await supabaseAdmin.from('clients').select('*').eq('id', clientId).maybeSingle();
  if (error) throw error;
  return data ? toClient(data) : null;
}

export async function listClientsForOrganization(organizationId: string): Promise<Client[]> {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toClient);
}

export interface ClientMembership {
  clientId: string;
  role: ClientRole;
}

/** Per-client role grants for a user via client_members (used for analyst/viewer roles - see auth/rbac.ts). */
export async function listClientMemberships(userId: string): Promise<ClientMembership[]> {
  const { data, error } = await supabaseAdmin.from('client_members').select('client_id, role').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => ({ clientId: row.client_id, role: row.role as ClientRole }));
}

export async function grantClientAccess(clientId: string, userId: string, role: ClientRole): Promise<void> {
  const { error } = await supabaseAdmin
    .from('client_members')
    .upsert({ client_id: clientId, user_id: userId, role }, { onConflict: 'client_id,user_id' });
  if (error) throw error;
}

export async function revokeClientAccess(clientId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('client_members').delete().eq('client_id', clientId).eq('user_id', userId);
  if (error) throw error;
}

export async function createClient(input: {
  organizationId: string;
  name: string;
  slug: string;
  timezone?: string;
}): Promise<Client> {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      slug: input.slug,
      timezone: input.timezone ?? 'Asia/Kolkata',
    })
    .select('*')
    .single();
  if (error) throw error;
  return toClient(data);
}
