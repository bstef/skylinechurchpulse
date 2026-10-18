import { createRemoteJWKSet, jwtVerify } from 'jose';

// Require a signed Access assertion even on an unprotected Pages preview URL.
// Missing configuration fails closed; localhost is the only development exception.
export async function authorize(request, env) {
  const url = new URL(request.url);
  if (env.LOCAL_DEV === 'true' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)) return;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new Error('Access is not configured');
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) throw new Error('Invalid Access configuration');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new Error('Authentication required');
  const issuer = `https://${domain}`;
  await jwtVerify(token, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)), {
    issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp','iat','sub'],
  });
}
export function sameOriginWrite(request) {
  if (['GET', 'HEAD'].includes(request.method)) return true;
  return request.headers.get('Origin') === new URL(request.url).origin;
}
