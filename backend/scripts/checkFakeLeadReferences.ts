import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const { data: fakeLeads, error } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('client_id', CLIENT_ID)
    .eq('raw_data->>seed', 'true');
  if (error) throw error;
  const fakeIds = (fakeLeads ?? []).map((l) => l.id);
  console.log('fake lead ids:', fakeIds.length);

  const { count: activitiesCount } = await supabaseAdmin
    .from('lead_activities')
    .select('id', { count: 'exact', head: true })
    .in('lead_id', fakeIds);
  console.log('lead_activities referencing fake leads:', activitiesCount);

  const { count: paymentsCount } = await supabaseAdmin.from('payments').select('id', { count: 'exact', head: true }).in('lead_id', fakeIds);
  console.log('payments referencing fake leads:', paymentsCount);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
