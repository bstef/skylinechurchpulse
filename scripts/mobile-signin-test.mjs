// One-off staging check for mobile sign-in, run on your own computer:
//   node scripts/mobile-signin-test.mjs [api-base-url]
// Signs in through the staging Access OIDC application in your browser (PKCE, no
// client secret), then calls /api/mobile/status with the ID token. The token is
// kept in memory only and never printed. Requires http://localhost:8790/callback
// in the staging application's Redirect URLs; never add it to production.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const TEAM_DOMAIN = 'peacockengr.cloudflareaccess.com';
const CLIENT_ID = process.env.ACCESS_MOBILE_CLIENT_ID || 'bb39f8e5c6f0929db4bf8bf50b138c6ff347f2d78f20c73b94e4f7078816864d';
const ISSUER = process.env.OIDC_ISSUER || `https://${TEAM_DOMAIN}/cdn-cgi/access/sso/oidc/${CLIENT_ID}`;
const API_BASE = (process.argv[2] || process.env.PULSE_API || 'https://claude-inspiring-noether-ejq.skylinechurchpulse.pages.dev').replace(/\/$/, '');
const PORT = 8790;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const TIMEOUT_MS = 5 * 60 * 1000;

const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('base64url');

function openBrowser(url) {
  if (process.env.NO_BROWSER) return;
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const finish = (message, result) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message + '\nYou can close this tab.');
        server.close(); clearTimeout(timer);
        result instanceof Error ? reject(result) : resolve(result);
      };
      if (url.searchParams.get('state') !== state) return finish('Sign-in failed: state mismatch.', new Error('State mismatch; restart the test.'));
      if (url.searchParams.get('error')) return finish('Sign-in failed.', new Error(`Access returned ${url.searchParams.get('error')}: ${url.searchParams.get('error_description') || ''}`));
      const code = url.searchParams.get('code');
      if (!code) return finish('Sign-in failed: no code.', new Error('No authorization code in the callback.'));
      finish('Signed in. Return to the terminal.', code);
    });
    const timer = setTimeout(() => { server.close(); reject(new Error('Timed out waiting for sign-in.')); }, TIMEOUT_MS);
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1');
  });
}

async function exchange(code) {
  const response = await fetch(`${ISSUER}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: verifier }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id_token) throw new Error(`Token exchange failed (${response.status}): ${body.error || 'no id_token'} ${body.error_description || ''}`);
  return body;
}

// The app stays signed in by trading the refresh token for a new ID token, as it does here.
async function refresh(refreshToken) {
  const response = await fetch(`${ISSUER}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID }),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok && !!body.id_token, status: response.status, body };
}

function describe(token) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  return { alg: header.alg, iss: claims.iss, aud: claims.aud, email: claims.email, expires: new Date(claims.exp * 1000).toISOString(), lifetimeMinutes: Math.round((claims.exp - claims.iat) / 60) };
}

async function status(headers = {}) {
  const response = await fetch(`${API_BASE}/api/mobile/status`, { headers, redirect: 'manual' });
  return { status: response.status, body: (await response.text()).slice(0, 300) };
}

const authorize = new URL(`${ISSUER}/authorization`);
for (const [key, value] of Object.entries({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256' })) authorize.searchParams.set(key, value);

try {
  const pending = waitForCode();
  console.log(`Opening the Cloudflare sign-in page. If no browser opens, visit:\n${authorize}\n`);
  openBrowser(authorize.href);
  const tokens = await exchange(await pending);
  const token = tokens.id_token;
  console.log('ID token received:', describe(token));
  const without = await status();
  console.log(`\nWithout a token:  ${without.status} ${without.body}`);
  const withToken = await status({ Authorization: `Bearer ${token}` });
  console.log(`With the token:   ${withToken.status} ${withToken.body}`);
  const passed = without.status === 401 && withToken.status === 200;
  console.log(passed ? '\nPASS: mobile sign-in works end to end.' : '\nFAIL: expected 401 without a token and 200 with it.');
  if (!tokens.refresh_token) {
    console.log('\nStaying signed in: NOT YET. No refresh token was issued, so the app will ask for a new email code when this ID token expires.');
    console.log('Turn on "Refresh token lifetime" in the staging SaaS app\'s Advanced settings (see docs/MOBILE-API.md), then run this again.');
  } else {
    const renewed = await refresh(tokens.refresh_token);
    const again = renewed.ok ? await status({ Authorization: `Bearer ${renewed.body.id_token}` }) : null;
    const staysSignedIn = renewed.ok && again.status === 200;
    console.log(staysSignedIn
      ? `\nStaying signed in: PASS. The refresh token renewed the sign-in without a new code (new ID token lasts ${describe(renewed.body.id_token).lifetimeMinutes} min) and the API accepted it.`
      : `\nStaying signed in: FAIL. Refresh returned ${renewed.status} ${renewed.body.error || ''}${again ? `; API said ${again.status}` : ''}.`);
    if (!staysSignedIn) process.exitCode = 1;
  }
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error('\nFAIL:', error.message);
  process.exitCode = 1;
}
