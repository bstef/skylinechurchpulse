export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error:'Database is not configured.' }, { status:503 });
  await env.DB.prepare('SELECT 1 AS ok').first();
  return Response.json({
    database:'d1',
    preview:env.CF_PAGES_BRANCH !== 'main',
    emailEnabled:env.EMAIL_ENABLED === 'true' && env.CF_PAGES_BRANCH === 'main',
    planningCenterConfigured:!!(env.PCO_APP_ID && env.PCO_SECRET),
  });
}
