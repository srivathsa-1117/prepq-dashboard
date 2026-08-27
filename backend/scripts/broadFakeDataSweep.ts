import { supabaseAdmin } from '../src/database/supabaseClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

// Real Meta/Google platform ids are long (13-18 digit) numeric strings. Seed data in this
// project has consistently used short round numbers (6-16 digits starting with a low leading
// digit like 1000000001, 6000000000001) - a cheap, effective smell test.
function looksLikeFakeId(id: string | null): boolean {
  if (!id) return false;
  return /^\d{7,16}$/.test(id) && /0{4,}/.test(id);
}

async function main() {
  const tables: Array<{ table: string; idCol: string; nameCol: string }> = [
    { table: 'google_campaigns', idCol: 'google_campaign_id', nameCol: 'name' },
    { table: 'google_ad_groups', idCol: 'google_ad_group_id', nameCol: 'name' },
    { table: 'google_ads', idCol: 'google_ad_id', nameCol: 'name' },
    { table: 'meta_campaigns', idCol: 'meta_campaign_id', nameCol: 'name' },
    { table: 'meta_adsets', idCol: 'meta_adset_id', nameCol: 'name' },
    { table: 'meta_ads', idCol: 'meta_ad_id', nameCol: 'name' },
  ];

  for (const { table, idCol, nameCol } of tables) {
    const { data, error } = await supabaseAdmin.from(table).select(`id, ${idCol}, ${nameCol}, created_at`).eq('client_id', CLIENT_ID);
    if (error) throw error;
    const suspects = (data ?? []).filter((r: any) => looksLikeFakeId(r[idCol]));
    console.log(`${table}: ${data?.length} total, ${suspects.length} suspicious`, suspects.length ? JSON.stringify(suspects, null, 2) : '');
  }

  // sales_reps, courses, targets - check for anything named "Sample"/"Test"/"Seed"/"Fake" or with raw_data.seed markers.
  const { data: reps } = await supabaseAdmin.from('sales_reps').select('id, name').eq('client_id', CLIENT_ID);
  console.log('sales_reps:', JSON.stringify(reps, null, 2));

  const { data: courses } = await supabaseAdmin.from('courses').select('id, code, name, fee').eq('client_id', CLIENT_ID);
  console.log('courses:', JSON.stringify(courses, null, 2));

  const { data: targets } = await supabaseAdmin.from('targets').select('*').eq('client_id', CLIENT_ID);
  console.log('targets:', JSON.stringify(targets, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
