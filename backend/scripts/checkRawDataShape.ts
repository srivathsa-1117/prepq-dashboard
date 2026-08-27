import { supabaseAdmin } from '../src/database/supabaseClient.js';

async function main() {
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, name, creative_id, raw_data')
    .eq('creative_id', '23531318-d50e-402b-ad5f-0bbde36ec6eb')
    .limit(2);
  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
