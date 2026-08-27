import { supabaseAdmin } from '../src/database/supabaseClient.js';

async function main() {
  const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';
  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('dq_reason')
    .eq('client_id', CLIENT_ID)
    .eq('status', 'not_qualified');
  if (error) throw error;

  const counts = new Map<string, number>();
  let nullCount = 0;
  for (const r of data ?? []) {
    if (!r.dq_reason) { nullCount++; continue; }
    counts.set(r.dq_reason, (counts.get(r.dq_reason) ?? 0) + 1);
  }
  console.log('total not_qualified:', data?.length);
  console.log('still null:', nullCount);
  console.log('by reason:', Object.fromEntries(counts));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
