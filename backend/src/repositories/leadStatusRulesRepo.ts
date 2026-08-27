import { supabaseAdmin } from '../database/supabaseClient.js';

export interface LeadStatusRule {
  sourceDisposition: string;
  statusCode: string;
  requiresDqReason: boolean;
}

export async function listLeadStatusRules(clientId: string): Promise<LeadStatusRule[]> {
  const { data, error } = await supabaseAdmin
    .from('lead_status_rules')
    .select('source_disposition, status_code, requires_dq_reason')
    .eq('client_id', clientId);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    sourceDisposition: r.source_disposition,
    statusCode: r.status_code,
    requiresDqReason: r.requires_dq_reason,
  }));
}

export async function upsertLeadStatusRule(clientId: string, rule: LeadStatusRule): Promise<void> {
  const { error } = await supabaseAdmin.from('lead_status_rules').upsert(
    {
      client_id: clientId,
      source_disposition: rule.sourceDisposition,
      status_code: rule.statusCode,
      requires_dq_reason: rule.requiresDqReason,
    },
    { onConflict: 'client_id,source_disposition' },
  );
  if (error) throw error;
}

/** The catalog of valid status codes for a client (uncalled/not_reachable/junk/not_qualified/qualified by default, seeded via seed_default_lead_statuses()). */
export async function listLeadStatusCodes(clientId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from('lead_statuses').select('code').eq('client_id', clientId);
  if (error) throw error;
  return (data ?? []).map((r) => r.code);
}
