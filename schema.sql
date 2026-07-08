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
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.service_entries enable row level security;

-- Since this app uses a shared link with no login, allow anyone with the
-- anon key (which is safe to expose in frontend code) to read/write.
-- If you later add login, replace these with auth-scoped policies.
create policy "Allow anon read" on public.service_entries
  for select using (true);

create policy "Allow anon insert" on public.service_entries
  for insert with check (true);

create policy "Allow anon delete" on public.service_entries
  for delete using (true);
