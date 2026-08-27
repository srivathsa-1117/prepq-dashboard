import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const { data } = await supabaseAdmin
    .from('creatives')
    .select('name, carousel_images, asset_url')
    .eq('client_id', CLIENT_ID)
    .not('carousel_images', 'is', null);
  console.log('creatives with carousel_images:', data?.length);
  console.log(JSON.stringify(data, null, 2));

  const { count: videoAssetCount } = await supabaseAdmin
    .from('creatives')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', CLIENT_ID)
    .ilike('asset_url', '%.mp4%');
  console.log('creatives with a real .mp4 asset_url:', videoAssetCount);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
