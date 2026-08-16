-- Run this once in the Supabase SQL Editor.

create table if not exists public.portfolios (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.net_worth_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  assets numeric not null check (assets >= 0),
  liabilities numeric not null check (liabilities >= 0),
  net_worth numeric not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.portfolios enable row level security;
alter table public.net_worth_snapshots enable row level security;

drop policy if exists "Users can read their portfolio" on public.portfolios;
create policy "Users can read their portfolio"
  on public.portfolios for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their portfolio" on public.portfolios;
create policy "Users can create their portfolio"
  on public.portfolios for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their portfolio" on public.portfolios;
create policy "Users can update their portfolio"
  on public.portfolios for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their portfolio" on public.portfolios;
create policy "Users can delete their portfolio"
  on public.portfolios for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their snapshots" on public.net_worth_snapshots;
create policy "Users can read their snapshots"
  on public.net_worth_snapshots for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their snapshots" on public.net_worth_snapshots;
create policy "Users can create their snapshots"
  on public.net_worth_snapshots for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their snapshots" on public.net_worth_snapshots;
create policy "Users can update their snapshots"
  on public.net_worth_snapshots for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their snapshots" on public.net_worth_snapshots;
create policy "Users can delete their snapshots"
  on public.net_worth_snapshots for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.portfolios to authenticated;
grant select, insert, update, delete on public.net_worth_snapshots to authenticated;

-- Realtime allows another signed-in device to receive portfolio updates immediately.
do $$
begin
  alter publication supabase_realtime add table public.portfolios;
exception
  when duplicate_object then null;
end $$;
