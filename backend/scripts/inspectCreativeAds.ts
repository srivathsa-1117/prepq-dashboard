import { supabaseAdmin } from '../src/database/supabaseClient.js';

async function main() {
  const { data: creatives, error: creativesErr } = await supabaseAdmin.from('creatives').select('id, name, status');
  if (creativesErr) throw creativesErr;
  console.log('creatives table:', JSON.stringify(creatives, null, 2));

  const { data: links, error: linksErr } = await supabaseAdmin.from('creative_ads').select('*');
  if (linksErr) throw linksErr;
  console.log('creative_ads links:', JSON.stringify(links, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
