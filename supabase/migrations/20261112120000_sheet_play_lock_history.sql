-- RYT-070: the sheet play lock during encounters and the sheet change history (ADR 035).
--
-- Play lock. set_character_vitals keeps its signature, grants, campaign lock, request-id replay
-- and revision check. A caller who is not an active DM of the campaign cannot change current hit
-- points, temporary hit points or spent hit point dice while the character is a combatant of an
-- encounter in 'initiative' or 'active' ('Encounter locked'). Rests restore hit points and hit
-- dice, so a rest is refused by the same rule; spending or restoring resource pips, spell slots,
-- conditions, inspiration and death saves stay with the Player. The DM (console, combat RPCs and
-- this RPC) always can. get_character_play_lock(campaign, character) tells the sheet whether that
-- lock applies to the caller.
--
-- History. get_character_history(campaign, character, before_at, page_size) returns read-only,
-- field-level changes recorded by the existing audit triggers (character_events): identity, sheet
-- columns and every changed top-level build key, play state and resources. Each item carries its
-- time, kind, the actor as 'self' | 'dm' | 'player' | 'system' and, for a DM caller only, the
-- actor's display name. Newest first, at most 50 per page, paged by created_at.
--
-- Rename. rename_character(campaign, character, name) lets the DM or the assigned Player set the
-- character's name from the quick and blank sheet flows (RYT-072); 1–100 characters, trimmed.
--
-- Portraits. private.can_view_portrait (read by the character-portraits storage policy) now lets
-- every active member read the current portrait of an assigned, non-archived character;
-- list_character_portraits(campaign) returns the paths the caller may show (RYT-074). Anon and
-- outsiders are refused; a cross-campaign DM sees nothing of another campaign.
--
-- Actor matrix (lock, history and rename): anon cannot execute; outsiders, inactive members, another
-- Player of the campaign and a DM of another campaign raise Forbidden; the assigned Player and
-- the active DM of the campaign read (lock, history) or rename. The lock and history RPCs only
-- read.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has
-- the sheet and combat RPCs, the same DDL is executed again remapped with pre_admin.remap.

do $playlock$
declare ddl text := $ddl$
create or replace function private.character_in_live_encounter(target_campaign uuid, target_character uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.encounter_combatants c
    join public.encounters e on e.id = c.encounter_id and e.campaign_id = c.campaign_id
    where c.campaign_id = target_campaign and c.character_id = target_character
      and e.status in ('initiative', 'active'));
$fn$;
revoke all on function private.character_in_live_encounter(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_character_play_lock(target_campaign uuid, target_character uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare live boolean;
begin
  if not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  live := private.character_in_live_encounter(target_campaign, target_character);
  return jsonb_build_object('in_encounter', live,
    'locked', live and not private.is_campaign_dm(target_campaign));
end;
$fn$;
revoke all on function public.get_character_play_lock(uuid, uuid) from public, anon;
grant execute on function public.get_character_play_lock(uuid, uuid) to authenticated;

create or replace function public.set_character_vitals(target_campaign uuid, target_character uuid,
  expected_revision bigint, new_current_hp integer, new_temp_hp integer, new_hit_dice_spent integer,
  new_death_successes integer, new_death_failures integer, new_heroic_inspiration boolean,
  new_conditions text[], new_slots_used integer[], new_tracker_uses jsonb, request_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare current public.character_vitals; sheet public.character_sheets; prior private.sheet_requests;
  payload jsonb := jsonb_build_array('vitals', target_campaign, target_character, expected_revision,
    new_current_hp, new_temp_hp, new_hit_dice_spent, new_death_successes, new_death_failures,
    new_heroic_inspiration, new_conditions, new_slots_used, new_tracker_uses);
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.sheet_requests r where r.request_id = set_character_vitals.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result_revision;
  end if;
  select * into sheet from public.character_sheets
    where campaign_id = target_campaign and character_id = target_character;
  select * into current from public.character_vitals
    where campaign_id = target_campaign and character_id = target_character for update;
  if current.character_id is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
  if current.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if new_current_hp > sheet.max_hp or new_hit_dice_spent > sheet.level then
    raise exception 'Invalid vitals' using errcode = '22023'; end if;
  if (new_current_hp is distinct from current.current_hp or new_temp_hp is distinct from current.temp_hp
      or new_hit_dice_spent is distinct from current.hit_dice_spent)
      and not private.is_campaign_dm(target_campaign)
      and private.character_in_live_encounter(target_campaign, target_character) then
    raise exception 'Encounter locked' using errcode = 'P0001'; end if;
  update public.character_vitals set current_hp = new_current_hp, temp_hp = new_temp_hp,
    hit_dice_spent = new_hit_dice_spent, death_successes = new_death_successes,
    death_failures = new_death_failures, heroic_inspiration = new_heroic_inspiration,
    conditions = coalesce(new_conditions, array[]::text[]), slots_used = new_slots_used,
    tracker_uses = coalesce(new_tracker_uses, '{}'::jsonb), revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character;
  insert into private.sheet_requests values (request_id, auth.uid(), target_character, payload, current.revision + 1);
  return current.revision + 1;
end;
$fn$;
revoke all on function public.set_character_vitals(uuid, uuid, bigint, integer, integer, integer, integer,
  integer, boolean, text[], integer[], jsonb, uuid) from public, anon;
grant execute on function public.set_character_vitals(uuid, uuid, bigint, integer, integer, integer, integer,
  integer, boolean, text[], integer[], jsonb, uuid) to authenticated;

-- Field-level changes of one audit row. Columns are an allow-list per table; the build is compared
-- key by key so a history item names what changed (level, abilities, spells…), not the whole JSON.
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
          when 'characters' then array['name', 'is_active', 'archived_at', 'shares_live']
          else array[]::text[] end) with ordinality as k(field, ord)
      where split_part(kind, ':', 2) = 'UPDATE'
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
      'actor_name', case when dm and h.actor_id is not null then (select coalesce(
          nullif(left(u.raw_user_meta_data ->> 'full_name', 100), ''), u.email)::text
        from auth.users u where u.id = h.actor_id) end,
      'changes', h.changes) order by h.created_at desc, h.id desc)
    from (
      select x.id, x.created_at, x.kind, x.actor_id,
          private.history_changes(x.kind, x.before_value, x.after_value) changes
        from public.character_events x
        where x.campaign_id = target_campaign and x.character_id = target_character
          and x.kind in ('characters:INSERT', 'characters:UPDATE', 'character_sheets:UPDATE',
            'character_vitals:UPDATE', 'character_resources:UPDATE')
          and (before_at is null or x.created_at < before_at)
          and (x.kind = 'characters:INSERT'
            or jsonb_array_length(private.history_changes(x.kind, x.before_value, x.after_value)) > 0)
        order by x.created_at desc, x.id desc
        limit size) h), '[]'::jsonb);
end;
$fn$;
revoke all on function public.get_character_history(uuid, uuid, timestamptz, integer) from public, anon;
grant execute on function public.get_character_history(uuid, uuid, timestamptz, integer) to authenticated;

-- RYT-072: the quick and blank sheets ask the character's name; the DM or the assigned Player
-- renames it (the audit trigger records the change). Same name rule as characters.name.
create or replace function public.rename_character(target_campaign uuid, target_character uuid,
  new_name text)
returns text language plpgsql security definer set search_path = '' as $fn$
declare cleaned text := btrim(coalesce(new_name, ''));
begin
  if not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if char_length(cleaned) not between 1 and 100 then
    raise exception 'Invalid name' using errcode = '22023'; end if;
  update public.characters set name = cleaned
    where campaign_id = target_campaign and id = target_character and name is distinct from cleaned;
  return cleaned;
end;
$fn$;
revoke all on function public.rename_character(uuid, uuid, text) from public, anon;
grant execute on function public.rename_character(uuid, uuid, text) to authenticated;

-- RYT-074: every active member sees the current portrait of the campaign's assigned characters
-- (user decision 2026-11-09), so trades, the tabletop and the party show faces outside combat.
-- Owner and DM keep reading every portrait object; unassigned characters keep the RYT-043 rule
-- (visible while fighting visibly); archived characters and old portrait objects stay private.
create or replace function private.can_view_portrait(target_campaign uuid, target_character uuid, object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
begin
  return private.can_play_character(target_campaign, target_character) or (
    private.is_campaign_member(target_campaign)
    and exists (select 1 from public.character_sheets s
      join public.characters ch on ch.campaign_id = s.campaign_id and ch.id = s.character_id
      where s.campaign_id = target_campaign and s.character_id = target_character
        and s.portrait_path = object_name and ch.archived_at is null
        and (ch.user_id is not null or exists (select 1 from public.encounter_combatants c
          join public.encounters e on e.id = c.encounter_id
          where c.campaign_id = target_campaign and c.character_id = target_character and not c.hidden
            and e.status <> 'draft'))));
end;
$fn$;
revoke all on function private.can_view_portrait(uuid, uuid, text) from public, anon, authenticated;

-- The portrait paths a member may show, by the rule above (the DM gets every character's).
create or replace function public.list_character_portraits(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  return coalesce((select jsonb_agg(jsonb_build_object('character_id', s.character_id,
      'portrait_path', s.portrait_path) order by s.character_id)
    from public.character_sheets s
    join public.characters ch on ch.campaign_id = s.campaign_id and ch.id = s.character_id
    where s.campaign_id = target_campaign and s.portrait_path is not null
      and (dm or ch.user_id = viewer or private.can_view_portrait(target_campaign, ch.id, s.portrait_path))),
    '[]'::jsonb);
end;
$fn$;
revoke all on function public.list_character_portraits(uuid) from public, anon;
grant execute on function public.list_character_portraits(uuid) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre.set_character_vitals(uuid,uuid,bigint,integer,integer,integer,integer,integer,boolean,text[],integer[],jsonb,uuid)') is not null
      and to_regclass('pre.encounter_combatants') is not null
      and to_regclass('pre.character_events') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$playlock$;
