import { supabaseAdmin } from '../database/supabaseClient.js';

/**
 * Resolves Meritto's free-text owner/agent name to a sales_reps.id, creating
 * a minimal sales_reps row the first time a given name is seen for a client.
 * This is normalization, not attribution invention: Meritto is the source of
 * truth for *who* owns a lead, we're just giving that name a stable id.
 */
export async function getOrCreateSalesRepsByName(clientId: string, names: string[]): Promise<Map<string, string>> {
  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (uniqueNames.length === 0) return new Map();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('sales_reps')
    .select('id, name')
    .eq('client_id', clientId);
  if (existingError) throw existingError;

  const byName = new Map<string, string>();
  for (const row of existing ?? []) byName.set(row.name.trim().toLowerCase(), row.id);

  const missing = uniqueNames.filter((n) => !byName.has(n.toLowerCase()));
  if (missing.length > 0) {
    const { data: created, error: createError } = await supabaseAdmin
      .from('sales_reps')
      .insert(missing.map((name) => ({ client_id: clientId, name, status: 'active' })))
      .select('id, name');
    if (createError) throw createError;
    for (const row of created ?? []) byName.set(row.name.trim().toLowerCase(), row.id);
  }

  return byName;
}
