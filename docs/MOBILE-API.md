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

Do each part for **staging/previews first**, test there, and only then repeat for production. Use a separate OIDC application for each environment so a staging token never works in production. Button names match the Cloudflare dashboard as of October 2026.

### Part 1: create the OIDC application

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/), go to **Zero Trust** → **Access controls** → **Applications**.
2. Select **Create new application** → **SaaS application**.
3. In the **Application** field, type a custom name such as `Skyline Pulse Mobile (staging)`. Skyline Pulse isn't in the drop-down list, so **select the textbox that appears below the field** to use your custom name.
4. Select **OIDC**, then select **Add application**. The rest of the settings appear only after this step.
5. **Scopes**: keep `openid`, `email` and `profile`. Remove `groups` (Pulse doesn't use it).
6. **Redirect URLs**: enter `skylinepulse://auth`. This is the address the phone app returns to after sign-in, and the mobile app will be set up to match it.
7. Turn on **Proof of Key Exchange (PKCE)**. If you also see **PKCE without client secret**, turn that on too: the phone app can't keep a secret safe, so it signs in with PKCE alone.
8. Copy the **Client ID**. You'll need it in Part 3. The **Client secret** isn't used, so don't store it anywhere.
9. **Access policies**: select the same existing policies that the Skyline Pulse application uses, so the same people are allowed.
10. **Identity providers**: select the same login method(s) as the Skyline Pulse application.
11. Select **Create**.

### Part 2: let mobile requests through the edge

The existing Skyline Pulse application covers the whole site, so Access would turn away the phone app before the API could check its token. A second, narrower application lets just the mobile API path through.

1. Go to **Zero Trust** → **Access controls** → **Applications** → **Create new application** → **Self-hosted and private** → **Add public hostname**.
2. Name it `Skyline Pulse Mobile API (staging)`.
3. Set the hostname to match the existing Skyline Pulse application (production: `skylinechurch.tech`), and set **Path** to `api/mobile/*`. The `*` matters: without it, only the exact path `api/mobile` is covered.
4. Under **Access policies**, create a new policy with **Action: Bypass** and an **Include** rule of **Everyone**.
5. Select **Create**.

This is safe only because `authorizeMobile()` verifies every request on this path. Don't bypass any other path. Access uses the most specific matching path, so the rest of the site stays protected. Note that Access doesn't log bypassed requests.

**Previews:** if the existing preview application covers `*.skylinechurchpulse.pages.dev` and that hostname isn't in the **Domain** drop-down, open the existing preview application and copy its hostname setup exactly, adding the `api/mobile/*` path.

### Part 3: set the client ID

`wrangler.jsonc` is the source of truth for Pages variables, so add the value there. It is a public identifier, not a secret. For staging, add `"ACCESS_MOBILE_CLIENT_ID": "<staging client id>"` under `env.preview.vars`, then deploy a preview.

### Part 4: verify, then repeat for production

1. Request `https://<preview host>/api/mobile/status` with no token. It should return **`401`**. If you're sent to a login page instead, the bypass application from Part 2 isn't matching the path.
2. Sign in with a real token and confirm a read returns `200`. The mobile app phase provides the easiest way to get one.
3. Confirm the browser site still works and still asks for sign-in.
4. For production, repeat Parts 1–3 with a new OIDC application, a bypass on `skylinechurch.tech` with path `api/mobile/*`, and `ACCESS_MOBILE_CLIENT_ID` under the top-level `vars`.

### Confirm during staging setup

Cloudflare's docs confirm the issuer (`https://<team>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client id>`) and key endpoint (`.../jwks`) that `authorizeMobile()` uses. Two details are still unconfirmed:

- **Custom-scheme redirect.** Check that **Redirect URLs** accepts `skylinepulse://auth`. If it requires `https`, the app will use an `https://skylinechurch.tech/...` app link instead.
- **Signing algorithm.** Access session tokens are RS256. If the OIDC ID token uses another algorithm, update `verifyAccessToken()` and its tests.

## Local development

With `LOCAL_DEV=true`, localhost requests skip sign-in on both browser and mobile routes, matching the existing browser exception. Point a simulator at `http://localhost:8788/api/mobile/...`. Deployed environments always require a valid token.
