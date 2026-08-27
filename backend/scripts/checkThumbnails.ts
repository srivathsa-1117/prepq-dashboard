import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const { count: total } = await supabaseAdmin.from('creatives').select('id', { count: 'exact', head: true }).eq('client_id', CLIENT_ID);
  const { count: withThumb } = await supabaseAdmin
    .from('creatives')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', CLIENT_ID)
    .not('thumbnail_url', 'is', null);
  console.log('total creatives:', total, '| with thumbnail_url:', withThumb);

  const { data: sample } = await supabaseAdmin
    .from('creatives')
    .select('name, thumbnail_url, asset_url')
    .eq('client_id', CLIENT_ID)
    .not('thumbnail_url', 'is', null)
    .limit(5);
  console.log(JSON.stringify(sample, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
