import { syncMerittoForClient } from '../src/sync/meritto/merittoSync.js';

async function main() {
  const result = await syncMerittoForClient({
    clientId: '5b49fb30-931a-4845-a5ca-1c624422b1a1',
    integrationId: 'b750c345-17e8-4828-b005-c24b22d0fed6',
    runType: 'backfill',
  });
  console.log(JSON.stringify(result, null, 2));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
