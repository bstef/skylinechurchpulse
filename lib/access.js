import { createRemoteJWKSet, jwtVerify } from 'jose';

function isLocalDev(request, env) {
  return env.LOCAL_DEV === 'true' && ['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname);
}
function teamDomain(env) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) throw new Error('Invalid Access configuration');
  return domain;
}

// Require a signed Access assertion even on an unprotected Pages preview URL.
// Missing configuration fails closed; localhost is the only development exception.
export async function authorize(request, env) {
  if (isLocalDev(request, env)) return;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new Error('Access is not configured');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new Error('Authentication required');
  const issuer = `https://${teamDomain(env)}`;
  await verifyAccessToken(token, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)), issuer, env.ACCESS_AUD);
}

// Native apps cannot hold the Access cookie, so they sign in through a separate
// Access for SaaS OIDC application and send its ID token as a bearer token.
// Access does not guard /api/mobile/* at the edge, so this check is the only gate.
export async function authorizeMobile(request, env) {
  if (isLocalDev(request, env)) return;
  const clientId = env.ACCESS_MOBILE_CLIENT_ID;
  if (!env.ACCESS_TEAM_DOMAIN || !clientId) throw new Error('Mobile sign-in is not configured');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) throw new Error('Invalid Access configuration');
  const token = /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (!token) throw new Error('Authentication required');
  const issuer = `https://${teamDomain(env)}/cdn-cgi/access/sso/oidc/${clientId}`;
  await verifyAccessToken(token, createRemoteJWKSet(new URL(`${issuer}/jwks`)), issuer, clientId);
}
export async function verifyAccessToken(token, keys, issuer, audience) {
  return jwtVerify(token, keys, {
    issuer, audience, algorithms: ['RS256'], requiredClaims: ['exp','iat','sub'],
  });
}
export function sameOriginWrite(request) {
  if (['GET', 'HEAD'].includes(request.method)) return true;
  return request.headers.get('Origin') === new URL(request.url).origin;
}
