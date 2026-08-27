import { supabaseAdmin } from '../src/database/supabaseClient.js';

async function main() {
  const { data: creative } = await supabaseAdmin
    .from('creatives')
    .select('id')
    .ilike('name', 'CPA| WP - DNVK - STATIC - Chatgpt%')
    .single();
  console.log('creative row id:', creative?.id);

  const { data: link } = await supabaseAdmin.from('creative_ads').select('meta_ad_id').eq('creative_id', creative!.id).single();
  console.log('meta_ad_id (internal):', link?.meta_ad_id);

  const { data: ad } = await supabaseAdmin.from('meta_ads').select('meta_ad_id, creative_id').eq('id', link!.meta_ad_id!).single();
  console.log('real meta ad id + creative platform id:', ad);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
