<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/SkylinePulseDark-removebg-preview.png">
  <img src="assets/SkylinePulseLight-removebg-preview.png" alt="Skyline Pulse" width="320">
</picture>

# Skyline Pulse

**A clearer picture of every gathering at Skyline Church NJ.**

Skyline Pulse brings service attendance, worship and engagement feedback, production readiness, and Planning Center information into one place. Teams can log what happened, review trends, and share reports throughout the week.

[Open the app](https://skylinechurch.tech) · [Project overview](https://bstef.com/skylinechurchpulse/) · [User guide](https://skylinechurch.tech/docs/guide.html) · [Report an issue](https://github.com/bstef/skylinechurchpulse/issues)

The live app is protected by **Cloudflare Access**. Production has used **Cloudflare D1** since October 22, 2026; Supabase is retained read-only for migration recovery.

[Features](#features) · [Local development](#local-development) · [Deployment](#deployment) · [Scheduled jobs](#scheduled-jobs) · [Monitoring](#monitoring) · [Data and recovery](#data-and-recovery) · [Mobile app](#mobile-app)

## Features

| Area | What teams can do |
|---|---|
| Sunday Services | Log attendance, unity, engagement, sound, service flow, host feedback, and notes. Open saved details from the matching Planning Center plan. |
| Production | Track role coverage, slides, missed cues, and production feedback. |
| SkyYouth | Keep youth services and their Planning Center plans in a dedicated view. |
| Serving and Church Stats | Review Planning Center responses and attendance information from connected integrations. |
| Calendar | Find logged services and plans by date, with day and month views. |
| Analytics | Review attendance, experience scores, production trends, and logging activity. |
| Reports | Export CSV and PDF tables, print reports, and email reports to configured recipients. |
| Appearance | Switch between Light, Dark, and Ocean themes. |

Manually logged services without a Planning Center plan ID are recognized by matching their date and known service time. This keeps existing records visible and prevents duplicate “needs details” calendar reminders.

## How it works

The browser calls same-origin Pages Functions for data and integrations. Functions validate the user's Cloudflare Access session and inputs, then query D1 with prepared statements. Planning Center and email credentials stay on the server.

| Component | Responsibility |
|---|---|
| Cloudflare Pages | Hosts the interface and `/api/` Functions. |
| Production D1 | Stores service and production records, report recipients, email history, and preserved legacy data. |
| Planning Center | Supplies plans, attendance prefill, and volunteer-response information through server-side proxies. |
| Resend | Delivers authorized reports and the weekly digest. |
| Weekly digest Worker | Reads production D1 directly and sends the Monday report. |
| Metrics Worker | Sends aggregate D1 analytics to Datadog every five minutes. |
| Staging refresh Worker | Copies production data to the separate staging database nightly. |

The scheduled jobs run on Cloudflare. They do not require a local computer, n8n, or a Proxmox host.

## Local development

Use **Node.js 24 or newer** and npm. Local D1 uses SQLite; local development does not need production database credentials.

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Create a git-ignored `.dev.vars` file in the repository root:

   ```dotenv
   LOCAL_DEV="true"
   EMAIL_ENABLED="false"
   ```

3. Create the local database schema:

   ```sh
   npm run db:local
   ```

4. Build the static assets:

   ```sh
   npm run build
   ```

5. Start the local app:

   ```sh
   npm run dev
   ```

Open [localhost:8788](http://localhost:8788). Rebuild after changing static files. Planning Center features need local `PCO_APP_ID` and `PCO_SECRET` values in `.dev.vars`; manual logging works without them.

`LOCAL_DEV=true` only permits the localhost development exception. Deployed APIs still require a valid, signed Access assertion.

### Checks

Run the unit and integration suite:

```sh
npm test
```

After `npm run build`, exercise the Pages Functions in the native workerd/D1 runtime:

```sh
npm run test:runtime
```

Exercise staging refresh and rollback against native local D1 databases:

```sh
npm run test:staging-sync-runtime
```

Tests use synthetic records and stub email delivery. They do not modify production or send email to church staff.

## Deployment

The production Pages project deploys from `main` with **build command `npm run build`** and **output directory `dist`**. The build publishes only intended static assets; application snapshots, SQL, source modules, tests, and dependencies stay out of the public output.

| Environment | Configuration | Database | Email |
|---|---|---|---|
| Production — `skylinechurchpulse` | `wrangler.jsonc` | `skyline-pulse-production` | Enabled |
| Production project previews | `wrangler.jsonc` → `env.preview` | `skyline-pulse-staging` | Disabled |
| Dedicated staging — `skyline-pulse-d1-staging` | `wrangler.staging.jsonc` | `skyline-pulse-staging` | Disabled |

The dedicated staging project's automatic deployments are paused. Its database still receives the nightly refresh. Staging and preview deployments must retain Cloudflare Access protection and their separate database binding.

### App configuration

| Binding or variable | Purpose |
|---|---|
| `DB` | Native D1 binding for the deployment's database. |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | Cloudflare Access issuer and application audience. |
| `ACCESS_MOBILE_CLIENT_ID` | Client ID of the Access for SaaS (OIDC) application used by the mobile apps. Unset keeps `/api/mobile/*` closed. See [mobile API](docs/MOBILE-API.md). |
| `LOCAL_DEV` | `false` on every deployment. |
| `EMAIL_ENABLED` | `true` for production email; `false` for staging and previews. |
| `WRITES_ENABLED` | Set to `false` during maintenance to block data mutations while retaining reads. |
| `PCO_APP_ID`, `PCO_SECRET` | Planning Center integration credentials, stored as secrets. |
| `RESEND_API_KEY` | Production email credential, stored as a secret. |

Protect the main hostname and deployment aliases with Access. The API also verifies JWT signatures, issuer, audience, and expiry; writes require a matching Origin header. Never commit credentials or private exports.

The mobile apps call the same handlers under `/api/mobile/*` with a bearer token instead of the Access cookie. That path is the only one bypassed at the Access edge, and every request on it is verified in the function. See [mobile API](docs/MOBILE-API.md) for the dashboard setup.

Planning Center credentials require the integration account's necessary Services, Check-Ins, and People permissions. Integration failures are shown in the app; they do not prevent manual logging.

## Scheduled jobs

Workers are deployed **separately** from the Pages website. Each has its own configuration and bindings.

| Worker | Schedule | Configuration |
|---|---|---|
| `skyline-pulse-weekly-digest` | Monday, **8 a.m. Eastern** | `cron-worker/wrangler.jsonc` |
| `skyline-pulse-d1-metrics` | Every **5 minutes** | `monitoring/wrangler.jsonc` |
| `skyline-pulse-staging-sync` | Daily, **3 a.m. Eastern** | `staging-sync/wrangler.jsonc` |

The digest uses explicit `MON` cron expressions (`0 12 * * MON` and `0 13 * * MON`) and checks the scheduled Eastern weekday/hour. Cloudflare numbers Sunday as `1`, so weekday names avoid ambiguity. The nightly staging refresh also uses paired UTC schedules with an America/New_York time guard for daylight saving changes.

Deploy only the Worker you changed:

```sh
npx wrangler deploy --config cron-worker/wrangler.jsonc
```

```sh
npx wrangler deploy --config monitoring/wrangler.jsonc
```

```sh
npx wrangler deploy --config staging-sync/wrangler.jsonc
```

### Reports and weekly digest

Website report sends require `EMAIL_ENABLED=true`, `CF_PAGES_BRANCH=main`, and the Resend secret. The digest uses its own production D1 binding and email secret. Recipients come from D1, and email history records success or failure. The staging digest configuration has no schedules and disables email.

Use stubbed delivery for development. A real test send requires an explicitly approved recipient.

### Nightly staging refresh

Production is the source of truth. Each refresh copies all five application tables **from production to staging**, verifies full record contents, and replaces staging test changes. It never copies staging edits back into production.

The refresh checks matching schemas, uses a staging transaction, and logs a recovery bookmark before replacing records. Pause it with `SYNC_ENABLED=false` when staging test data needs to survive overnight. Changes after a snapshot wait until the next refresh; this is not continuous replication.

See [staging refresh operations](docs/STAGING-SYNC.md) for verification, safety limits, recovery, and deployment. The schedule is deployed; its first overnight run was pending at setup on October 22, 2026.

## Monitoring

- [Cloudflare production D1 dashboard](https://dash.cloudflare.com/87d75a85659dd39b348acf458b75b606/workers/d1/databases/ebaf7a80-ec0c-430c-a782-bae2cd427cb2/metrics): queries, rows read/written, latency, and storage.
- [Datadog — Database & Site Activity](https://app.datadoghq.com/dashboard/fe3-pye-rhj): 12 saved panels for D1 activity, latency, storage, collector health, and site traffic.

Datadog ingestion was verified on October 22, 2026 using successful collector logs and fresh heartbeat/storage metrics. The collector exports aggregate analytics only; it has no D1 binding and sends no service notes, personal details, or SQL text to Datadog.

D1 counts in Datadog are **rolling 15-minute gauges**, not additive daily totals. Storage is the maximum observed over 24 hours. Idle latency panels may be blank. Health endpoints report configuration; use Worker logs and fresh Datadog points to confirm successful delivery.

See [monitoring setup and verification](docs/MONITORING.md) for credential rotation, metric definitions, and troubleshooting.

## Data and recovery

D1 is the active database. Supabase is retained read-only as a migration recovery source; it does not receive new production writes.

| Resource | Purpose |
|---|---|
| `migrations/` | Versioned D1 schema migrations. |
| `db/schema.sql` | Historical Supabase reference; not a complete live schema or recovery script. |
| `scripts/prepare-migration.mjs` | Validates private migration snapshots, prepares recovery SQL, and verifies SQLite restore parity. |
| `docs/D1-MIGRATION.md` | Cutover audit, integrity checks, write freeze, and rollback procedure. |

Keep independent private exports alongside D1's managed recovery features. Backups belong outside the public build and Git. Reconcile any new D1 records before a rollback to Supabase; reverting website code alone does not migrate data back.

A read-only audit on October 22, 2026 found all five production application tables matched Supabase field for field. Both October 18 services were present; their apparent absence was a plan-matching display bug, now fixed. Staging was subsequently refreshed and verified against production.

## Repository map

```text
index.html                  Interface, charts, calendars, and report views
assets/                     Branding and same-origin data client
functions/api/              Protected data and integration endpoints
lib/                        D1 access and authentication helpers
migrations/                 D1 schema migrations
cron-worker/                Monday email digest
monitoring/                 Aggregate D1 metrics collector
staging-sync/               Nightly production-to-staging refresh
tests/                      Automated checks and native D1 exercises
scripts/                    Static build and migration preparation
docs/                       Project page, user guide, and operating notes
```

## Mobile app

The iOS and Android app lives in [`mobile/`](mobile/README.md) and is built with Expo. It signs in through a separate Access for SaaS (OIDC) application and calls the bearer-token routes under `/api/mobile/*` (see [mobile API](docs/MOBILE-API.md)). It has its own dependencies and tests (`cd mobile && npm ci && npm test`) and is not part of the Pages build.
