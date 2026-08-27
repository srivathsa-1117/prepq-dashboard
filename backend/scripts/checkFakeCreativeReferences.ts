import { supabaseAdmin } from '../src/database/supabaseClient.js';

const FAKE_CREATIVE_IDS = ['23531318-d50e-402b-ad5f-0bbde36ec6eb', '2da9ce13-bf57-478f-a022-48f2deaaef1c'];

async function main() {
  for (const id of FAKE_CREATIVE_IDS) {
    const { count, error } = await supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }).eq('creative_id', id);
    if (error) throw error;
    console.log(`leads referencing creative ${id}:`, count);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
