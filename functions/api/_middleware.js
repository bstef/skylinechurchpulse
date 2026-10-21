import { authorize, sameOriginWrite } from '../../lib/access.js';
export async function onRequest(context) {
  try { await authorize(context.request, context.env); }
  catch { return Response.json({ error: { message: 'Sign in to Skyline Pulse to continue.' } }, { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
  if (!sameOriginWrite(context.request)) return Response.json({ error: { message: 'Forbidden' } }, { status: 403 });
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}
