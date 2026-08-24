-- ============================================================================
-- AILAHA PHALAM v2 — fresh minimal schema.
--
-- STATUS: NOT auto-applied. The service_role key can read/write ROWS (PostgREST)
-- but cannot run DDL. Apply this in the Supabase SQL editor (project
-- crhlsheofcneafhbdrld) with a Personal Access Token or the DB password when
-- available. Until then, v2 runs on the PRESERVED existing tables via the
-- mapping documented at the bottom of this file — the app is fully functional
-- without this migration; applying it later only formalizes the physical schema.
--
-- Weeks run MONDAY -> SUNDAY everywhere. Week identity = its Monday date
-- (week_start_date is always a Monday). Google OAuth auth is unchanged; RLS
-- scopes every row to auth.uid() exactly as the v1 tables did.
-- ============================================================================

-- ---- live_trades : open positions only -------------------------------------
create table if not exists public.live_trades (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol          text not null,
  instrument      text not null,               -- DOW|NASDAQ|SNP|NIKKEI|GIFTNIFTY|NIFTY FUT
  side            text not null check (side in ('LONG','SHORT')),
  lots            integer not null check (lots > 0),
  entry           numeric not null,
  init_date       date not null,
  currency        text not null check (currency in ('INR','USD')),
  realization     numeric not null check (realization in (0.8, 1.0)),
  entry_brokerage numeric,                      -- nullable: blank => legacy auto-formula
  created_at      timestamptz not null default now()
);

-- ---- closed_trades : all live fields + exit leg ----------------------------
create table if not exists public.closed_trades (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol          text not null,
  instrument      text not null,
  side            text not null check (side in ('LONG','SHORT')),
  lots            integer not null check (lots > 0),
  entry           numeric not null,
  init_date       date not null,
  currency        text not null check (currency in ('INR','USD')),
  realization     numeric not null check (realization in (0.8, 1.0)),
  entry_brokerage numeric,
  exit            numeric not null,
  exit_brokerage  numeric,                      -- nullable: blank => legacy auto-formula
  closed_date     date not null,
  created_at      timestamptz not null default now()
);

-- ---- weekly_marks : per-trade week-by-week closing value -------------------
create table if not exists public.weekly_marks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_id        uuid not null,                -- references a live/closed trade id
  week_start_date date not null,                -- the week's Monday
  closing_value   numeric not null,
  updated_at      timestamptz not null default now(),
  unique (user_id, trade_id, week_start_date)
);

-- ---- weekly_rates : one USD/INR rate per week ------------------------------
create table if not exists public.weekly_rates (
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start_date date not null,                -- the week's Monday
  usd_inr         numeric not null,
  updated_at      timestamptz not null default now(),
  primary key (user_id, week_start_date)
);

-- ---- settings : pin + theme, one row per user ------------------------------
create table if not exists public.settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  pin_hash   text,                              -- sha256(user_id:pin); null until set
  theme      text not null default 'forest' check (theme in ('white','forest')),
  updated_at timestamptz not null default now()
);

-- ---- RLS : owner-only on every table (matches the v1 policy shape) ---------
do $$
declare tbl text;
begin
  foreach tbl in array array['live_trades','closed_trades','weekly_marks','weekly_rates','settings']
  loop
    execute format('alter table public.%I enable row level security;', tbl);
    execute format($p$create policy "%1$s_select_own" on public.%1$I for select using (auth.uid() = user_id);$p$, tbl);
    execute format($p$create policy "%1$s_insert_own" on public.%1$I for insert with check (auth.uid() = user_id);$p$, tbl);
    execute format($p$create policy "%1$s_update_own" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);$p$, tbl);
    execute format($p$create policy "%1$s_delete_own" on public.%1$I for delete using (auth.uid() = user_id);$p$, tbl);
  end loop;
end $$;

-- ============================================================================
-- CURRENT (no-DDL) MAPPING the shipped app uses on the preserved v1 tables:
--   live_trades + closed_trades  ->  public.trades.data (jsonb Trade object;
--                                    data.status open vs Closed splits the two)
--   weekly_marks (this migration) ->  public.weekly_marks
--                                    (week_key = Monday date, close_price = closing_value)
--   weekly_rates                  ->  stamped into each USD trade's
--                                    data.fridayUsdToInrRates[weekMonday]
--   settings.pin_hash             ->  public.user_settings.pin_hash (sha256)
--   settings.theme                ->  client localStorage (no column to hold it
--                                    without DDL; migrates to settings.theme here)
-- All preserved tables already carry auth.uid() = user_id RLS.
-- ============================================================================
