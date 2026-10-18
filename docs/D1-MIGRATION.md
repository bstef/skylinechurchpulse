# D1 migration — resumable checkpoint

Status: **DRAFT FOUNDATION ONLY. Do not merge or cut over yet.**

Checkpoint date: 2026-10-18. Branch: `feat/d1-migration`.
User requested migration, then asked to stop at a good checkpoint due to usage credits.

## Live system — preserved

- Production Pages project: `skylinechurchpulse`, production branch `main`.
- Supabase project: `SkylineChurchLedger`, ref `uvwgotklgfhvqbcpdqqb`.
- Earlier live check: Healthy, Free plan, 21 service records; latest created 2026-10-11.
- No managed backups included on Free. No export/restore has been performed.
- Existing keepalive now runs `0 */6 * * *`; keep it running until migration is verified.
- Existing weekly digest Worker: `skyline-pulse-weekly-digest`; leave it on Supabase until final cutover.
- Existing Access app protects `skylinechurchpulse.pages.dev` and `skylinechurch.tech`.
  Preview wildcard was NOT in its destinations. Do not assume preview URLs are protected.
- No D1 resource, binding, data import, production change, email send, or billing change made at this checkpoint.

## Implemented in this branch

- `migrations/0001_initial.sql`: initial SQLite schema with constraints and indexes.
- `lib/d1-store.js`: prepared, allowlisted reads; stable pagination; SQLite boolean decoding; email persistence helpers.
- `functions/api/data/[[path]].js`: service/production CRUD, recipient management, read-only email log, field validation, bounded JSON body, duplicate handling compatible with the frontend.
- `functions/api/_middleware.js` + `lib/access.js`: signed Cloudflare Access JWT required for ALL API routes, issuer/audience/expiry verification via jose; same-origin mutations; no-store responses. Missing config fails closed. LOCAL_DEV bypass works only on loopback hostnames.
- `assets/data-client.js` and `index.html`: replace direct browser Supabase calls with the same-origin API; follow pagination.
- Node SQLite tests: service CRUD/duplicates/booleans, invalid fields and values, recipient uniqueness, read-only log, pagination >500 rows, missing auth and cross-origin mutations.

## Verified and limits

`npm test`: 4 test cases passed using real in-memory SQLite, with a small adapter for the D1 asynchronous interface. These are NOT workerd/D1 integration tests.

Still needed: real D1/local Wrangler integration, JWT happy-path/tamper/expiry tests, middleware integration, frontend/browser tests, API error and email tests, remote deployment verification, and backup/restore verification.

The schema is based on the checked-in PostgreSQL schema plus the observed live table list. Audit actual live columns/types/defaults/constraints before importing; repository and live schema differ. `host_entries` still exists live despite being retired in the repository. Preserve all existing rows in the D1 archive table until audited; do not drop them.

## Next work, in order

1. Inspect branch diff and live schemas. Inventory all tables, row counts, Storage buckets, Auth users, SQL functions/triggers and extensions. Do not assume only the 21 service entries matter.
2. Finish `functions/api/send-report-email.js` and `cron-worker/src/index.js`: replace Supabase reads/writes with the shared D1 helpers. They STILL USE SUPABASE in this draft. Keep preview sends disabled with an explicit environment flag checked before network calls. Do not send test emails to real recipients.
3. Add an isolated D1 staging database and preview-only DB binding. Root Pages configuration should build only intended static assets into a clean output directory (do not serve node_modules, tests, exports, or SQL backups). Add appropriate routes and validated Wrangler configuration. Do not alter production bindings.
4. Configure API auth variables: ACCESS_TEAM_DOMAIN is `peacockengr.cloudflareaccess.com`; ACCESS_AUD must match the specific Access app. Reuse existing allowed users/policies for preview only after checking the exact permissions and authentication coverage. Never expose PCO-backed endpoints while preview auth is incomplete.
5. Disable email sends for preview. The current preview environment has PCO_APP_ID and PCO_SECRET only. Do not copy production email secrets merely for testing. The browser API currently fails closed without Access settings and DB.
6. Add tests for production records, empty lists, update/delete/undo, dates, Unicode, HTML email history, uniqueness on (pco_plan_id, service_type), all production fields, >500 records, and expiry/signature/audience validation. Test Pages Functions and scheduled Worker with native D1 bindings.
7. Export Supabase completely to a private destination: schema, roles/data, and Storage objects separately. Preserve original IDs/timestamps and boolean values. Do not commit exports, recipient addresses, or credentials. Validate the export with a restore before any cutover.
8. Import a snapshot into staging only, with email disabled. Compare every table by ID/count plus canonicalized per-row content or hashes. Keep import tooling explicit about transformations (SQLite integers for booleans, UUID/date/timestamp text).
9. Test a private preview: calendar, logging, edits/deletes/undo, analytics, CSV/PDF exports, Planning Center, email-recipient management and email preview. Stub actual outbound email. Check empty/error/loading states.
10. Prepare a concrete final cutover review: verified snapshot time, full test results, data reconciliation, deployment changes, email scheduler change, and rollback steps. Only then schedule a short write freeze, final export/import, compare, and switch production. Do not merge this draft to main.

## Cutover / rollback design

Supabase remains the source of truth during development. Avoid dual writes. At cutover, temporarily stop app writes and digest sends, take a final verified snapshot, import to D1, compare content and counts, then deploy app and digest together. Preserve the existing Access protections.

Before reopening writes: if smoke checks fail, roll Pages back to the last Supabase deployment and restore the old digest deployment/bindings. After D1 accepts new writes, rollback requires exporting/reconciling those changes back into Supabase before switching; simply rolling code back would lose new records. Keep a tested reverse-export procedure and backups.

Keep Supabase and the keepalive for a review period after successful cutover. Retire them only after confirming D1 backup/recovery and digest behavior. Do not delete the old project as part of migration.

## Resume commands

```sh
git switch feat/d1-migration
npm ci
npm test
git diff main...HEAD
```

Node 24+ is currently used for the built-in SQLite tests. No local or remote secrets have been saved in this branch.
