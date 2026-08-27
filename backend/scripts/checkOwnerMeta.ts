import { httpJson } from '../src/utils/httpClient.js';
import { env } from '../src/config/env.js';

async function main() {
  const baseUrl = (env.MERITTO_API_BASE_URL ?? '').replace(/\/lead\/v1\/?$/, '');
  const response = await httpJson<any>(`${baseUrl}/lead/v1/getMetaData`, {
    method: 'GET',
    label: 'check-owner-meta',
    headers: { 'access-key': env.MERITTO_API_KEY ?? '', 'secret-key': env.MERITTO_API_SECRET ?? '', accept: 'application/json' },
    retry: { maxAttempts: 1 },
  });

  const ownerField = response.data.list.find((f: any) => f.field_key === 'owner');
  console.log('owner field:', JSON.stringify(ownerField, null, 2));

  const allFieldKeys = response.data.list.map((f: any) => f.field_key);
  console.log('\nall field keys:', JSON.stringify(allFieldKeys));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
