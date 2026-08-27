import { supabaseAdmin } from '../src/database/supabaseClient.js';

async function main() {
  const { data, error } = await supabaseAdmin.from('sync_jobs').select('*').eq('client_id', '5b49fb30-931a-4845-a5ca-1c624422b1a1');
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));

  const { data: client, error: clientErr } = await supabaseAdmin.from('clients').select('id, name, timezone').eq('id', '5b49fb30-931a-4845-a5ca-1c624422b1a1').single();
  if (clientErr) throw clientErr;
  console.log('client:', client);

  const { data: integrations, error: intErr } = await supabaseAdmin.from('integrations').select('id, client_id, provider, status').eq('client_id', '5b49fb30-931a-4845-a5ca-1c624422b1a1');
  if (intErr) throw intErr;
  console.log('integrations:', JSON.stringify(integrations, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
