-- Run once in Supabase > SQL Editor.
create table if not exists public.journal_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trades jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint trades_must_be_array check (jsonb_typeof(trades) = 'array')
);
alter table public.journal_data enable row level security;
revoke all on public.journal_data from anon;
grant select, insert, update on public.journal_data to authenticated;
drop policy if exists "Read own journal" on public.journal_data;
drop policy if exists "Insert own journal" on public.journal_data;
drop policy if exists "Update own journal" on public.journal_data;
create policy "Read own journal" on public.journal_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own journal" on public.journal_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own journal" on public.journal_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
