-- RYT-041: roster changes while a fight runs.
--
-- add_combatants: a character entry accepts an optional initiative total (-20..99), so the DM adds
--   a party character mid-combat already placed in the order. Turns follow the initiative order by
--   position: a total above the active combatant's slot acts from the next round, a lower one still
--   acts this round. When an active encounter has no active combatant (everyone left), the first
--   combatant in the turn order starts its turn.
-- remove_combatant: removing the active combatant passes the turn to the next combatant in the
--   order (the round advances when it was the last one), resets that combatant's legendary actions
--   and ticks its start-of-turn effects, exactly like advance_turn. Effects on the leaving combatant
--   end first (effect_off), so conditions they granted leave the character sheet; effects it was
--   the source of stay on their targets and count down on the target's turns (source set null).
--   Its log entries remain; undoing them is refused (Combatant unavailable).
-- private.combat_start_turn: shared start-of-turn step (legendary reset + start ticks).
--
-- Actor matrix (unchanged from 20261104120000): anon cannot execute; outsiders, inactive members
-- and DMs of another campaign raise Forbidden / Encounter unavailable / Combatant unavailable;
-- Players raise Forbidden; only an active DM of the campaign changes the roster. Both RPCs lock the
-- campaign row first and replay retried request ids (private.combat_requests). Signatures, grants
-- and the get_combat_state projection do not change.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has
-- the combat RPCs, the same DDL is executed again remapped with pre_admin.remap.

do $roster$
declare ddl text := $ddl$
create or replace function private.combat_start_turn(e public.encounters, who uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  if who is null then return; end if;
  update public.encounter_combatants set legendary_used = 0 where id = who and legendary_used <> 0;
  perform private.combat_tick(e, who, 'start');
end;
$fn$;
revoke all on function private.combat_start_turn(public.encounters, uuid) from public, anon, authenticated;

-- entries: [{kind:'character', character_id, initiative?}
--          | {kind:'npc', name, count, max_hp, armor_class, initiative_bonus, side, hidden,
--             share_initiative, legendary_max, dm_notes, template_id}
--          | {kind:'lair', name}]
create or replace function public.add_combatants(target_campaign uuid, target_encounter uuid, entries jsonb,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('combatants_add', target_campaign, target_encounter, entries);
  replay jsonb; e public.encounters; entry jsonb; t public.combatant_templates; ch public.characters;
  base_name text; total integer; existing integer; i integer; hp integer; ac integer; bonus integer;
  side_value text; legendary integer; notes text; hidden_value boolean; group_value text;
  initiative_value integer; turn_order uuid[];
  added public.encounter_combatants; added_count integer := 0;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  e := private.combat_encounter(target_campaign, target_encounter);
  if e.status = 'ended' then raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  if entries is null or jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) not between 1 and 30 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  for entry in select value from jsonb_array_elements(entries) loop
    if jsonb_typeof(entry) <> 'object' then raise exception 'Invalid request' using errcode = '22023'; end if;
    if entry ->> 'kind' = 'character' then
      if coalesce(entry ->> 'character_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      initiative_value := private.combat_int(entry, 'initiative', -20, 99, null);
      select * into ch from public.characters c
        where c.campaign_id = target_campaign and c.id = (entry ->> 'character_id')::uuid;
      if ch.id is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
      insert into public.encounter_combatants(campaign_id, encounter_id, kind, character_id, side, name, initiative)
        values (target_campaign, e.id, 'character', ch.id, 'party', left(ch.name, 80), initiative_value)
        on conflict (encounter_id, character_id) do nothing
        returning * into added;
      if added.id is not null then
        added_count := added_count + 1;
        perform private.combat_log(e, 'join', added, initiative_value, '{}'::jsonb, null, null, true);
      end if;
      added := null;
    elsif entry ->> 'kind' = 'lair' then
      base_name := coalesce(nullif(private.combat_text(entry, 'name', 80, ''), ''), 'Lair');
      insert into public.encounter_combatants(campaign_id, encounter_id, kind, side, name, initiative,
          initiative_bonus, order_key, max_hp, current_hp, hidden)
        values (target_campaign, e.id, 'lair', 'enemy', base_name, 20, -20, 1000, 1, 1,
          private.combat_bool(entry, 'hidden', false))
        returning * into added;
      added_count := added_count + 1;
      perform private.combat_log(e, 'join', added, null, '{}'::jsonb, null, null, true);
    elsif entry ->> 'kind' = 'npc' then
      t := null;
      if entry ? 'template_id' and jsonb_typeof(entry -> 'template_id') = 'string' then
        if (entry ->> 'template_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'Invalid request' using errcode = '22023'; end if;
        select * into t from public.combatant_templates
          where campaign_id = target_campaign and id = (entry ->> 'template_id')::uuid;
        if t.id is null then raise exception 'Template unavailable' using errcode = '42501'; end if;
      end if;
      base_name := coalesce(nullif(private.combat_text(entry, 'name', 70, null), ''), t.name);
      if base_name is null then raise exception 'Invalid request' using errcode = '22023'; end if;
      total := private.combat_int(entry, 'count', 1, 20, 1);
      hp := private.combat_int(entry, 'max_hp', 1, 99999, t.max_hp);
      if hp is null then raise exception 'Invalid request' using errcode = '22023'; end if;
      ac := private.combat_int(entry, 'armor_class', 0, 99, coalesce(t.armor_class, 10));
      bonus := private.combat_int(entry, 'initiative_bonus', -20, 30, coalesce(t.initiative_bonus, 0));
      legendary := private.combat_int(entry, 'legendary_max', 0, 9, coalesce(t.legendary_max, 0));
      side_value := coalesce(private.combat_text(entry, 'side', 10, null), t.side, 'enemy');
      if side_value not in ('ally', 'enemy') then raise exception 'Invalid request' using errcode = '22023'; end if;
      notes := coalesce(private.combat_text(entry, 'dm_notes', 2000, null), t.notes, '');
      hidden_value := private.combat_bool(entry, 'hidden', false);
      group_value := case when total > 1 and private.combat_bool(entry, 'share_initiative', false)
        then base_name || ':' || gen_random_uuid()::text else null end;
      -- Numbering continues after combatants already named "<base>" or "<base> N".
      select count(*) into existing from public.encounter_combatants c
        where c.encounter_id = e.id and (c.name = base_name
          or (left(c.name, char_length(base_name) + 1) = base_name || ' '
            and substr(c.name, char_length(base_name) + 2) ~ '^[0-9]+$'));
      for i in 1 .. total loop
        insert into public.encounter_combatants(campaign_id, encounter_id, kind, side, name,
            initiative_bonus, group_key, max_hp, current_hp, armor_class, hidden, legendary_max, dm_notes)
          values (target_campaign, e.id, 'npc', side_value,
            case when total = 1 and existing = 0 then base_name else base_name || ' ' || (existing + i)::text end,
            bonus, group_value, hp, hp, ac, hidden_value, legendary, notes)
          returning * into added;
        added_count := added_count + 1;
        perform private.combat_log(e, 'join', added, null, '{}'::jsonb, null, null, true);
      end loop;
    else
      raise exception 'Invalid request' using errcode = '22023';
    end if;
  end loop;
  -- A running fight that lost every combatant resumes with the first one in the order.
  if e.status = 'active' and e.active_combatant is null then
    turn_order := private.combat_order(e.id, true);
    if cardinality(turn_order) > 0 then
      update public.encounters set active_combatant = turn_order[1], updated_at = now()
        where id = e.id returning * into e;
      select * into added from public.encounter_combatants where id = turn_order[1];
      perform private.combat_log(e, 'turn', added, null, jsonb_build_object('direction', 1), null, null, true);
      perform private.combat_start_turn(e, turn_order[1]);
    end if;
  end if;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload,
    private.combat_result(e.id) || jsonb_build_object('added', added_count));
end;
$fn$;

create or replace function public.remove_combatant(target_campaign uuid, target_combatant uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('combatant_remove', target_campaign, target_combatant);
  replay jsonb; e public.encounters; c public.encounter_combatants; next_c public.encounter_combatants;
  fx public.encounter_effects; all_ids uuid[]; turn_order uuid[]; pos integer; next_id uuid;
  old_round integer; new_round integer; was_active boolean;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  if e.status = 'ended' then raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  c := private.combat_combatant(e, c.id);
  was_active := e.status = 'active' and e.active_combatant = c.id;
  if was_active then
    -- The turn passes forward from the leaving combatant's slot, wrapping into the next round.
    all_ids := private.combat_order(e.id, false);
    turn_order := array_remove(private.combat_order(e.id, true), c.id);
    pos := array_position(all_ids, c.id);
    old_round := e.round;
    new_round := e.round;
    select o.id into next_id from unnest(turn_order) o(id)
      where array_position(all_ids, o.id) > pos
      order by array_position(all_ids, o.id) limit 1;
    if next_id is null and cardinality(turn_order) > 0 then
      next_id := turn_order[1];
      new_round := least(9999, e.round + 1);
    end if;
  end if;
  for fx in select * from public.encounter_effects f where f.target_combatant = c.id
      order by f.created_at, f.id for update loop
    perform private.combat_drop_effect(e, fx, 'effect_off');
  end loop;
  perform private.combat_log(e, 'leave', c, null, '{}'::jsonb, null, null, true);
  delete from public.encounter_combatants where id = c.id;
  if was_active then
    update public.encounters set active_combatant = next_id, round = new_round, updated_at = now()
      where id = e.id returning * into e;
    if next_id is not null then
      select * into next_c from public.encounter_combatants where id = next_id;
      perform private.combat_log(e, case when new_round > old_round then 'round' else 'turn' end,
        next_c, null, jsonb_build_object('direction', 1), null, null, true);
      perform private.combat_start_turn(e, next_id);
    end if;
  end if;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$fn$;

revoke all on function public.add_combatants(uuid, uuid, jsonb, uuid), public.remove_combatant(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.add_combatants(uuid, uuid, jsonb, uuid), public.remove_combatant(uuid, uuid, uuid)
  to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre.remove_combatant(uuid,uuid,uuid)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$roster$;
