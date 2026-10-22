# Nightly staging data refresh

Production is the source of truth. The separate `skyline-pulse-staging-sync` Worker refreshes all five application tables from **production to staging only**, nightly at **3:00 a.m. America/New_York**. The UTC 07:00 and 08:00 schedules include an Eastern-time guard, so only the correct trigger runs each day across daylight saving changes. It runs on Cloudflare; no local computer is required.

Staging test entries and edits are replaced on the next refresh. Never rely on staging as the permanent home of real service records. Production is never updated from staging. This is a daily snapshot, not continuous replication: changes made after the refresh appear the following night.

## Databases and behavior

| Binding | Database | ID | Code usage |
|---|---|---|---|
| `PRODUCTION_DB` | skyline-pulse-production | ebaf7a80-ec0c-430c-a782-bae2cd427cb2 | SELECT statements only |
| `STAGING_DB` | skyline-pulse-staging | 2fed3452-8682-47d6-80a5-f230b4a9ce1e | Read and replace changed tables |

The Worker reads a consistent production batch, compares complete records (including IDs, timestamps, nulls and legacy fields), and skips unchanged tables. It checks matching table/index/trigger definitions before writing. Changed staging tables are replaced in one D1 transaction; an insert failure rolls back the deletes. A second complete comparison confirms the staged data equals the captured production snapshot. New production edits after that snapshot wait for the next run.

Before a replacement, the Worker logs a staging recovery bookmark as `staging_refresh_before`. Keep this bookmark if recovering overwritten test data using D1 Time Travel. It logs only status, table names, row counts and the bookmark, never record contents or SQL parameters. No email service, API credential or external destination is configured on this Worker. The native bindings themselves are not read-only credentials; the production SELECT-only boundary is enforced in the code and covered by tests.

Schema mismatch, an empty production service table, an invalid binding, over 10,000 rows per table or a snapshot exceeding 1 MiB causes a failure rather than an unsafe or truncated refresh. Apply schema changes to staging before the next sync, and review the size limits as the app grows. Failed verification is logged as a failed invocation; no automatic alert recipient is configured.

## Operation

[Worker settings and schedule](https://dash.cloudflare.com/87d75a85659dd39b348acf458b75b606/workers/services/view/skyline-pulse-staging-sync/production/settings)

In Worker Observability, a completed invocation logs `staging_refresh` with `status:synced`. Errors log `staging_refresh_failed`. The public `/health` endpoint reports only configuration/schedule; it does not prove the last refresh succeeded and cannot trigger a refresh.

To pause nightly refreshes during extended testing, set `SYNC_ENABLED=false` and deploy. Set it back to `true` and deploy when ready. The staging Pages project's automatic deployments remain paused independently; that pause does not stop data refreshes. Staging email remains disabled and its app remains protected by Cloudflare Access.

Deploy from the repository:

```sh
npx wrangler deploy --config staging-sync/wrangler.jsonc
```

Test locally with synthetic databases:

```sh
npm test
```

```sh
npm run test:staging-sync-runtime
```

On October 22, 2026, staging was backed up privately before its initial refresh. Two missing October 18 service entries were copied from production without overwriting existing records. The complete comparison then matched all five tables: 23 service entries, 3 production entries, 1 recipient, 2 email logs and 0 legacy hosts. Private backup: Codex outputs folder `skyline-pulse-staging-sync-2026-10-22/staging-before.sql`; never commit application snapshots to Git.

Reference: [D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
