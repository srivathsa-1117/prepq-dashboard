import { upsertLeadStatusRule } from '../src/repositories/leadStatusRulesRepo.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

// Real lead_stage taxonomy confirmed from this account's actual Meritto data (see
// GROUP BY raw_data->>'lead_stage' query) - not a generic guess.
const RULES: Array<{ sourceDisposition: string; statusCode: string }> = [
  { sourceDisposition: 'Untouched', statusCode: 'uncalled' },
  { sourceDisposition: 'Not Reachable', statusCode: 'not_reachable' },
  { sourceDisposition: 'Junk', statusCode: 'junk' },
  { sourceDisposition: 'Cold', statusCode: 'not_qualified' },
  { sourceDisposition: 'Closed', statusCode: 'not_qualified' },
  { sourceDisposition: 'No Enquiry', statusCode: 'not_qualified' },
  { sourceDisposition: 'Call later', statusCode: 'not_qualified' },
  { sourceDisposition: 'Not now', statusCode: 'not_qualified' },
  { sourceDisposition: 'Warm', statusCode: 'qualified' },
  { sourceDisposition: 'Hot', statusCode: 'qualified' },
  { sourceDisposition: 'Enrolled', statusCode: 'qualified' },
];

async function main() {
  for (const rule of RULES) {
    await upsertLeadStatusRule(CLIENT_ID, { ...rule, requiresDqReason: false });
    console.log('upserted:', rule.sourceDisposition, '->', rule.statusCode);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
