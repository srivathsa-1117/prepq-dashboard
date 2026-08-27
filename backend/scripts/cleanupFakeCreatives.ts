import { supabaseAdmin } from '../src/database/supabaseClient.js';

async function main() {
  const { error, count } = await supabaseAdmin
    .from('creatives')
    .delete({ count: 'exact' })
    .in('id', ['23531318-d50e-402b-ad5f-0bbde36ec6eb', '2da9ce13-bf57-478f-a022-48f2deaaef1c']);
  if (error) throw error;
  console.log('fake creatives deleted:', count);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
