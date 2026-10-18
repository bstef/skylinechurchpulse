# Skyline Pulse — D1 migration status

Branch: `feat/d1-migration`. Draft PR: #32. Date: 2026-10-18.

**Production remains on Supabase. Do not merge yet: the checked-in bindings and names are staging-only.**

## Completed

- Browser Supabase SDK calls replaced with authenticated same-origin D1 API.
- Cloudflare Access signature/issuer/audience/expiry verification, CSRF checks, bounded JSON bodies, field allowlists, prepared statements, stable pagination, boolean conversion, duplicate constraints.
- Report email and weekly digest now use shared D1 helpers; default-disabled sending. Preview report sends additionally require branch main, so staging cannot send.
- Clean static build to dist; source, dependencies, exports and migration notes are excluded.
- Source audit: five public application tables; no Auth users, Storage buckets/objects, public routines/triggers/views, or Edge Functions.
- Preserved legacy host_entries and production_entries.slides_sync_fit, which live schema still contains despite their retirement in repository code.
- Private source snapshot at 2026-10-18T18:14:30.901657Z: 21 service entries, 3 production entries, 1 recipient, 2 email logs, 0 host entries. Export includes column definitions/defaults, constraints, indexes, RLS policies, and table grants. No credentials committed.
- Backup package saved separately; local SQLite restore and all-table content parity verified. PostgreSQL recovery SQL generated but not executed against PostgreSQL. This is an application logical backup, not a physical/full-platform backup.
- Snapshot imported into remote staging D1. Every field, ID, timestamp and row matches after boolean-to-integer conversion.
- Ten automated tests pass, including JWT signature/audience/issuer/expiry, CRUD, field/range validation, >500-row pagination, no-store auth middleware, preview sends disabled, stubbed report/digest persistence, and DOM-level frontend rendering/navigation with preview email blocked.
- Compiled Pages Functions pass native workerd/D1 checks for empty state, CRUD, duplicate constraints, booleans/nulls, CSRF/auth rejection, email disabled, and private build output. Pages and digest bundles compile.

## Isolated staging resources

Cloudflare account: Peacockengr (`87d75a85659dd39b348acf458b75b606`).

- D1: `skyline-pulse-staging`, ID `2fed3452-8682-47d6-80a5-f230b4a9ce1e`.
- Pages: `skyline-pulse-d1-staging`, branch `feat/d1-migration`, build `npm run build`, output `dist`. Automatic deployments initially disabled; explicitly deploy the tested branch for review.
- Access application: `Skyline Pulse D1 Staging`, ID `53bc167b-71b8-4755-ac41-674aa3c9002b`. Protects the base pages.dev hostname and wildcard aliases, reusing the exact existing Skyline Pulse Access policies (including geography/identity-provider requirements). No policy memberships changed.
- `EMAIL_ENABLED=false`; no sending key configured in staging. Digest staging config has no schedules.
- Staging currently lacks PCO_APP_ID/PCO_SECRET. Configure the existing integration credentials through secure Cloudflare settings if live PCO staging testing is needed; do not expose/copy secrets to source.
- Compatibility date is pinned to 2026-08-06, the newest date the available local workerd binary accepts. Both tests and deploy configs use that date, rather than claiming to have tested an unsupported newer runtime.

## Live resources — unchanged

- Supabase project `uvwgotklgfhvqbcpdqqb`, SkylineChurchLedger.
- Pages project `skylinechurchpulse`, production branch `main`; existing production deployment `f5d7b59a-386e-4f97-ab07-0d3d3296d198` at audit.
- Access app `a9df3c64-324a-451e-9935-dab5dcefb1ad`, audience `2be643806834b2f6b30c25f6d111555a17866fcbcff44d1313ed235a888cee62`.
- Worker `skyline-pulse-weekly-digest` still uses its old Supabase code/bindings and existing Monday schedule.
- Keepalive remains `0 */6 * * *`. Do not stop it yet.

## Remaining before cutover

1. Staging deployment `a6248f08-9d76-4426-8d96-80c876f4ae88` succeeded for commit `e1000728a950736457a4799375e8597e0d59dfbc`. The base preview hostname shows the expected Cloudflare Access login. The user will sign into staging separately; no authenticated visual result has been claimed. Backend work uses the connected integrations without browser login.
2. Complete rendered browser checks: calendar, manual/PCO logging, edit/delete/undo, production, analytics, CSV/PDF, recipients, and email history. Set staging PCO secrets securely for live integration checks; email remains disabled.
3. Production D1 `skyline-pulse-production` (`ebaf7a80-ec0c-430c-a782-bae2cd427cb2`) has both migrations applied and all five tables verified EMPTY. A final source snapshot is required; staging data is not the final production data.
4. Review prepared production candidates (see below), then apply the approved cutover configuration changes: Pages name `skylinechurchpulse`, production DB binding, existing live Access audience, build command/output directory, production env vars, digest name/binding/schedules/secrets. Preview must remain on staging, with emails disabled. Review production secret names only; preserve existing values.
5. Review production cutover with the user after the preview and checks are concrete. Do not merge draft #32 prematurely.

## Cutover sequence

- Use a quiet window. Temporarily prevent app writes and stop digest sends; verify both controls before snapshotting. Do not merely assume there are no users.
- Export a fresh complete application snapshot in a single read-only SQL statement, preserve it privately, and run prepare-migration.mjs to test restore and generate import statements.
- Import into EMPTY production D1 and compare every table by ID and canonicalized content. Fail on missing/extra columns or records; never silently drop legacy data.
- Deploy Pages and digest together with the reviewed production settings; preserve existing Access policy and secrets. Keep digest EMAIL_ENABLED=false until smoke checks pass; then restore its schedules/enabled state.
- Validate reads/writes/exports, PCO and recipients. Do not send a real test email without explicit instructions naming the recipient; stubbed tests already cover delivery code.
- Reopen writes after validation. Keep Supabase and its keepalive intact during the review/rollback period.

## Rollback

Before accepting new D1 writes: roll Pages back to the recorded Supabase deployment and the digest to its previous version/bindings, then reopen writes on Supabase.

After accepting D1 writes: freeze writes again, export D1, reconcile ALL new/changed/deleted records back to Supabase, verify parity, and only then switch code back. A code-only rollback after D1 writes would lose those updates. Do not delete the source project or backups as part of cutover.

## Resume / validation

```sh
npm ci
npm test
npm run build
npm run test:runtime
npx wrangler deploy --dry-run --config cron-worker/wrangler.jsonc
```

An empty production D1 database has been prepared. No live database contents, app deployment, email schedule, recipients, access memberships, or billing plan have been changed by this migration work.

## Prepared production candidates — NOT deployed

- `wrangler.production-candidate.jsonc`: live Pages name and existing live Access audience; production D1 binding; explicit preview override retains staging D1/audience; all email disabled. This filename is not auto-selected by Pages Git builds. At approved cutover, replace root `wrangler.jsonc` with its contents so relative paths remain correct. Never merge the current staging root config into main unchanged.
- `cron-worker/wrangler.production-candidate.jsonc`: existing live digest name, separate production D1, both observed Monday triggers (`0 12 * * 1`, `0 13 * * 1`), email disabled. Retain EMAIL_ENABLED=false through deployment/smoke checks; only enable after review. Existing Worker secrets are DIGEST_TEST_SECRET and RESEND_API_KEY; preserve values. Supabase secrets can remain during rollback review.
- `ops/pages-build-candidate.json`: narrowly scoped Pages project PATCH to set `npm run build` / `dist`. Contains no environment-variable edits, so it does not replace PCO_APP_ID, PCO_SECRET, RESEND_API_KEY, DIGEST_CRON_SECRET or existing Supabase secret values. Do not apply before the coordinated cutover: main currently has no build script.
- Both Pages production/preview candidate configurations passed Wrangler schema/type generation; the production digest candidate passed a deployment dry run. No candidate was deployed. The static build still excludes all configuration/source/backup files.
- Git auto-deploy is currently enabled on the live project. Before merging production configuration, disable live production auto-deploy, record the old settings/deployment/Worker version, and establish the write freeze. Apply build settings and deploy the reviewed commit explicitly only after final import/parity. Re-enable auto-deploy after successful smoke checks.
- Live preview aliases need explicit Access coverage for visual review. An alias with no valid matching Access assertion fails closed at the API. Do not add bypass policies to make previews work.

Backend audit on 2026-10-18: Supabase is ACTIVE_HEALTHY; live Pages canonical deployment remains f5d7b59a-386e-4f97-ab07-0d3d3296d198. Only secret names were inspected. Production D1 contains zero application rows and is not bound to any live service.
