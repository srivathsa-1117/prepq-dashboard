import { httpJson } from '../src/utils/httpClient.js';

async function main() {
  const token = process.env.META_SYSTEM_USER_ACCESS_TOKEN;
  if (!token) throw new Error('no token');

  const response = await httpJson<{ data: any[] }>(`https://graph.facebook.com/v20.0/act_1892794114540071/adcreatives`, {
    method: 'GET',
    label: 'check',
    query: { access_token: token, fields: 'id,object_type,object_story_spec', limit: 500 },
  });

  console.log('total:', response.data.length);
  const carousels = response.data.filter((c) => c.object_story_spec?.link_data?.child_attachments);
  console.log('carousel count:', carousels.length);
  if (carousels[0]) console.log(JSON.stringify(carousels[0], null, 2));

  const objectTypes = [...new Set(response.data.map((c) => c.object_type))];
  console.log('object_types seen:', objectTypes);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
