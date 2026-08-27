/**
 * One-off connect runner - calls connectIntegration() directly with the system user access
 * token from backend/.env, bypassing the browser/OAuth flow entirely (there's no code path for
 * that here, since a system user token is a direct credential, not a redirect result). Not part
 * of the app's request path; delete once you've connected via the Integrations drawer's "Connect
 * with token" field instead, or once this has run successfully once.
 */
import { connectIntegration } from '../src/services/integrationService.js';
import { env } from '../src/config/env.js';

const CLIENT_ID = '5b49fb30-931a-4845-a5ca-1c624422b1a1';
const TRIGGERED_BY = '13884f07-a4cd-4744-bc76-865e45d1f536'; // srivathsa@thedarenetwork.com

async function main() {
  // Not in config/env.ts's validated schema - deliberately a reference-only slot (see
  // .env.example's comment), so read it straight off process.env here rather than the app-wide
  // env object.
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) {
    throw new Error('META_SYSTEM_USER_ACCESS_TOKEN is not set in backend/.env');
  }

  const integration = await connectIntegration(
    CLIENT_ID,
    'meta',
    { apiKey: token, externalAccountId: env.META_DEFAULT_AD_ACCOUNT_ID || undefined },
    TRIGGERED_BY,
  );
  console.log(JSON.stringify(integration, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
