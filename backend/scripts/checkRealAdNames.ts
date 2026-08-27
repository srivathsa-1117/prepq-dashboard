import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const { data, error } = await supabaseAdmin
    .from('meta_ads')
    .select('id, name, meta_ad_id')
    .eq('client_id', CLIENT_ID)
    .or('name.ilike.%CPA Exam Fear Hook%,name.ilike.%EA Career Switch%');
  if (error) throw error;
  console.log('matches:', JSON.stringify(data, null, 2));

  // Also print all real ad names for a manual scan (small enough set: 424, but let's just check uniqueness of naming style).
  const { data: sample, error: sampleErr } = await supabaseAdmin
    .from('meta_ads')
    .select('name')
    .eq('client_id', CLIENT_ID)
    .limit(15);
  if (sampleErr) throw sampleErr;
  console.log('sample real ad names:', JSON.stringify(sample?.map((r) => r.name), null, 2));

  // What do the 19 affected leads' raw cf_ad_name actually say, verbatim?
  const { data: leads, error: leadsErr } = await supabaseAdmin
    .from('leads')
    .select('id, name, source, creative_id, raw_data')
    .in('creative_id', ['23531318-d50e-402b-ad5f-0bbde36ec6eb', '2da9ce13-bf57-478f-a022-48f2deaaef1c'])
    .limit(5);
  if (leadsErr) throw leadsErr;
  console.log(
    'sample affected leads raw cf_ad_name / cf_campaign_name / source:',
    JSON.stringify(
      leads?.map((l: any) => ({
        source: l.source,
        cf_ad_name: l.raw_data?.cf_ad_name,
        cf_campaign_name: l.raw_data?.cf_campaign_name,
        cf_ad_set_name: l.raw_data?.cf_ad_set_name,
      })),
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
