-- AILAHA PHALAM — weekly MTM marks. Additive only; nothing dropped or altered.
-- NOT applied automatically. Run in the Supabase SQL editor for project
-- crhlsheofcneafhbdrld only after AKS approval.

create table if not exists public.weekly_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_id text not null,  -- Trade.id ("trade_<ts>_<rand>"), matches trades.data->>'id' (NOT a uuid)
  week_key text not null,  -- ISO week key, e.g. "2026-W31"
  close_price numeric not null,
  updated_at timestamptz not null default now(),
  unique (user_id, trade_id, week_key)  -- one mark per user+trade+week; enables clean upsert
);

alter table public.weekly_marks enable row level security;

create policy "weekly_marks_select_own" on public.weekly_marks
  for select using (auth.uid() = user_id);
create policy "weekly_marks_insert_own" on public.weekly_marks
  for insert with check (auth.uid() = user_id);
create policy "weekly_marks_update_own" on public.weekly_marks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weekly_marks_delete_own" on public.weekly_marks
  for delete using (auth.uid() = user_id);

-- trades: entry_brokerage / exit_brokerage.
-- The trades table stores the whole Trade object in the `data` jsonb column (columns:
-- id uuid, user_id uuid, data jsonb, created_at). The new nullable per-leg brokerage
-- fields therefore live INSIDE data as entryBrokerage / exitBrokerage — no ALTER TABLE
-- is needed and existing rows are untouched (absent field = legacy behavior).
