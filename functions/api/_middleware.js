import { authorize, authorizeMobile, sameOriginWrite } from '../../lib/access.js';
const MOBILE_PREFIX = '/api/mobile/';
export async function onRequest(context) {
  const mobile = new URL(context.request.url).pathname.startsWith(MOBILE_PREFIX);
  try { await (mobile ? authorizeMobile : authorize)(context.request, context.env); }
  catch { return Response.json({ error: { message: 'Sign in to Skyline Pulse to continue.' } }, { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
  // The Origin check protects cookie sessions; browsers never attach a bearer token on their own.
  if (!mobile && !sameOriginWrite(context.request)) return Response.json({ error: { message: 'Forbidden' } }, { status: 403 });
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, headers });
}
