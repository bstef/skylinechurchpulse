# Mobile API

The iOS and Android apps use the same Pages Functions and D1 database as the website. They reach them under **`/api/mobile/*`** and sign in with a bearer token, because native apps cannot hold the Cloudflare Access cookie that the browser uses.

Mobile sign-in stays **off** until `ACCESS_MOBILE_CLIENT_ID` is set. Until then every `/api/mobile/*` request returns `401`. The website is unaffected either way.

## How it works

| Step | What happens |
|---|---|
| 1 | The app opens the Access sign-in page in the phone's system browser (OAuth authorization code flow with PKCE). |
| 2 | The person signs in exactly as they do on the website. A separate **Access for SaaS (OIDC)** application decides who is allowed. |
| 3 | The app receives an ID token and sends it on each request: `Authorization: Bearer <id_token>`. |
| 4 | `functions/api/_middleware.js` sees the `/api/mobile/` prefix and calls `authorizeMobile()` in `lib/access.js` to verify the token. |
| 5 | The request runs the same handler as the matching browser route. |

`authorizeMobile()` accepts only RS256 tokens signed by the OIDC application's key set, with the following claims:

| Claim | Required value |
|---|---|
| `iss` | `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/sso/oidc/<ACCESS_MOBILE_CLIENT_ID>` |
| `aud` | `ACCESS_MOBILE_CLIENT_ID` |
| `exp`, `iat`, `sub` | Present, and the token is unexpired |

A browser Access assertion is rejected on mobile routes, and a mobile token is rejected on browser routes.

Mobile routes skip the Origin check. That check protects cookie sessions from cross-site requests, and a browser never attaches a bearer token on its own. CORS is intentionally not enabled, so other websites still cannot call the API from a browser.

## Routes

| Mobile route | Browser route it reuses |
|---|---|
| `/api/mobile/data/<table>[/<id>]` | `/api/data/...` (same validation, pagination and maintenance mode) |
| `/api/mobile/pco-plans` | `/api/pco-plans` |
| `/api/mobile/pco-stats` | `/api/pco-stats` |
| `/api/mobile/status` | `/api/status` |
| `/api/mobile/send-report-email` | `/api/send-report-email` (still production-only, and still requires `EMAIL_ENABLED`) |

The temporary `pco-checkins-debug` endpoint is deliberately not exposed to mobile. To add a route, re-export the browser handler under `functions/api/mobile/` and add it to `tests/mobile-auth.test.js`.

## Cloudflare setup (dashboard, staging first)

Do each step for **staging/previews first**, test there, and only then repeat for production. Use a separate OIDC application for each environment so a staging token never works in production.

1. **Create the OIDC application.** In Zero Trust, go to Access → Applications → Add an application → **SaaS** → **OIDC**.
   - Name: `Skyline Pulse Mobile (staging)`.
   - Redirect URL: the app's sign-in callback, for example `skylinepulse://auth`. The mobile app phase sets the exact value.
   - Turn **PKCE** on. The app is a public client and does not store a client secret.
   - Scopes: `openid`, `email`, `profile`.
   - Policies: copy the policies from the existing Skyline Pulse Access application so the same people are allowed.
   - Copy the **Client ID**.
2. **Let mobile requests through the edge.** Add a self-hosted Access application for the API path only:
   - Domain and path: `<hostname>/api/mobile/` (staging: the preview hostname; production: `skylinechurch.tech`).
   - Policy action: **Bypass**, for everyone.

   This is safe only because `authorizeMobile()` verifies every request. Do not bypass any other path. Access uses the most specific matching path, so the rest of the site stays protected.
3. **Set the client ID.** `wrangler.jsonc` is the source of truth for Pages variables, so add the value there. It is a public identifier, not a secret. For staging, add `"ACCESS_MOBILE_CLIENT_ID": "<staging client id>"` under `env.preview.vars`, deploy a preview, and test.
4. **Verify on staging.** Send a request without a token and confirm it returns `401`. Sign in with a real token and confirm a read returns `200`. Confirm the browser site still works.
5. **Repeat for production.** Use a new OIDC application, the `skylinechurch.tech/api/mobile/` bypass, and `ACCESS_MOBILE_CLIENT_ID` under the top-level `vars`.

### Confirm during staging setup

These details come from Cloudflare's OIDC conventions but haven't been tested against a live Access OIDC application yet:

- **Signing algorithm.** The ID token is expected to be signed with RS256. If staging tokens use another algorithm, update `verifyAccessToken()` and its tests.
- **Endpoints.** The issuer and JWKS URLs shown in the OIDC application's settings are expected to match `.../cdn-cgi/access/sso/oidc/<client id>` and `.../jwks`.

## Local development

With `LOCAL_DEV=true`, localhost requests skip sign-in on both browser and mobile routes, matching the existing browser exception. Point a simulator at `http://localhost:8788/api/mobile/...`. Deployed environments always require a valid token.
