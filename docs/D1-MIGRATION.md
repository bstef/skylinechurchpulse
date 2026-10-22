# Skyline Pulse — D1 cutover completed

Production switched from Supabase to Cloudflare D1 on **October 22, 2026**.

## Live configuration

- App: https://skylinechurch.tech (Pages project `skylinechurchpulse`).
- D1: `skyline-pulse-production`, ID `ebaf7a80-ec0c-430c-a782-bae2cd427cb2`.
- Pages builds with `npm run build`, output `dist`; only intended static assets are published.
- The website and `skyline-pulse-weekly-digest` both bind directly to this database.
- Production data writes and report emails are enabled. The digest targets Monday 8 AM America/New_York. A subsequent email audit corrected the UTC triggers to explicit `MON` (Cloudflare interprets weekday `1` as Sunday) and added a scheduled-time weekday/hour guard and early-failure logging.
- Existing Cloudflare Access policies and Planning Center/Resend secret values were preserved. APIs additionally verify signed Access assertions and same-origin writes.
- Root `wrangler.jsonc` and `cron-worker/wrangler.jsonc` are the production configurations. The `*.staging.jsonc` files explicitly target isolated staging. Production previews bind to staging and disable email; they never use the production database.

## Data transfer and verification

The old app used direct browser-to-Supabase writes, so freezing only the website would not stop older tabs. The cutover revoked INSERT/UPDATE/DELETE/TRUNCATE on the five application tables from the `anon` and `authenticated` roles. The effective permissions were checked before the final snapshot.

A fresh consistent source snapshot was taken at **2026-10-22 12:41:34 UTC** and imported into the previously empty production D1 database. All five tables were compared by canonicalized complete row content and SHA-256, including original IDs, timestamps, nulls, booleans and legacy columns.

| Table | Rows at cutover |
|---|---:|
| `service_entries` | 23 (22 Sunday/special services, 1 SkyYouth) |
| `production_entries` | 3 |
| `email_recipients` | 1 |
| `email_log` | 2 |
| `host_entries` | 0 |

The retired host table and `production_entries.slides_sync_fit` were preserved. No source records were deleted. Private backups include pre-freeze grants, the final source snapshot, D1 inserts, generated PostgreSQL recovery SQL, and parity manifests. They are stored outside this repository under the private Codex outputs directory `skyline-pulse-cutover-2026-10-22`; never publish them.

## Validation

- Eleven automated tests pass: CRUD, validation, uniqueness, pagination beyond 500 records, booleans/nulls, maintenance write blocking, Access signature/issuer/audience/expiry verification, CSRF, preview email guards, frontend rendering, and report/digest persistence with outbound email stubbed.
- Compiled Pages Functions pass native workerd/D1 tests for CRUD, constraints, auth, CSRF, disabled email and private build output.
- Authenticated staging and production loaded the saved records. Production home showed 22 service records, 1 SkyYouth record and 3 production records; calendar navigation rendered successfully.
- Unauthenticated requests to the live API are redirected to Access. Direct deployment API requests without an assertion return 401.
- Cloudflare reported successful production Pages and digest deployments, the correct shared D1 binding, enabled production writes/email, and preserved secret bindings.
- Browser automation subsequently timed out, so a complete manual production tour of edit/undo, Planning Center prefill and CSV/PDF downloads was not claimed. These existing flows retain their automated coverage where present; PCO secrets and proxy implementations are unchanged.
- No real test emails were sent. The existing digest remains scheduled; delivery was tested with a stub, not by emailing the church.

## Source database and rollback

Supabase project `uvwgotklgfhvqbcpdqqb` is retained as a **read-only legacy source** for the application roles. Its keepalive and existing credentials were left intact during the recovery review period. D1 is now authoritative; old open browser tabs must refresh before entering data.

The previous Supabase Pages deployment is `f5d7b59a-386e-4f97-ab07-0d3d3296d198` (source commit `335e12a`). The previous digest Worker version is `daad595b-b8b4-4a21-ac0c-94ae51173ef3`.

**Do not simply roll code back after accepting D1 writes.** First set `WRITES_ENABLED=false` on Pages and `EMAIL_ENABLED=false` on the digest and redeploy. Export D1, reconcile all new/updated/deleted records back into Supabase, and verify every table. Only then restore the previous website/Worker and the original grants from the private backup. The backup includes `unfreeze-legacy.sql` for the specific grants revoked at cutover. Preserve the existing Access configuration and secrets throughout.

For normal maintenance, `WRITES_ENABLED=false` blocks data API mutations while retaining reads. Set it back to `true` and redeploy when maintenance is finished.

## Repeatable local checks

```sh
npm ci
npm test
npm run build
npm run test:runtime
```

The source audit found no Supabase Auth users, Storage buckets/objects, Edge Functions, or public routines/triggers/views to migrate. The backup is an application logical snapshot, not a physical/full-platform backup; generated PostgreSQL restore SQL has not been executed against PostgreSQL.
