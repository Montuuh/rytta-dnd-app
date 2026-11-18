-- RYT-130 follow-up (backend): the level up appears in the character history, and a Player cannot
-- level up an absent character. 20261130120000 is applied in hosted environments, so the two gaps
-- found in review are closed here instead of editing it. Nothing is added, removed or rewritten in
-- any table; three functions are re-created with their signatures, grants and attributes.
--
-- 1. History. apply_level_up writes a character_events row of kind 'level_up' (before: level and
--    max_hp; after: level, max_hp and party_level), but get_character_history (latest definition
--    20261113120000) only read a fixed list of trigger kinds and private.history_changes (latest
--    definition 20261114120000) only diffed ':UPDATE' kinds. Both are re-created with every
--    existing behaviour kept: get_character_history also returns 'level_up' rows, and
--    history_changes diffs exactly two fields of a 'level_up' row, level then max_hp, each only
--    when it changed (a level up always changes level; a DM level up may keep max_hp). party_level
--    is never exposed through the history. The trigger rows of the same write
--    (character_sheets:UPDATE, character_vitals:UPDATE) are unchanged and still returned; they
--    share the transaction time ('at') with the 'level_up' row.
-- 2. Absent characters. log_roll refuses a caller who is not a DM of the campaign for an absent
--    character with 'Character unavailable'. apply_level_up (latest definition 20261130120000)
--    now applies the same rule, in the same check that refuses archived characters: an absent
--    character is not at the table, so its Player cannot level it; the DM still can (for example
--    to keep it in step with the party). A request-id replay is answered before the check, as in
--    log_roll, so a retry of a level up stored before the character was marked absent returns the
--    stored revision. Everything else in the function is identical.
--
-- Security. Every function keeps security definer (history_changes stays invoker and immutable)
-- with search_path ''. Grants are restated exactly as before: get_character_history and
-- apply_level_up execute for authenticated only, history_changes no client execute. No privilege
-- is widened. get_character_history keeps its own check (assigned Player or campaign DM through
-- private.can_play_character; Forbidden otherwise) and returns only the diffed fields, so the
-- Player who can already read the character's history sees the level up with level and max_hp
-- and never the raw audit row (character_events stays DM-only under RLS).
--
-- Actor matrix: anon has no execute; outsiders, inactive members, other Players and DMs of
-- another campaign raise Forbidden on both RPCs; the assigned Player reads the history and levels
-- up a present character; the campaign DM reads the history and levels up any character.
--
-- Environments: production runs the DDL on public / private. A PRE that has the objects of
-- 20261130120000 receives the same DDL through pre_admin.remap; create or replace is idempotent.

do $levelup$
declare ddl text := $ddl$
-- 20261114120000 plus the two fields of a 'level_up' row.
create or replace function private.history_changes(kind text, before_value jsonb, after_value jsonb)
returns jsonb language sql immutable set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('field', f.field, 'before', f.b, 'after', f.a)
      order by f.ord, f.field), '[]'::jsonb)
  from (
    select k.field, k.ord, before_value -> k.field b, after_value -> k.field a
      from unnest(case split_part(kind, ':', 1)
          when 'character_vitals' then array['current_hp', 'temp_hp', 'hit_dice_spent', 'death_successes',
            'death_failures', 'heroic_inspiration', 'conditions', 'slots_used', 'tracker_uses']
          when 'character_sheets' then array['status', 'level', 'max_hp', 'armor_class', 'portrait_path']
          when 'character_resources' then array['gold', 'water_units', 'rations', 'exhaustion']
          when 'characters' then array['name', 'is_active', 'archived_at', 'shares_live', 'absent']
          when 'level_up' then array['level', 'max_hp']
          else array[]::text[] end) with ordinality as k(field, ord)
      where (split_part(kind, ':', 2) = 'UPDATE' or kind = 'level_up')
        and (before_value -> k.field) is distinct from (after_value -> k.field)
    union all
    select 'build.' || b.key, 100, before_value -> 'build' -> b.key, after_value -> 'build' -> b.key
      from (select jsonb_object_keys(coalesce(before_value -> 'build', '{}'::jsonb)) key
            union select jsonb_object_keys(coalesce(after_value -> 'build', '{}'::jsonb))) b
      where kind = 'character_sheets:UPDATE'
        and (before_value -> 'build' -> b.key) is distinct from (after_value -> 'build' -> b.key)
  ) f;
$fn$;
revoke all on function private.history_changes(text, jsonb, jsonb) from public, anon, authenticated;

-- 20261113120000 plus 'level_up' rows.
create or replace function public.get_character_history(target_campaign uuid, target_character uuid,
  before_at timestamptz, page_size integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean;
  size integer := least(greatest(coalesce(page_size, 30), 1), 50);
begin
  if viewer is null or not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'at', h.created_at, 'kind', h.kind,
      'actor', case when h.actor_id is null then 'system' when h.actor_id = viewer then 'self'
        when exists (select 1 from public.campaign_members m where m.campaign_id = target_campaign
          and m.user_id = h.actor_id and m.role = 'dm') then 'dm' else 'player' end,
      'actor_name', case when dm and h.actor_id is not null then private.member_name(h.actor_id) end,
      'changes', h.changes) order by h.created_at desc, h.id desc)
    from (
      select x.id, x.created_at, x.kind, x.actor_id,
          private.history_changes(x.kind, x.before_value, x.after_value) changes
        from public.character_events x
        where x.campaign_id = target_campaign and x.character_id = target_character
          and x.kind in ('characters:INSERT', 'characters:UPDATE', 'character_sheets:UPDATE',
            'character_vitals:UPDATE', 'character_resources:UPDATE', 'level_up')
          and (before_at is null or x.created_at < before_at)
          and (x.kind = 'characters:INSERT'
            or jsonb_array_length(private.history_changes(x.kind, x.before_value, x.after_value)) > 0)
        order by x.created_at desc, x.id desc
        limit size) h), '[]'::jsonb);
end;
$fn$;
revoke all on function public.get_character_history(uuid, uuid, timestamptz, integer) from public, anon;
grant execute on function public.get_character_history(uuid, uuid, timestamptz, integer) to authenticated;

-- 20261130120000 with the log_roll absence rule for callers who are not the campaign DM.
create or replace function public.apply_level_up(target_campaign uuid, target_character uuid,
  expected_revision bigint, new_level integer, new_max_hp integer, new_build jsonb, request_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; party integer; ch public.characters;
  current public.character_sheets; prior private.sheet_requests;
  payload jsonb := jsonb_build_array('level_up', target_campaign, target_character, expected_revision,
    new_level, new_max_hp, new_build);
begin
  select c.party_level into party from public.campaigns c where c.id = target_campaign for update;
  if viewer is null or not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.sheet_requests r where r.request_id = apply_level_up.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> viewer or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result_revision;
  end if;
  dm := private.is_campaign_dm(target_campaign);
  select * into ch from public.characters c where c.campaign_id = target_campaign and c.id = target_character;
  select * into current from public.character_sheets s
    where s.campaign_id = target_campaign and s.character_id = target_character for update;
  if current.character_id is null or (not dm and (ch.archived_at is not null or ch.absent)) then
    raise exception 'Character unavailable' using errcode = '42501'; end if;
  if not dm and private.character_in_live_encounter(target_campaign, target_character) then
    raise exception 'Encounter locked' using errcode = 'P0001'; end if;
  if current.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if current.status <> 'complete' then
    raise exception 'Sheet incomplete' using errcode = 'P0001'; end if;
  if new_level is null or new_max_hp is null or new_build is null or jsonb_typeof(new_build) <> 'object'
      or new_level not between current.level + 1 and 20
      or new_max_hp not between current.max_hp and 9999
      or (not dm and (new_level <> current.level + 1
        or new_max_hp - current.max_hp not between 1 and 64)) then
    raise exception 'Invalid level' using errcode = '22023'; end if;
  if not dm and (new_build ->> 'classKey') is distinct from (current.build ->> 'classKey') then
    raise exception 'Class change' using errcode = 'P0001'; end if;
  if not dm and (party is null or new_level > party) then
    raise exception 'Above party level' using errcode = 'P0001'; end if;
  update public.character_sheets set level = new_level, max_hp = new_max_hp, build = new_build,
    revision = revision + 1, updated_at = now()
    where campaign_id = target_campaign and character_id = target_character;
  -- Current HP rises by what the maximum gained.
  update public.character_vitals set current_hp = least(current_hp + (new_max_hp - current.max_hp), new_max_hp),
    revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character
      and new_max_hp > current.max_hp;
  insert into public.character_events(campaign_id, character_id, actor_id, kind, before_value, after_value)
    values (target_campaign, target_character, viewer, 'level_up',
      jsonb_build_object('level', current.level, 'max_hp', current.max_hp),
      jsonb_build_object('level', new_level, 'max_hp', new_max_hp, 'party_level', party));
  insert into private.sheet_requests(request_id, actor_id, character_id, payload, result_revision)
    values (request_id, viewer, target_character, payload, current.revision + 1);
  return current.revision + 1;
end;
$fn$;
revoke all on function public.apply_level_up(uuid, uuid, bigint, integer, integer, jsonb, uuid) from public, anon;
grant execute on function public.apply_level_up(uuid, uuid, bigint, integer, integer, jsonb, uuid) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre_admin.remap(text)') is not null
      and to_regclass('pre.character_events') is not null
      and to_regclass('pre_private.sheet_requests') is not null
      and to_regprocedure('pre_private.history_changes(text,jsonb,jsonb)') is not null
      and to_regprocedure('pre_private.member_name(uuid)') is not null
      and to_regprocedure('pre_private.character_in_live_encounter(uuid,uuid)') is not null
      and to_regprocedure('pre.get_character_history(uuid,uuid,timestamptz,integer)') is not null
      and to_regprocedure('pre.apply_level_up(uuid,uuid,bigint,integer,integer,jsonb,uuid)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$levelup$;
