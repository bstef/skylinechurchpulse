-- Skyline Church Service Ledger — Supabase schema

create table if not exists public.service_entries (
  id uuid primary key default gen_random_uuid(),
  service_date date not null,
  service_type text not null,
  attendance integer not null,
  unity smallint not null check (unity between 1 and 5),
  engagement smallint not null check (engagement between 1 and 5),
  loudness_db integer not null,
  notes text default '',
  pco_plan_id text,
  created_at timestamptz not null default now(),
  unique (pco_plan_id, service_type)
);

-- Links an entry back to the Planning Center Plan it was created from, so the
-- "Planning Center" tab can tell which plans are already logged. Null for
-- manually-logged entries. Safe to re-run on a database that already has the
-- table (e.g. before the PCO integration was added).
alter table public.service_entries
  add column if not exists pco_plan_id text;

-- A single PCO Plan can cover more than one physical service time (e.g. one
-- "Celebration Service" plan represents both the 9:30 and 11:00 gatherings),
-- so each Plan may need more than one Pulse entry. Replace the earlier
-- single-column unique constraint (one entry per plan) with a composite one
-- that only blocks logging the exact same service_type twice for the same
-- plan. Safe to re-run.
alter table public.service_entries
  drop constraint if exists service_entries_pco_plan_id_key;
alter table public.service_entries
  drop constraint if exists service_entries_pco_plan_id_service_type_key;
alter table public.service_entries
  add constraint service_entries_pco_plan_id_service_type_key unique (pco_plan_id, service_type);

-- Enable Row Level Security
alter table public.service_entries enable row level security;

-- Since this app uses a shared link with no login, allow anyone with the
-- anon key (which is safe to expose in frontend code) to read/write.
-- If you later add login, replace these with auth-scoped policies.
create policy "Allow anon read" on public.service_entries
  for select using (true);

create policy "Allow anon insert" on public.service_entries
  for insert with check (true);

create policy "Allow anon update" on public.service_entries
  for update using (true) with check (true);

create policy "Allow anon delete" on public.service_entries
  for delete using (true);
