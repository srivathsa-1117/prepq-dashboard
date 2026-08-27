import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const { count: totalLeads } = await supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID);
  console.log('total leads:', totalLeads);

  const { data: seedLeads, error } = await supabaseAdmin
    .from('leads')
    .select('id, name, meritto_lead_id, source, created_at, raw_data')
    .eq('client_id', CLIENT_ID)
    .eq('raw_data->>seed', 'true');
  if (error) throw error;
  console.log('fake seed leads (raw_data.seed = true):', seedLeads?.length);
  console.log(
    'sample:',
    JSON.stringify(
      (seedLeads ?? []).slice(0, 5).map((l) => ({ id: l.id, name: l.name, meritto_lead_id: l.meritto_lead_id, source: l.source, created_at: l.created_at })),
      null,
      2,
    ),
  );

  // Also check by name pattern in case some don't have raw_data.seed set for some reason.
  const { data: nameSeed, error: nameErr } = await supabaseAdmin
    .from('leads')
    .select('id, name, meritto_lead_id')
    .eq('client_id', CLIENT_ID)
    .ilike('name', 'Sample Lead%');
  if (nameErr) throw nameErr;
  console.log('leads named "Sample Lead*":', nameSeed?.length);

  // How many of these fake seed leads DO have a non-null meritto_lead_id (explaining why they
  // passed the earlier "meritto_lead_id IS NOT NULL" filter)?
  const withMerittoId = (seedLeads ?? []).filter((l) => l.meritto_lead_id !== null);
  console.log('fake seed leads WITH a non-null meritto_lead_id:', withMerittoId.length);
  console.log('sample meritto_lead_id values on fake leads:', withMerittoId.slice(0, 5).map((l) => l.meritto_lead_id));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
