-- ORCA structured match confirmation schema v0.1
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

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
  unique (match_id, team, slot)
);

alter table public.match_players add column if not exists elims integer;
alter table public.match_players add column if not exists assists integer;
alter table public.match_players add column if not exists deaths integer;
alter table public.match_players add column if not exists damage integer;
alter table public.match_players add column if not exists healing integer;
alter table public.match_players add column if not exists mitigation integer;

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
  accuracy text,
  crit_rate text,
  hero_specific jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.my_hero_details add column if not exists hero_key text;

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
      user_id, match_id, hero_id, hero_key, play_time, accuracy, crit_rate, hero_specific
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
      user_id, match_id, hero_id, hero_key, play_time, accuracy, crit_rate, hero_specific
    ) values (
      v_user_id,
      p_match_id,
      null,
      nullif(v_personal_ocr->>'hero_key',''),
      nullif(v_personal_ocr->>'play_time',''),
      v_ocr_accuracy,
      v_ocr_crit_rate,
      coalesce(v_hero_specific,'{}'::jsonb)
    );
  end if;

  update public.matches
  set
    editable = coalesce(editable, '{}'::jsonb) || coalesce(p_match, '{}'::jsonb),
    played_at = coalesce(nullif(p_match->>'played_at','')::timestamptz, played_at),
    map = coalesce(nullif(p_match->>'map_name',''), map),
    mode = coalesce(nullif(p_match->>'game_mode',''), mode),
    result = coalesce(nullif(p_match->>'result',''), result),
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

  return jsonb_build_object('match_id', p_match_id, 'status', 'confirmed');
end;
$$;

grant execute on function public.confirm_orca_match(uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;
