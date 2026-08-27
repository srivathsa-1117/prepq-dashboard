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
  console.log('fake lead ids to remove:', fakeIds.length);

  const { error: paymentsErr, count: paymentsCount } = await supabaseAdmin
    .from('payments')
    .delete({ count: 'exact' })
    .in('lead_id', fakeIds);
  if (paymentsErr) throw paymentsErr;
  console.log('fake payments deleted:', paymentsCount);

  const { error: activitiesErr, count: activitiesCount } = await supabaseAdmin
    .from('lead_activities')
    .delete({ count: 'exact' })
    .in('lead_id', fakeIds);
  if (activitiesErr) throw activitiesErr;
  console.log('fake lead_activities deleted:', activitiesCount);

  const { error: leadsErr, count: leadsCount } = await supabaseAdmin.from('leads').delete({ count: 'exact' }).in('id', fakeIds);
  if (leadsErr) throw leadsErr;
  console.log('fake leads deleted:', leadsCount);

  const { count: finalCount } = await supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID);
  console.log('final leads count:', finalCount);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
