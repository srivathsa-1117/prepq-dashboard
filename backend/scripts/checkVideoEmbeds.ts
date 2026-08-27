import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const { count } = await supabaseAdmin
    .from('creatives')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', CLIENT_ID)
    .ilike('asset_url', '%plugins/video.php%');
  console.log('creatives with a Facebook video embed asset_url:', count);

  const { data } = await supabaseAdmin
    .from('creatives')
    .select('name, asset_url')
    .eq('client_id', CLIENT_ID)
    .ilike('asset_url', '%plugins/video.php%')
    .limit(2);
  console.log(JSON.stringify(data, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
