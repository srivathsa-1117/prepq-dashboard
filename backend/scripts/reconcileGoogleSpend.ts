import { getDecryptedCredentials } from '../src/repositories/integrationsRepo.js';
import { refreshAccessToken } from '../src/integrations/google/googleAdsAuth.js';
import { GoogleAdsClient } from '../src/integrations/google/googleAdsClient.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';

async function main() {
  const stored = await getDecryptedCredentials<{ refreshToken: string; customerId: string }>(CLIENT_ID, 'google_ads');
  if (!stored) throw new Error('no google ads connection');

  const refreshed = await refreshAccessToken(stored.credentials.refreshToken);
  const client = new GoogleAdsClient(refreshed.accessToken, stored.credentials.customerId);

  let totalCostMicros = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let rowCount = 0;

  for await (const page of client.streamDailyMetrics('2026-07-25', '2026-08-23')) {
    for (const row of page as any[]) {
      totalCostMicros += Number(row.metrics.costMicros ?? 0);
      totalImpressions += Number(row.metrics.impressions ?? 0);
      totalClicks += Number(row.metrics.clicks ?? 0);
      rowCount++;
    }
  }

  console.log('rows:', rowCount);
  console.log('total spend (from micros):', totalCostMicros / 1_000_000);
  console.log('total impressions:', totalImpressions);
  console.log('total clicks:', totalClicks);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
