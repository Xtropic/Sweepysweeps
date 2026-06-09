-- ============================================================
-- World Cup 2026 Predictor — Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Teams
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  flag_emoji text,
  group_name text  -- 'A' to 'L', null for TBD knockout teams
);

-- Matches
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  match_number int unique,            -- sequential match number
  stage text not null,                -- 'group' | 'round_of_32' | 'round_of_16' | 'quarter_final' | 'semi_final' | 'third_place' | 'final'
  group_name text,                    -- 'A'–'L', group stage only
  home_team_id uuid references teams(id),
  away_team_id uuid references teams(id),
  match_date timestamptz,
  -- Actual result (null until admin enters it)
  home_score int,
  away_score int,
  penalty_winner_id uuid references teams(id),  -- null unless match went to penalties
  status text not null default 'scheduled'       -- 'scheduled' | 'in_progress' | 'completed'
);

-- User profiles (extends Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  total_points int not null default 0,
  is_admin boolean not null default false,
  created_at timestamptz default now()
);

-- Predictions
create table if not exists predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  predicted_home_score int not null,
  predicted_away_score int not null,
  predicted_penalty_winner_id uuid references teams(id),  -- only for knockout draws
  points int,                -- null until match completed; calculated by app
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, match_id)
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table teams enable row level security;
alter table matches enable row level security;
alter table profiles enable row level security;
alter table predictions enable row level security;

-- Teams: anyone authenticated can read
create policy "teams_read" on teams for select to authenticated using (true);

-- Matches: anyone authenticated can read
create policy "matches_read" on matches for select to authenticated using (true);
-- Admin can update (to add scores)
create policy "matches_admin_update" on matches for update to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- Profiles: anyone can read (for leaderboard); users can only update their own
create policy "profiles_read" on profiles for select to authenticated using (true);
create policy "profiles_insert_own" on profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on profiles for update to authenticated
  using (id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- Predictions: users read/write their own; admins can update points
create policy "predictions_read_own" on predictions for select to authenticated using (user_id = auth.uid());
create policy "predictions_insert_own" on predictions for insert to authenticated with check (user_id = auth.uid());
create policy "predictions_update_own" on predictions for update to authenticated
  using (user_id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- ============================================================
-- Seed: 48 Teams
-- ============================================================

insert into teams (name, flag_emoji, group_name) values
  -- Group A (USA hosts)
  ('United States', '🇺🇸', 'A'),
  ('Mexico', '🇲🇽', 'A'),
  ('Canada', '🇨🇦', 'A'),
  ('TBD Group A4', '🏳️', 'A'),
  -- Group B
  ('Argentina', '🇦🇷', 'B'),
  ('Ecuador', '🇪🇨', 'B'),
  ('Chile', '🇨🇱', 'B'),
  ('Peru', '🇵🇪', 'B'),
  -- Group C
  ('Brazil', '🇧🇷', 'C'),
  ('Uruguay', '🇺🇾', 'C'),
  ('Colombia', '🇨🇴', 'C'),
  ('Bolivia', '🇧🇴', 'C'),
  -- Group D
  ('France', '🇫🇷', 'D'),
  ('Belgium', '🇧🇪', 'D'),
  ('Portugal', '🇵🇹', 'D'),
  ('Croatia', '🇭🇷', 'D'),
  -- Group E
  ('Spain', '🇪🇸', 'E'),
  ('Netherlands', '🇳🇱', 'E'),
  ('Italy', '🇮🇹', 'E'),
  ('Switzerland', '🇨🇭', 'E'),
  -- Group F
  ('England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'F'),
  ('Germany', '🇩🇪', 'F'),
  ('Denmark', '🇩🇰', 'F'),
  ('Austria', '🇦🇹', 'F'),
  -- Group G
  ('Morocco', '🇲🇦', 'G'),
  ('Senegal', '🇸🇳', 'G'),
  ('Egypt', '🇪🇬', 'G'),
  ('Nigeria', '🇳🇬', 'G'),
  -- Group H
  ('Cameroon', '🇨🇲', 'H'),
  ('Ivory Coast', '🇨🇮', 'H'),
  ('Ghana', '🇬🇭', 'H'),
  ('Mali', '🇲🇱', 'H'),
  -- Group I
  ('Japan', '🇯🇵', 'I'),
  ('South Korea', '🇰🇷', 'I'),
  ('Australia', '🇦🇺', 'I'),
  ('Iran', '🇮🇷', 'I'),
  -- Group J
  ('Saudi Arabia', '🇸🇦', 'J'),
  ('Qatar', '🇶🇦', 'J'),
  ('Iraq', '🇮🇶', 'J'),
  ('Jordan', '🇯🇴', 'J'),
  -- Group K
  ('Honduras', '🇭🇳', 'K'),
  ('Costa Rica', '🇨🇷', 'K'),
  ('Panama', '🇵🇦', 'K'),
  ('TBD Group K4', '🏳️', 'K'),
  -- Group L
  ('New Zealand', '🇳🇿', 'L'),
  ('South Africa', '🇿🇦', 'L'),
  ('Tunisia', '🇹🇳', 'L'),
  ('Algeria', '🇩🇿', 'L')
on conflict (name) do nothing;

-- ============================================================
-- Seed: Group Stage Matches (example — first few groups)
-- Full fixture list should be added when confirmed by FIFA
-- ============================================================

-- Helper: get team id by name
-- You can generate the full fixture list using the pattern below.
-- Example Group A matches:
insert into matches (match_number, stage, group_name, home_team_id, away_team_id, match_date)
select 1, 'group', 'A', h.id, a.id, '2026-06-11 20:00:00+00'
from teams h, teams a where h.name = 'United States' and a.name = 'Mexico'
on conflict (match_number) do nothing;

insert into matches (match_number, stage, group_name, home_team_id, away_team_id, match_date)
select 2, 'group', 'A', h.id, a.id, '2026-06-11 23:00:00+00'
from teams h, teams a where h.name = 'Canada' and a.name = 'TBD Group A4'
on conflict (match_number) do nothing;

insert into matches (match_number, stage, group_name, home_team_id, away_team_id, match_date)
select 3, 'group', 'A', h.id, a.id, '2026-06-15 20:00:00+00'
from teams h, teams a where h.name = 'United States' and a.name = 'Canada'
on conflict (match_number) do nothing;

insert into matches (match_number, stage, group_name, home_team_id, away_team_id, match_date)
select 4, 'group', 'A', h.id, a.id, '2026-06-15 23:00:00+00'
from teams h, teams a where h.name = 'Mexico' and a.name = 'TBD Group A4'
on conflict (match_number) do nothing;

insert into matches (match_number, stage, group_name, home_team_id, away_team_id, match_date)
select 5, 'group', 'A', h.id, a.id, '2026-06-19 20:00:00+00'
from teams h, teams a where h.name = 'Mexico' and a.name = 'Canada'
on conflict (match_number) do nothing;

insert into matches (match_number, stage, group_name, home_team_id, away_team_id, match_date)
select 6, 'group', 'A', h.id, a.id, '2026-06-19 20:00:00+00'
from teams h, teams a where h.name = 'TBD Group A4' and a.name = 'United States'
on conflict (match_number) do nothing;
