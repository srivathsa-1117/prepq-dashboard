import { supabaseAdmin } from '../src/database/supabaseClient.js';

const FAKE_CAMPAIGN_ID = '5b0b84bf-f180-4587-9ade-55606caa1272';
const FAKE_ADSET_ID = 'c1867f42-b6e6-4b41-85e6-536fd36efee5';
const FAKE_AD_IDS = ['aef748b5-4a96-4653-bc10-dd787013d46f', 'b6ede807-8437-4917-afce-027c4572df05'];

async function main() {
  const [byCampaign, byAdset, byAd1, byAd2, byCreative1, byCreative2] = await Promise.all([
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('meta_campaign_id', FAKE_CAMPAIGN_ID),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('meta_adset_id', FAKE_ADSET_ID),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('meta_ad_id', FAKE_AD_IDS[0]),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('meta_ad_id', FAKE_AD_IDS[1]),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('creative_id', FAKE_AD_IDS[0]),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('creative_id', FAKE_AD_IDS[1]),
  ]);
  console.log('leads referencing fake campaign:', byCampaign.count);
  console.log('leads referencing fake adset:', byAdset.count);
  console.log('leads referencing fake ad 1:', byAd1.count);
  console.log('leads referencing fake ad 2:', byAd2.count);
  console.log('leads referencing fake ad 1 as creative_id:', byCreative1.count);
  console.log('leads referencing fake ad 2 as creative_id:', byCreative2.count);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
