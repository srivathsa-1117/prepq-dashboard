/**
 * One-off manual sync runner - calls the same syncMetaForClient() function the Trigger.dev task
 * wraps, but directly, since TRIGGER_SECRET_KEY isn't configured yet in this environment. Not
 * part of the app's request path; intended to be deleted once Trigger.dev is actually set up and
 * the normal "Sync now" button works end-to-end. See runGoogleSyncOnce.ts for the same pattern.
 */
import { syncMetaForClient } from '../src/sync/meta/metaSync.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';
const INTEGRATION_ID = 'cf8b501b-9819-4598-949c-93545b6de856';
const TRIGGERED_BY = '13884f07-a4cd-4744-bc76-865e45d1f536'; // srivathsa@thedarenetwork.com

async function main() {
  const result = await syncMetaForClient({
    clientId: CLIENT_ID,
    integrationId: INTEGRATION_ID,
    runType: 'manual',
    lookbackDays: 90,
    triggeredBy: TRIGGERED_BY,
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
