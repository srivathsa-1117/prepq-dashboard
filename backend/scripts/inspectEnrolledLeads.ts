import { supabaseAdmin } from '../src/database/supabaseClient.js';

async function main() {
  const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';
  const { data, error } = await supabaseAdmin.from('leads').select('id, meritto_lead_id, name, raw_data, status, created_at, enrolled_at, fee_paid').eq('client_id', CLIENT_ID);
  if (error) throw error;

  const enrolled = (data ?? []).filter((r) => (r.raw_data as Record<string, unknown> | null)?.lead_stage === 'Enrolled');
  for (const lead of enrolled) {
    const raw = lead.raw_data as Record<string, unknown>;
    console.log({
      id: lead.id,
      meritto_lead_id: lead.meritto_lead_id,
      name: lead.name,
      status: lead.status,
      created_at: lead.created_at,
      enrolled_at: lead.enrolled_at,
      fee_paid: lead.fee_paid,
      lead_stage: raw.lead_stage,
      previous_lead_stage: raw.previous_lead_stage,
      course: raw.course,
      lead_age: raw.lead_age,
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
