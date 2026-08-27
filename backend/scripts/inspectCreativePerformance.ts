import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin.rpc('fn_creative_performance_range', {
    p_client_id: CLIENT_ID,
    p_date_from: from,
    p_date_to: to,
    p_platform: null,
    p_course_id: null,
  });
  if (error) throw error;
  console.log('rows:', data?.length);
  console.log(JSON.stringify(data, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
