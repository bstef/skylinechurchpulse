# Skyline Pulse

Weekly service intelligence for Skyline Church NJ: attendance, worship unity, audience engagement, production, Planning Center plans and responses, analytics, and reports.

> **Production runs on Cloudflare D1 as of October 22, 2026.** [Open Skyline Pulse](https://skylinechurch.tech) · [Migration and recovery notes](docs/D1-MIGRATION.md). Supabase is retained read-only for recovery.

## Architecture

- `index.html`: existing interface and charts; reads/writes the same-origin `/api/data/` API.
- Cloudflare Pages Functions: validates Cloudflare Access JWTs, validates inputs, and queries D1 with prepared statements. Database credentials are not shipped to the browser.
- D1: service/production records, report recipients, email history, and a preserved legacy host table.
- Planning Center: existing Pages Functions proxy Services, Check-Ins, and People. API credentials remain server-side.
- Resend: optional report emails and weekly digest; disabled unless explicitly enabled.
- `cron-worker/`: separately deployed weekly digest Worker, reading D1 directly through its binding. It does not need to bypass Access on the website.

## Development and checks

Requires Node 24 or newer for the built-in SQLite unit tests.

```sh
npm ci
npm test
npm run build
npm run test:runtime
npm run db:local
npm run dev
```

For local development only, create a git-ignored `.dev.vars`:

```text
LOCAL_DEV="true"
EMAIL_ENABLED="false"
```

The localhost auth exception is ignored for deployed hostnames. Without a signed Access assertion, deployed API requests fail closed.

`npm run build` copies only the intended static files into `dist/`. Source code, exports, SQL, tests, dependencies and migration notes are excluded. Pages must use **build command `npm run build`** and **output directory `dist`**.

`npm run test:runtime` compiles the Pages Functions and exercises them inside workerd with native D1. Tests use synthetic records and stub outbound email; they do not email church staff or change production data.

## Bindings and authentication

The checked-in `wrangler.jsonc` targets the live **skylinechurchpulse** Pages project and **skyline-pulse-production** D1 database. Its preview environment uses the separate staging database with email disabled. `wrangler.staging.jsonc` targets the isolated, Access-protected **skyline-pulse-d1-staging** project.

Required variables/bindings:

| Name | Purpose |
|---|---|
| `DB` | Native D1 database binding; staging and production must be separate |
| `ACCESS_TEAM_DOMAIN` | Existing Cloudflare Access team hostname |
| `ACCESS_AUD` | Audience of the Access application protecting this deployment |
| `LOCAL_DEV` | `false` for deployments |
| `EMAIL_ENABLED` | `true` in production; `false` for all staging/preview deployments |
| `WRITES_ENABLED` | `true` normally; `false` temporarily blocks data mutations during maintenance |
| `PCO_APP_ID`, `PCO_SECRET` | Planning Center Personal Access Token, set as secrets |
| `RESEND_API_KEY` | Production email sending secret only |

Access must protect both the main hostname and deployment aliases. The Functions also validate token signature, issuer, audience, and expiry to protect direct requests to an accidentally unprotected alias. Mutations require a matching Origin header. Do not replace this with a trusted header or unsigned JWT check.

## Planning Center

Create a Personal Access Token in Planning Center with the existing integration account's necessary Services, Check-Ins and People permissions. Set `PCO_APP_ID` and `PCO_SECRET` in each environment that needs live integration, then redeploy. Never commit credentials.

The existing proxy functions retain service-type filtering, plan-to-service-time matching, attendance prefill, historical plan loading, and volunteer-response grouping. Integration sections show an error if credentials/permissions are unavailable; manual service logging and the D1 ledger remain available.

## Email and scheduled digest

Pages report sends require **both** `EMAIL_ENABLED=true` and `CF_PAGES_BRANCH=main`, plus the D1 binding and `RESEND_API_KEY`. Preview calls are rejected even if a sending key is accidentally present. Recipients come from D1; success/failure history is written to `email_log`.

The digest Worker has its own binding to the same production D1 database and its own secrets. `cron-worker/wrangler.jsonc` targets **skyline-pulse-weekly-digest**, with email enabled and both Monday UTC schedules (`0 12 * * 1` / `0 13 * * 1`). The handler sends only at 8 AM America/New_York to account for DST. Deploy it separately with `npx wrangler deploy --config cron-worker/wrangler.jsonc`. `cron-worker/wrangler.staging.jsonc` has no schedules and disables email.

Do not run a manual digest against real recipients for a migration test. Verify with stubbed outbound requests first; a real test email needs explicit recipient/send authorization.

## Data and recovery

- `migrations/`: D1 schema migrations. Apply in order to a new database.
- `db/schema.sql`: historical Supabase schema, retained for reference; it does not represent every live legacy column. Do not run it as a migration/recovery script.
- `scripts/prepare-migration.mjs`: validates a private source snapshot, prepares D1 inserts and PostgreSQL recovery SQL, restores to SQLite, and computes per-table verification hashes. Output belongs in git-ignored `exports/`, never in static assets or Git.
- Keep independent exports as well as D1's managed recovery features. Test recovery before relying on it.

See [D1-MIGRATION.md](docs/D1-MIGRATION.md) for the source audit, staging IDs, validation results, write-freeze procedure, and rollback considerations.
