import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const { count: withCreativeAttribution } = await supabaseAdmin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', CLIENT_ID)
    .not('creative_id', 'is', null);
  console.log('leads with a creative_id set:', withCreativeAttribution);

  const { count: totalLeads } = await supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID);
  console.log('total real leads:', totalLeads);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
