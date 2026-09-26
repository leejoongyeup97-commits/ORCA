-- ORCA structured match confirmation schema v0.1
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Match context reference data -------------------------------------------------

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  season_key text not null unique,
  season_year integer,
  season_number integer,
  season_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

alter table public.seasons add column if not exists season_year integer;
alter table public.seasons add column if not exists season_number integer;

-- Backward-safe migration for both legacy "season_20" and current "2026:4" keys.
update public.seasons
set
  season_year = case
    when season_key ~ '^[0-9]{4}:[0-9]+$'
      then split_part(season_key, ':', 1)::integer
    else season_year
  end,
  season_number = case
    when season_key ~ '^[0-9]{4}:[0-9]+$'
      then split_part(season_key, ':', 2)::integer
    when season_key ~ '^season_[0-9]+$'
      then substring(season_key from '^season_([0-9]+)$')::integer
    else season_number
  end
where season_year is null or season_number is null;

-- season_number can repeat across different years (for example 2026:4, 2027:4).
drop index if exists public.seasons_season_number_uidx;
create unique index if not exists seasons_year_number_uidx
  on public.seasons (season_year, season_number)
  where season_year is not null and season_number is not null;

create table if not exists public.patches (
  id uuid primary key default gen_random_uuid()
);

alter table public.patches add column if not exists patch_label text;
alter table public.patches add column if not exists effective_from timestamptz;
alter table public.patches add column if not exists effective_to timestamptz;
alter table public.patches add column if not exists created_at timestamptz default now();

create unique index if not exists patches_patch_label_uidx
  on public.patches (patch_label)
  where patch_label is not null;

alter table public.matches drop column if exists attack_defense;
alter table public.matches add column if not exists season_id uuid;
alter table public.matches add column if not exists patch_id uuid;
alter table public.matches add column if not exists side text;
alter table public.matches add column if not exists duration text;
alter table public.matches add column if not exists played_at_kst timestamp;
alter table public.matches add column if not exists created_at_kst timestamp;

do $orca$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_season_id_fkey'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_season_id_fkey
      foreign key (season_id) references public.seasons(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matches_patch_id_fkey'
      and conrelid = 'public.matches'::regclass
  ) then
    alter table public.matches
      add constraint matches_patch_id_fkey
      foreign key (patch_id) references public.patches(id) on delete set null;
  end if;
end;
$orca$;

create index if not exists seasons_period_idx
  on public.seasons (starts_at desc);

-- Admin helper for season registration.
-- Example (KST): select public.add_orca_season('2026:4', '2026-10-13 12:00:00+09');
--
-- The next season's starts_at is always the previous season's ends_at.
-- Existing matches are backfilled automatically after registration.
drop function if exists public.add_orca_season(integer,timestamptz,text);

create or replace function public.add_orca_season(
  p_season_key text,
  p_starts_at timestamptz,
  p_season_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $orca$
declare
  v_id uuid;
  v_year integer;
  v_number integer;
  v_name text;
  v_ends_at timestamptz;
begin
  if p_season_key is null or btrim(p_season_key) !~ '^[0-9]{4}:[0-9]+$' then
    raise exception 'INVALID_SEASON_KEY: expected YYYY:N (example 2026:4)';
  end if;

  if p_starts_at is null then
    raise exception 'INVALID_SEASON_START';
  end if;

  v_year := split_part(btrim(p_season_key), ':', 1)::integer;
  v_number := split_part(btrim(p_season_key), ':', 2)::integer;

  if v_number <= 0 then
    raise exception 'INVALID_SEASON_NUMBER';
  end if;

  v_name := coalesce(nullif(btrim(p_season_name), ''), btrim(p_season_key) || ' 시즌');

  insert into public.seasons (
    season_key, season_year, season_number, season_name, starts_at, ends_at
  ) values (
    btrim(p_season_key), v_year, v_number, v_name, p_starts_at, null
  )
  on conflict (season_key) do update
  set
    season_year = excluded.season_year,
    season_number = excluded.season_number,
    season_name = excluded.season_name,
    starts_at = excluded.starts_at
  returning id into v_id;

  -- Recalculate every season boundary from chronological start times.
  with ordered as (
    select
      id,
      lead(starts_at) over (order by starts_at, season_year, season_number) as next_start
    from public.seasons
  )
  update public.seasons s
  set ends_at = o.next_start
  from ordered o
  where s.id = o.id
    and s.ends_at is distinct from o.next_start;

  select ends_at
    into v_ends_at
  from public.seasons
  where id = v_id;

  -- Backfill season context for all existing matches.
  update public.matches m
  set
    season_id = s.id,
    editable = coalesce(m.editable, '{}'::jsonb)
      || jsonb_build_object('season', s.season_name)
  from public.seasons s
  where m.played_at is not null
    and s.starts_at <= m.played_at
    and (s.ends_at is null or m.played_at < s.ends_at)
    and (
      m.season_id is distinct from s.id
      or coalesce(m.editable->>'season', '') is distinct from s.season_name
    );

  return jsonb_build_object(
    'id', v_id,
    'season_key', btrim(p_season_key),
    'season_year', v_year,
    'season_number', v_number,
    'season_name', v_name,
    'starts_at', p_starts_at,
    'ends_at', v_ends_at
  );
end;
$orca$;

-- Season registration is an admin/service operation, not a client action.
revoke all on function public.add_orca_season(text,timestamptz,text) from public;
grant execute on function public.add_orca_season(text,timestamptz,text) to service_role;

create index if not exists patches_effective_from_idx
  on public.patches (effective_from desc);
create index if not exists matches_season_id_idx
  on public.matches (season_id);
create index if not exists matches_patch_id_idx
  on public.matches (patch_id);

-- Canonical hero role reference used when saving match_players.
create table if not exists public.hero_roles (
  hero_key text primary key,
  role text not null check (role in ('tank','damage','support')),
  updated_at timestamptz not null default now()
);

insert into public.hero_roles (hero_key, role) values
  ('ana','support'),
  ('anran','damage'),
  ('ashe','damage'),
  ('baptiste','support'),
  ('bastion','damage'),
  ('brigitte','support'),
  ('cassidy','damage'),
  ('dmon','tank'),
  ('domina','tank'),
  ('doomfist','tank'),
  ('dva','tank'),
  ('echo','damage'),
  ('emre','damage'),
  ('freja','damage'),
  ('genji','damage'),
  ('hanzo','damage'),
  ('hazard','tank'),
  ('illari','support'),
  ('jetpack-cat','support'),
  ('junker-queen','tank'),
  ('junkrat','damage'),
  ('juno','support'),
  ('kiriko','support'),
  ('lifeweaver','support'),
  ('lucio','support'),
  ('mauga','tank'),
  ('mei','damage'),
  ('mercy','support'),
  ('mizuki','support'),
  ('moira','support'),
  ('orisa','tank'),
  ('pharah','damage'),
  ('ramattra','tank'),
  ('reaper','damage'),
  ('reinhardt','tank'),
  ('roadhog','tank'),
  ('shion','damage'),
  ('sierra','damage'),
  ('sigma','tank'),
  ('sojourn','damage'),
  ('soldier-76','damage'),
  ('sombra','damage'),
  ('symmetra','damage'),
  ('torbjorn','damage'),
  ('tracer','damage'),
  ('vendetta','damage'),
  ('venture','damage'),
  ('widowmaker','damage'),
  ('winston','tank'),
  ('wrecking-ball','tank'),
  ('wuyang','support'),
  ('zarya','tank'),
  ('zenyatta','support')
on conflict (hero_key) do update
set role = excluded.role,
    updated_at = now();

alter table public.hero_roles enable row level security;

drop policy if exists "hero_roles_authenticated_read" on public.hero_roles;
create policy "hero_roles_authenticated_read"
on public.hero_roles for select
to authenticated
using (true);

-- Canonical round/set data for Control and Flashpoint.
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  round_order integer not null check (round_order > 0),
  submap text,
  result text not null default 'unknown'
    check (result in ('win','loss','draw','unknown')),
  created_at timestamptz not null default now(),
  unique (match_id, round_order)
);

create index if not exists rounds_match_id_idx
  on public.rounds (match_id, round_order);
create index if not exists rounds_submap_idx
  on public.rounds (submap);

-- Shared reference list used by FE dropdowns.
create table if not exists public.map_submaps (
  id uuid primary key default gen_random_uuid(),
  map_name text not null,
  game_mode text not null check (game_mode in ('control','flashpoint')),
  submap_key text not null,
  submap_name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (map_name, submap_key)
);

create index if not exists map_submaps_lookup_idx
  on public.map_submaps (map_name, game_mode, sort_order);

-- Canonical Control / Flashpoint submap reference data.
-- map_name follows the Korean names used by ORCA OCR/FE.
insert into public.map_submaps (
  map_name, game_mode, submap_key, submap_name, sort_order, is_active
) values
  -- Control
  ('남극 반도','control','icebreaker','쇄빙선',1,true),
  ('남극 반도','control','labs','연구실',2,true),
  ('남극 반도','control','sublevel','지하층',3,true),

  ('부산','control','downtown','시내',1,true),
  ('부산','control','sanctuary','사찰',2,true),
  ('부산','control','meka-base','MEKA 기지',3,true),

  ('일리오스','control','lighthouse','등대',1,true),
  ('일리오스','control','well','우물',2,true),
  ('일리오스','control','ruins','폐허',3,true),

  ('리장 타워','control','night-market','야시장',1,true),
  ('리장 타워','control','garden','정원',2,true),
  ('리장 타워','control','control-center','관제 센터',3,true),

  ('네팔','control','village','마을',1,true),
  ('네팔','control','shrine','제단',2,true),
  ('네팔','control','sanctum','성소',3,true),

  ('오아시스','control','city-center','도심',1,true),
  ('오아시스','control','gardens','정원',2,true),
  ('오아시스','control','university','대학',3,true),

  ('사모아','control','beach','해변',1,true),
  ('사모아','control','downtown','시내',2,true),
  ('사모아','control','volcano','화산',3,true),

  -- Flashpoint
  ('뉴 정크 시티','flashpoint','arena','경기장',1,true),
  ('뉴 정크 시티','flashpoint','the-ducts','배관',2,true),
  ('뉴 정크 시티','flashpoint','refinery','제련소',3,true),
  ('뉴 정크 시티','flashpoint','junkyard','고철 처리장',4,true),
  ('뉴 정크 시티','flashpoint','bomb-flats','폭탄 지대',5,true),

  ('수라바사','flashpoint','market','시장',1,true),
  ('수라바사','flashpoint','garden','정원',2,true),
  ('수라바사','flashpoint','palace','궁전',3,true),
  ('수라바사','flashpoint','temple','사원',4,true),
  ('수라바사','flashpoint','ruins','폐허',5,true),

  ('아틀리스','flashpoint','station','스테이션',1,true),
  ('아틀리스','flashpoint','garden','정원',2,true),
  ('아틀리스','flashpoint','town-center','타운 센터',3,true),
  ('아틀리스','flashpoint','bazaar','바자르',4,true),
  ('아틀리스','flashpoint','resort','리조트',5,true)
on conflict (map_name, submap_key) do update
set game_mode = excluded.game_mode,
    submap_name = excluded.submap_name,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

alter table public.seasons enable row level security;
alter table public.patches enable row level security;
alter table public.rounds enable row level security;
alter table public.map_submaps enable row level security;

drop policy if exists "seasons_authenticated_read" on public.seasons;
create policy "seasons_authenticated_read"
on public.seasons for select
to authenticated
using (true);

drop policy if exists "patches_authenticated_read" on public.patches;
create policy "patches_authenticated_read"
on public.patches for select
to authenticated
using (true);

drop policy if exists "rounds_owner_all" on public.rounds;
create policy "rounds_owner_all"
on public.rounds for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "map_submaps_authenticated_read" on public.map_submaps;
create policy "map_submaps_authenticated_read"
on public.map_submaps for select
to authenticated
using (true);

-- Resolve season/patch whenever matches.played_at changes. This also keeps the
-- legacy FE strings in editable without making them the canonical DB values.
create or replace function public.apply_match_context_from_played_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $orca$
declare
  v_season_id uuid;
  v_season_name text;
  v_patch_id uuid;
  v_patch_label text;
begin
  if new.played_at is null then
    new.season_id := null;
    new.patch_id := null;
    new.editable := coalesce(new.editable, '{}'::jsonb)
      || jsonb_build_object('season', '', 'patch_label', '');
    return new;
  end if;

  select s.id, s.season_name
    into v_season_id, v_season_name
  from public.seasons s
  where s.starts_at <= new.played_at
    and (s.ends_at is null or new.played_at < s.ends_at)
  order by s.starts_at desc
  limit 1;

  select p.id, p.patch_label
    into v_patch_id, v_patch_label
  from public.patches p
  where p.effective_from is not null
    and p.effective_from <= new.played_at
    and (p.effective_to is null or new.played_at < p.effective_to)
  order by p.effective_from desc
  limit 1;

  new.season_id := v_season_id;
  new.patch_id := v_patch_id;
  new.editable := coalesce(new.editable, '{}'::jsonb)
    || jsonb_build_object(
      'season', coalesce(v_season_name, ''),
      'patch_label', coalesce(v_patch_label, '')
    );

  return new;
end;
$orca$;

drop trigger if exists matches_apply_context_from_played_at on public.matches;
create trigger matches_apply_context_from_played_at
before insert or update of played_at
on public.matches
for each row
execute function public.apply_match_context_from_played_at();


create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  team text not null check (team in ('ally','enemy')),
  slot integer not null check (slot between 1 and 5),
  player_name text,
  hero_id text,
  is_me boolean not null default false,
  role text,
  elims integer,
  assists integer,
  deaths integer,
  damage integer,
  healing integer,
  mitigation integer,
  created_at timestamptz not null default now(),
  created_at_kst timestamp,
  unique (match_id, team, slot)
);

alter table public.match_players add column if not exists elims integer;
alter table public.match_players add column if not exists assists integer;
alter table public.match_players add column if not exists deaths integer;
alter table public.match_players add column if not exists damage integer;
alter table public.match_players add column if not exists healing integer;
alter table public.match_players add column if not exists mitigation integer;
alter table public.match_players add column if not exists created_at_kst timestamp;

do $$
begin
  if to_regclass('public.match_player_stats') is not null then
    update public.match_players mp
    set
      elims = s.elims,
      assists = s.assists,
      deaths = s.deaths,
      damage = s.damage,
      healing = s.healing,
      mitigation = s.mitigation
    from public.match_player_stats s
    where s.match_player_id = mp.id;

    drop table public.match_player_stats;
  end if;
end;
$$;

create table if not exists public.my_hero_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  hero_id text,
  hero_key text,
  play_time text,
  play_time_seconds integer,
  weapon_accuracy text,
  players_saved text,
  objective_contest_time text,
  final_blows text,
  solo_kills text,
  hero_specific jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_at_kst timestamp
);

alter table public.my_hero_details add column if not exists hero_key text;
alter table public.my_hero_details add column if not exists play_time_seconds integer;
alter table public.my_hero_details add column if not exists weapon_accuracy text;
alter table public.my_hero_details add column if not exists players_saved text;
alter table public.my_hero_details add column if not exists objective_contest_time text;
alter table public.my_hero_details add column if not exists final_blows text;
alter table public.my_hero_details add column if not exists solo_kills text;
alter table public.my_hero_details add column if not exists created_at_kst timestamp;

-- Migrate legacy Personal columns/JSON into the new promoted metric columns.
-- Keep critical_hit_accuracy in hero_specific because it is not shared by a majority
-- of heroes in any role.
do $orca$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='my_hero_details' and column_name='accuracy'
  ) then
    execute $sql$
      update public.my_hero_details
      set weapon_accuracy = coalesce(
        nullif(weapon_accuracy,''),
        nullif(accuracy,''),
        nullif(hero_specific->>'weapon_accuracy','')
      )
    $sql$;
  else
    update public.my_hero_details
    set weapon_accuracy = coalesce(
      nullif(weapon_accuracy,''),
      nullif(hero_specific->>'weapon_accuracy','')
    );
  end if;

  update public.my_hero_details
  set
    players_saved = coalesce(nullif(players_saved,''), nullif(hero_specific->>'players_saved','')),
    objective_contest_time = coalesce(nullif(objective_contest_time,''), nullif(hero_specific->>'objective_contest_time','')),
    final_blows = coalesce(nullif(final_blows,''), nullif(hero_specific->>'final_blows','')),
    solo_kills = coalesce(nullif(solo_kills,''), nullif(hero_specific->>'solo_kills',''));

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='my_hero_details' and column_name='crit_rate'
  ) then
    execute $sql$
      update public.my_hero_details
      set hero_specific =
        (coalesce(hero_specific,'{}'::jsonb)
          - array['weapon_accuracy','players_saved','objective_contest_time','final_blows','solo_kills'])
        || case
             when nullif(crit_rate,'') is not null
               and nullif(hero_specific->>'critical_hit_accuracy','') is null
             then jsonb_build_object('critical_hit_accuracy', crit_rate)
             else '{}'::jsonb
           end
    $sql$;
  else
    update public.my_hero_details
    set hero_specific =
      coalesce(hero_specific,'{}'::jsonb)
      - array['weapon_accuracy','players_saved','objective_contest_time','final_blows','solo_kills'];
  end if;

  alter table public.my_hero_details drop column if exists accuracy;
  alter table public.my_hero_details drop column if exists crit_rate;
end;
$orca$;

alter table public.match_players enable row level security;
alter table public.my_hero_details enable row level security;

drop policy if exists "match_players_owner_all" on public.match_players;
create policy "match_players_owner_all"
on public.match_players
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "my_hero_details_owner_all" on public.my_hero_details;
create policy "my_hero_details_owner_all"
on public.my_hero_details
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Human-readable Korea Standard Time helper columns. Canonical timestamps remain
-- timestamptz; these helper columns exist only for easy DB inspection.
create or replace function public.sync_match_kst_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $orca$
begin
  new.played_at_kst := case
    when new.played_at is null then null
    else new.played_at at time zone 'Asia/Seoul'
  end;
  new.created_at_kst := case
    when new.created_at is null then null
    else new.created_at at time zone 'Asia/Seoul'
  end;
  return new;
end;
$orca$;

drop trigger if exists matches_sync_kst_columns on public.matches;
create trigger matches_sync_kst_columns
before insert or update of played_at, created_at
on public.matches
for each row
execute function public.sync_match_kst_columns();

create or replace function public.sync_match_duration_display()
returns trigger
language plpgsql
security invoker
set search_path = public
as $orca$
begin
  new.duration := case
    when new.duration_seconds is null then null
    else (new.duration_seconds / 60)::text
      || ':' || lpad((new.duration_seconds % 60)::text, 2, '0')
  end;
  return new;
end;
$orca$;

drop trigger if exists matches_sync_duration_display on public.matches;
create trigger matches_sync_duration_display
before insert or update of duration_seconds
on public.matches
for each row
execute function public.sync_match_duration_display();

create or replace function public.sync_created_at_kst()
returns trigger
language plpgsql
security invoker
set search_path = public
as $orca$
begin
  new.created_at_kst := case
    when new.created_at is null then null
    else new.created_at at time zone 'Asia/Seoul'
  end;
  return new;
end;
$orca$;

drop trigger if exists match_players_sync_created_at_kst on public.match_players;
create trigger match_players_sync_created_at_kst
before insert or update of created_at
on public.match_players
for each row
execute function public.sync_created_at_kst();

drop trigger if exists my_hero_details_sync_created_at_kst on public.my_hero_details;
create trigger my_hero_details_sync_created_at_kst
before insert or update of created_at
on public.my_hero_details
for each row
execute function public.sync_created_at_kst();

-- Backfill KST helper values for rows that already exist.
update public.matches
set
  played_at_kst = case when played_at is null then null else played_at at time zone 'Asia/Seoul' end,
  created_at_kst = case when created_at is null then null else created_at at time zone 'Asia/Seoul' end,
  duration = case
    when duration_seconds is null then null
    else (duration_seconds / 60)::text
      || ':' || lpad((duration_seconds % 60)::text, 2, '0')
  end;

update public.match_players
set created_at_kst = created_at at time zone 'Asia/Seoul';

update public.my_hero_details
set created_at_kst = created_at at time zone 'Asia/Seoul';

update public.my_hero_details
set play_time_seconds =
  split_part(play_time, ':', 1)::integer * 60
  + split_part(play_time, ':', 2)::integer
where play_time ~ '^[0-9]{1,3}:[0-9]{2}$'
  and play_time_seconds is null;

create or replace function public.confirm_orca_match(
  p_match_id uuid,
  p_match jsonb,
  p_players jsonb,
  p_my_hero_details jsonb,
  p_manual_fields jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_player jsonb;
  v_detail jsonb;
  v_personal_ocr jsonb;
  v_all_metrics jsonb;
  v_hero_specific jsonb;
  v_weapon_accuracy text;
  v_players_saved text;
  v_objective_contest_time text;
  v_final_blows text;
  v_solo_kills text;
  v_round jsonb;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.matches
    where id = p_match_id and user_id = v_user_id
  ) then
    raise exception 'MATCH_NOT_FOUND_OR_FORBIDDEN';
  end if;

  delete from public.match_players
   where match_id = p_match_id and user_id = v_user_id;
  delete from public.my_hero_details
   where match_id = p_match_id and user_id = v_user_id;

  for v_player in
    select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb))
  loop
    insert into public.match_players (
      user_id, match_id, team, slot, player_name, hero_id, is_me, role,
      elims, assists, deaths, damage, healing, mitigation
    ) values (
      v_user_id,
      p_match_id,
      nullif(v_player->>'team',''),
      nullif(v_player->>'slot','')::integer,
      nullif(v_player->>'player_name',''),
      nullif(v_player->>'hero',''),
      coalesce((v_player->>'is_me')::boolean, false),
      (
        select hr.role
        from public.hero_roles hr
        where hr.hero_key = nullif(v_player->>'hero_key','')
        limit 1
      ),
      nullif(regexp_replace(coalesce(v_player->>'eliminations',''), '[^0-9-]', '', 'g'),'')::integer,
      nullif(regexp_replace(coalesce(v_player->>'assists',''), '[^0-9-]', '', 'g'),'')::integer,
      nullif(regexp_replace(coalesce(v_player->>'deaths',''), '[^0-9-]', '', 'g'),'')::integer,
      nullif(regexp_replace(coalesce(v_player->>'damage',''), '[^0-9-]', '', 'g'),'')::integer,
      nullif(regexp_replace(coalesce(v_player->>'healing',''), '[^0-9-]', '', 'g'),'')::integer,
      nullif(regexp_replace(coalesce(v_player->>'mitigation',''), '[^0-9-]', '', 'g'),'')::integer
    );
  end loop;

  -- Final Personal save contract:
  -- 1) reviewed values received from FE win,
  -- 2) OCR values fill fields/metrics that FE has not provided yet,
  -- 3) legacy custom_label/custom_value remain supported during FE migration.
  for v_detail in
    select value from jsonb_array_elements(coalesce(p_my_hero_details, '[]'::jsonb))
  loop
    -- Use OCR fallback from the same hero only.
    v_personal_ocr := null;
    v_all_metrics := '{}'::jsonb;
    v_hero_specific := '{}'::jsonb;
    v_weapon_accuracy := null;
    v_players_saved := null;
    v_objective_contest_time := null;
    v_final_blows := null;
    v_solo_kills := null;

    if nullif(v_detail->>'hero_key','') is not null then
      select u.ocr_raw
        into v_personal_ocr
      from public.uploads u
      where u.match_id = p_match_id
        and u.user_id = v_user_id
        and u.screen_type = 'personal'
        and u.ocr_raw is not null
        and u.ocr_raw->>'hero_key' = v_detail->>'hero_key'
      order by u.created_at desc
      limit 1;
    end if;

    if v_personal_ocr is not null then
      select coalesce(
        jsonb_object_agg(metric->>'metric_key', metric->'value'),
        '{}'::jsonb
      )
      into v_all_metrics
      from jsonb_array_elements(coalesce(v_personal_ocr->'metrics','[]'::jsonb)) metric
      where nullif(metric->>'metric_key','') is not null;
    end if;

    -- FE-reviewed hero_specific values override OCR. Legacy accuracy/critical
    -- fields are accepted until FE migrates to the promoted metric contract.
    v_all_metrics :=
      coalesce(v_all_metrics,'{}'::jsonb)
      ||
      case
        when jsonb_typeof(v_detail->'hero_specific') = 'object'
          then v_detail->'hero_specific'
        else '{}'::jsonb
      end
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'weapon_accuracy', nullif(v_detail->>'accuracy',''),
          'critical_hit_accuracy', nullif(v_detail->>'critical',''),
          'custom_label', nullif(v_detail->>'custom_label',''),
          'custom_value', nullif(v_detail->>'custom_value','')
        )
      );

    v_weapon_accuracy := nullif(v_all_metrics->>'weapon_accuracy','');
    v_players_saved := nullif(v_all_metrics->>'players_saved','');
    v_objective_contest_time := nullif(v_all_metrics->>'objective_contest_time','');
    v_final_blows := nullif(v_all_metrics->>'final_blows','');
    v_solo_kills := nullif(v_all_metrics->>'solo_kills','');

    v_hero_specific :=
      coalesce(v_all_metrics,'{}'::jsonb)
      - array['weapon_accuracy','players_saved','objective_contest_time','final_blows','solo_kills'];

    insert into public.my_hero_details (
      user_id, match_id, hero_id, hero_key, play_time, play_time_seconds,
      weapon_accuracy, players_saved, objective_contest_time, final_blows, solo_kills,
      hero_specific
    ) values (
      v_user_id,
      p_match_id,
      nullif(v_detail->>'hero',''),
      coalesce(
        nullif(v_detail->>'hero_key',''),
        nullif(v_personal_ocr->>'hero_key','')
      ),
      coalesce(
        nullif(v_detail->>'play_time',''),
        nullif(v_personal_ocr->>'play_time','')
      ),
      case
        when coalesce(nullif(v_detail->>'play_time',''), nullif(v_personal_ocr->>'play_time','')) ~ '^[0-9]{1,3}:[0-9]{2}$' then
          split_part(coalesce(nullif(v_detail->>'play_time',''), nullif(v_personal_ocr->>'play_time','')), ':', 1)::integer * 60
          + split_part(coalesce(nullif(v_detail->>'play_time',''), nullif(v_personal_ocr->>'play_time','')), ':', 2)::integer
        else null
      end,
      v_weapon_accuracy,
      v_players_saved,
      v_objective_contest_time,
      v_final_blows,
      v_solo_kills,
      v_hero_specific
    );
  end loop;

  -- Backward-safe fallback for older FE versions with no hero-detail array:
  -- save the latest Personal OCR once per detected hero.
  if jsonb_array_length(coalesce(p_my_hero_details, '[]'::jsonb)) = 0 then
    for v_personal_ocr in
      select distinct on (u.ocr_raw->>'hero_key') u.ocr_raw
      from public.uploads u
      where u.match_id = p_match_id
        and u.user_id = v_user_id
        and u.screen_type = 'personal'
        and u.ocr_raw is not null
        and nullif(u.ocr_raw->>'hero_key','') is not null
      order by u.ocr_raw->>'hero_key', u.created_at desc
    loop
      v_all_metrics := '{}'::jsonb;
      v_hero_specific := '{}'::jsonb;
      v_weapon_accuracy := null;
      v_players_saved := null;
      v_objective_contest_time := null;
      v_final_blows := null;
      v_solo_kills := null;

      select coalesce(
        jsonb_object_agg(metric->>'metric_key', metric->'value'),
        '{}'::jsonb
      )
      into v_all_metrics
      from jsonb_array_elements(coalesce(v_personal_ocr->'metrics','[]'::jsonb)) metric
      where nullif(metric->>'metric_key','') is not null;

      v_weapon_accuracy := nullif(v_all_metrics->>'weapon_accuracy','');
      v_players_saved := nullif(v_all_metrics->>'players_saved','');
      v_objective_contest_time := nullif(v_all_metrics->>'objective_contest_time','');
      v_final_blows := nullif(v_all_metrics->>'final_blows','');
      v_solo_kills := nullif(v_all_metrics->>'solo_kills','');

      v_hero_specific :=
        coalesce(v_all_metrics,'{}'::jsonb)
        - array['weapon_accuracy','players_saved','objective_contest_time','final_blows','solo_kills'];

      insert into public.my_hero_details (
        user_id, match_id, hero_id, hero_key, play_time, play_time_seconds,
        weapon_accuracy, players_saved, objective_contest_time, final_blows, solo_kills,
        hero_specific
      ) values (
        v_user_id,
        p_match_id,
        nullif(v_personal_ocr->>'hero_id',''),
        nullif(v_personal_ocr->>'hero_key',''),
        nullif(v_personal_ocr->>'play_time',''),
        case
          when coalesce(v_personal_ocr->>'play_time','') ~ '^[0-9]{1,3}:[0-9]{2}$' then
            split_part(v_personal_ocr->>'play_time', ':', 1)::integer * 60
            + split_part(v_personal_ocr->>'play_time', ':', 2)::integer
          else null
        end,
        v_weapon_accuracy,
        v_players_saved,
        v_objective_contest_time,
        v_final_blows,
        v_solo_kills,
        v_hero_specific
      );
    end loop;
  end if;

  -- New structured round contract. Legacy control_submap / round_sequence stay
  -- in matches.editable for compatibility, but are not converted because they do
  -- not contain enough information to reconstruct every submap safely.
  if jsonb_typeof(p_manual_fields->'round_details') = 'array' then
    delete from public.rounds
     where match_id = p_match_id and user_id = v_user_id;

    for v_round in
      select value
      from jsonb_array_elements(p_manual_fields->'round_details')
    loop
      insert into public.rounds (
        user_id, match_id, round_order, submap, result
      ) values (
        v_user_id,
        p_match_id,
        nullif(v_round->>'order','')::integer,
        nullif(v_round->>'submap',''),
        case
          when v_round->>'result' in ('win','loss','draw','unknown')
            then v_round->>'result'
          else 'unknown'
        end
      );
    end loop;
  end if;

  update public.matches
  set
    editable = coalesce(editable, '{}'::jsonb) || coalesce(p_match, '{}'::jsonb),
    played_at = coalesce(nullif(p_match->>'played_at','')::timestamptz, played_at),
    map = coalesce(nullif(p_match->>'map_name',''), map),
    mode = coalesce(nullif(p_match->>'game_mode',''), mode),
    result = coalesce(nullif(p_match->>'result',''), result),
    side = coalesce(
      case
        when p_match->>'side' in ('attack','defense','neutral','unknown')
          then p_match->>'side'
        else null
      end,
      side
    ),
    duration_seconds = coalesce(
      case
        when coalesce(p_match->>'match_duration','') ~ '^[0-9]{1,3}:[0-9]{2}$' then
          split_part(p_match->>'match_duration', ':', 1)::integer * 60
          + split_part(p_match->>'match_duration', ':', 2)::integer
        else null
      end,
      duration_seconds
    ),
    import_status = 'confirmed'
  where id = p_match_id and user_id = v_user_id;

  return jsonb_build_object(
    'match_id', p_match_id,
    'status', 'confirmed',
    'season_id', (select season_id from public.matches where id = p_match_id),
    'patch_id', (select patch_id from public.matches where id = p_match_id),
    'season', (
      select s.season_name
      from public.matches m
      left join public.seasons s on s.id = m.season_id
      where m.id = p_match_id
    ),
    'patch_label', (
      select p.patch_label
      from public.matches m
      left join public.patches p on p.id = m.patch_id
      where m.id = p_match_id
    )
  );
end;
$$;

grant execute on function public.confirm_orca_match(uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;
