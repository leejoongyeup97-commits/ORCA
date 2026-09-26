-- ORCA structured match confirmation schema v0.1
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Match context reference data -------------------------------------------------

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  season_key text not null unique,
  season_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

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

alter table public.matches add column if not exists season_id uuid;
alter table public.matches add column if not exists patch_id uuid;
alter table public.matches add column if not exists side text;
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
create index if not exists patches_effective_from_idx
  on public.patches (effective_from desc);
create index if not exists matches_season_id_idx
  on public.matches (season_id);
create index if not exists matches_patch_id_idx
  on public.matches (patch_id);

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
  created_at_kst = case when created_at is null then null else created_at at time zone 'Asia/Seoul' end;

update public.match_players
set created_at_kst = created_at at time zone 'Asia/Seoul';

update public.my_hero_details
set created_at_kst = created_at at time zone 'Asia/Seoul';

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
  accuracy text,
  crit_rate text,
  hero_specific jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_at_kst timestamp
);

alter table public.my_hero_details add column if not exists hero_key text;
alter table public.my_hero_details add column if not exists play_time_seconds integer;
alter table public.my_hero_details add column if not exists created_at_kst timestamp;

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
  v_hero_specific jsonb;
  v_ocr_accuracy text;
  v_ocr_crit_rate text;
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

  -- Personal OCR is already persisted in uploads. Read it directly here so the
  -- structured save does not depend on FE mapping every hero-specific metric.
  select u.ocr_raw
    into v_personal_ocr
  from public.uploads u
  where u.match_id = p_match_id
    and u.user_id = v_user_id
    and u.screen_type = 'personal'
    and u.ocr_raw is not null
  order by u.created_at desc
  limit 1;

  v_hero_specific := '{}'::jsonb;
  v_ocr_accuracy := null;
  v_ocr_crit_rate := null;

  if v_personal_ocr is not null then
    select coalesce(
      jsonb_object_agg(metric->>'metric_key', metric->'value'),
      '{}'::jsonb
    )
    into v_hero_specific
    from jsonb_array_elements(coalesce(v_personal_ocr->'metrics','[]'::jsonb)) metric
    where nullif(metric->>'metric_key','') is not null
      and coalesce(metric->>'scope','') = 'hero_specific';

    select metric->>'value'
      into v_ocr_accuracy
    from jsonb_array_elements(coalesce(v_personal_ocr->'metrics','[]'::jsonb)) metric
    where metric->>'metric_key' = 'weapon_accuracy'
    limit 1;

    select metric->>'value'
      into v_ocr_crit_rate
    from jsonb_array_elements(coalesce(v_personal_ocr->'metrics','[]'::jsonb)) metric
    where metric->>'metric_key' = 'critical_hit_accuracy'
    limit 1;
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
      nullif(v_player->>'role',''),
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
    insert into public.my_hero_details (
      user_id, match_id, hero_id, hero_key, play_time, play_time_seconds, accuracy, crit_rate, hero_specific
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
      coalesce(
        nullif(v_detail->>'accuracy',''),
        v_ocr_accuracy
      ),
      coalesce(
        nullif(v_detail->>'critical',''),
        v_ocr_crit_rate
      ),
      coalesce(v_hero_specific,'{}'::jsonb)
      ||
      case
        when jsonb_typeof(v_detail->'hero_specific') = 'object'
          then v_detail->'hero_specific'
        else '{}'::jsonb
      end
      ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'custom_label', nullif(v_detail->>'custom_label',''),
          'custom_value', nullif(v_detail->>'custom_value','')
        )
      )
    );
  end loop;

  -- Backward-safe OCR fallback: if an older FE sends no hero-detail array at all,
  -- still keep the extracted Personal data instead of silently dropping it.
  if jsonb_array_length(coalesce(p_my_hero_details, '[]'::jsonb)) = 0
     and v_personal_ocr is not null then
    insert into public.my_hero_details (
      user_id, match_id, hero_id, hero_key, play_time, play_time_seconds, accuracy, crit_rate, hero_specific
    ) values (
      v_user_id,
      p_match_id,
      null,
      nullif(v_personal_ocr->>'hero_key',''),
      nullif(v_personal_ocr->>'play_time',''),
      case
        when coalesce(v_personal_ocr->>'play_time','') ~ '^[0-9]{1,3}:[0-9]{2}$' then
          split_part(v_personal_ocr->>'play_time', ':', 1)::integer * 60
          + split_part(v_personal_ocr->>'play_time', ':', 2)::integer
        else null
      end,
      v_ocr_accuracy,
      v_ocr_crit_rate,
      coalesce(v_hero_specific,'{}'::jsonb)
    );
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
