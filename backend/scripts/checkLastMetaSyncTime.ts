import { supabaseAdmin } from '../src/database/supabaseClient.js';

async function main() {
  const { data, error } = await supabaseAdmin
    .from('sync_runs')
    .select('*')
    .eq('client_id', '5b49fb30-931a-4845-a5ca-1c624422b1a1')
    .order('started_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
  console.log('current time:', new Date().toISOString());
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
