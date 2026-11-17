-- RYT-118: the combat projection carries the SRD class key of character combatants, so the
-- Table view and Players draw the same class emblem as the DM console instead of initials, and it
-- closes the remaining ways an alias or a hidden combatant could be uncovered by Players.
--
-- get_combat_state (same signature and grants). The DM's full view only gains class_key; every
-- other change applies to Players and the table (as_table, the DM's table screen included):
--   - class_key: the sheet's build classKey when it is one of the twelve SRD classes, for
--     kind = 'character' only; creatures, NPCs and the lair never carry it. Hidden combatants are
--     not in the rows, as before. Absent while the character has a table alias (public_name).
--   - A character under an alias is treated as not sharing live vitals: no portrait (image_path),
--     no class, no hit points, armor class, conditions, concentration, death saves or exhaustion
--     (all sheet or vitals values another screen shows next to the real name); its bands read
--     'unknown'. Its own Player (not on the table screen) still sees it all, as the owner.
--     character_id stays limited to the full view and own rows, as before.
--   - Log: events whose target is currently hidden are left out (a combatant hidden after it
--     joined kept its visible join event). A removed combatant's events show the alias it had when
--     it left, never the stored real name. The newest 60 events Players read are still a subset of
--     the newest 60 visible ones that private.prune_stale_rows keeps for ended encounters.
--
-- private.combat_log (same signature) also records the target's alias in the event detail as
-- target_alias, so the alias survives the combatant's removal. Existing events are not rewritten:
-- a combatant removed before this migration keeps its stored name in the Players' log.
--
-- Actor matrix: anon cannot execute (no grant); outsiders and DMs of other campaigns raise
-- Forbidden through the campaign membership check, as before; Players and the table read the
-- masked projection above; the campaign DM reads the full view. combat_log stays without execute
-- for public, anon and authenticated.
--
-- Environments: production runs the DDL on public / private. A PRE that already has the combat
-- projection with aliases (pre.get_combat_state, pre_private.combat_log and
-- pre.encounter_combatants.public_name) receives the same DDL through pre_admin.remap; create or
-- replace keeps it idempotent. It depends on no migration after 20261124120000.

do $m$
declare ddl text := $ddl$
create or replace function private.combat_log(e public.encounters, event_kind text,
  target public.encounter_combatants, event_amount integer, event_detail jsonb, before_snapshot jsonb,
  after_snapshot jsonb, is_visible boolean) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare new_id uuid;
begin
  insert into public.encounter_events(campaign_id, encounter_id, round, kind, actor_id, source_combatant,
    target_combatant, target_name, amount, detail, before_state, after_state, visible)
  values (e.campaign_id, e.id, e.round, event_kind, auth.uid(), e.active_combatant, target.id, target.name,
    event_amount, coalesce(event_detail, '{}'::jsonb)
      -- RYT-118: the alias outlives the combatant, so a removed one never shows its real name.
      || case when target.public_name is not null
        then jsonb_build_object('target_alias', target.public_name) else '{}'::jsonb end,
    before_snapshot, after_snapshot, is_visible and not coalesce(target.hidden, false))
  returning id into new_id;
  return new_id;
end;
$fn$;
revoke all on function private.combat_log(public.encounters, text, public.encounter_combatants, integer,
  jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;

create or replace function public.get_combat_state(target_campaign uuid, target_encounter uuid, as_table boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; full_view boolean; e public.encounters;
  turn_order uuid[]; all_order uuid[];
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  full_view := dm and not coalesce(as_table, false);
  if target_encounter is null then
    select * into e from public.encounters x where x.campaign_id = target_campaign and x.status <> 'draft'
      order by case when x.status in ('initiative', 'active') then 0 else 1 end, x.updated_at desc limit 1;
    if e.id is null then return jsonb_build_object('encounter', null); end if;
  else
    select * into e from public.encounters x where x.campaign_id = target_campaign and x.id = target_encounter;
    if e.id is null or (e.status = 'draft' and not full_view) then
      raise exception 'Encounter unavailable' using errcode = '42501'; end if;
  end if;
  turn_order := private.combat_order(e.id, true);
  all_order := private.combat_order(e.id, false);
  return jsonb_build_object(
    'viewer', jsonb_build_object('role', case when full_view then 'dm' when as_table then 'table' else 'player' end),
    'encounter', jsonb_build_object('id', e.id, 'name', e.name, 'status', e.status, 'round', e.round,
      'active_combatant', case when full_view or not exists (select 1 from public.encounter_combatants h
        where h.id = e.active_combatant and h.hidden) then e.active_combatant end,
      'revision', e.revision, 'started_at', e.started_at, 'ended_at', e.ended_at, 'updated_at', e.updated_at,
      'summary', case when e.summary is null then null when full_view then e.summary
        -- ADR 028: Players and the table read the alias of a creature that still has one.
        else e.summary || jsonb_build_object('combatants', coalesce((select jsonb_agg(s.value
            || case when c.public_name is not null then jsonb_build_object('name', c.public_name)
              else '{}'::jsonb end)
          from jsonb_array_elements(e.summary -> 'combatants') s
          join public.encounter_combatants c on c.id = (s.value ->> 'combatant_id')::uuid and not c.hidden),
          '[]'::jsonb)) end),
    'combatants', coalesce((select jsonb_agg(row_json order by pos) from (
      select array_position(all_order, c.id) pos,
        jsonb_strip_nulls(jsonb_build_object(
          'id', c.id, 'kind', c.kind, 'side', c.side,
          'name', case when full_view then c.name else coalesce(c.public_name, c.name) end,
          'public_name', case when full_view then c.public_name end,
          'srd_id', case when full_view then c.srd_id end,
          'template_id', case when full_view then c.template_id end,
          'trackers', case when full_view and jsonb_array_length(c.trackers) > 0 then c.trackers end,
          'initiative', c.initiative,
          'initiative_bonus', case when full_view or own then c.initiative_bonus end,
          'in_turn_order', c.id = any(turn_order),
          'is_active', coalesce(c.id = e.active_combatant, false),
          'is_own', own,
          'can_act', own or full_view,
          'defeated', c.defeated,
          'character_id', case when full_view or own then c.character_id end,
          -- RYT-118: the SRD class of a character, for the token's emblem. Players and the table get
          -- it only while the character shows its real name (an alias hides it, like the image).
          'class_key', case when c.kind = 'character' and (full_view or c.public_name is null)
            and c.sheet_class in ('barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin',
              'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard') then c.sheet_class end,
          'hidden', case when full_view then c.hidden end,
          'shares_live', case when full_view and c.kind = 'character' then shared end,
          'hp_revealed', case when full_view then c.hp_revealed end,
          'group_key', case when full_view then c.group_key end,
          'dm_notes', case when full_view then c.dm_notes end,
          'legendary', case when full_view and c.legendary_max > 0
            then jsonb_build_object('max', c.legendary_max, 'used', c.legendary_used) end,
          'hp', case when c.kind = 'lair' then null
            when full_view or own or shared or (c.kind = 'npc' and c.hp_revealed) then
              jsonb_build_object('current', hp_cur, 'max', hp_max, 'temp', hp_tmp) end,
          'hp_status', case when c.kind = 'lair' then null
            when c.kind = 'character' and not (full_view or own or shared) then 'unknown'
            when c.defeated and c.kind <> 'character' then 'down'
            when coalesce(hp_cur, 0) <= 0 then 'down'
            when hp_cur >= hp_max then 'unhurt'
            when hp_cur * 2 > hp_max then 'wounded'
            else 'bloodied' end,
          -- RYT-043: five named bands; the table shows them for creatures instead of numbers.
          'hp_band', case when c.kind = 'lair' then null
            when c.kind = 'character' and not (full_view or own or shared) then 'unknown'
            when c.defeated and c.kind <> 'character' then 'down'
            when coalesce(hp_cur, 0) <= 0 then 'down'
            when hp_cur >= hp_max then 'unhurt'
            when hp_cur * 2 > hp_max then 'wounded'
            when hp_cur * 4 > hp_max then 'bloodied'
            else 'critical' end,
          -- ADR 028: a creature under an alias shows no image to Players (it would give it away).
          'image_path', case when c.kind = 'character' and (full_view or own or c.public_name is null)
              then c.portrait_path
            when c.kind = 'npc' and (full_view or c.public_name is null) then c.template_image end,
          'armor_class', case when full_view or own or shared then ac end,
          'conditions', case when c.kind = 'lair' then null
            when c.kind <> 'character' or full_view or own or shared then to_jsonb(conds) end,
          'concentration', case when c.kind <> 'character' or full_view or own or shared then c.concentration end,
          'death_saves', case when c.kind = 'character' and (full_view or own or shared)
            then jsonb_build_object('successes', ds, 'failures', df) end,
          'exhaustion', case when c.kind = 'character' and (full_view or own or shared) then exh end,
          -- RYT-045: death save outcomes are table knowledge, also where vitals are not shared.
          'death_state', c.death_state
        )) row_json
      from (
        select x.*, ch.user_id,
          coalesce(x.kind = 'character' and ch.user_id = viewer and not coalesce(as_table, false), false) own,
          -- RYT-118: under an alias a character shares nothing with Players or the table.
          (x.kind = 'character' and ch.user_id is not null and ch.shares_live
            and (full_view or x.public_name is null)) shared,
          case when x.kind = 'character' then v.current_hp else x.current_hp end hp_cur,
          case when x.kind = 'character' then s.max_hp else x.max_hp end hp_max,
          case when x.kind = 'character' then v.temp_hp else x.temp_hp end hp_tmp,
          case when x.kind = 'character' then s.armor_class else x.armor_class end ac,
          case when x.kind = 'character' then v.conditions else x.conditions end conds,
          v.death_successes ds, v.death_failures df, r.exhaustion::integer exh,
          case when x.kind <> 'character' or x.defeated then null
            when coalesce(v.current_hp, 0) <= 0 and v.death_successes >= 3 then 'stable'
            when coalesce(v.current_hp, 0) > 0 and e.status = 'active' and (select d.detail ->> 'result'
                from public.encounter_events d
                where d.encounter_id = e.id and d.target_combatant = x.id and d.kind = 'death_save'
                  and d.round = e.round and d.undone_by is null
                order by d.created_at desc, d.id desc limit 1) = 'up' then 'revived' end death_state,
          s.portrait_path, tp.image_path template_image, s.build ->> 'classKey' sheet_class
        from public.encounter_combatants x
        left join public.combatant_templates tp on tp.id = x.template_id
        left join public.characters ch on ch.id = x.character_id
        left join public.character_vitals v on v.character_id = x.character_id
        left join public.character_sheets s on s.character_id = x.character_id
        left join public.character_resources r on r.character_id = x.character_id
        where x.encounter_id = e.id and (full_view or not x.hidden)
      ) c
    ) rows), '[]'::jsonb),
    'effects', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'target_combatant', f.target_combatant,
        'source_combatant', case when full_view or src.id is null or not src.hidden then f.source_combatant end,
        'label', f.label, 'condition', f.condition, 'remaining_rounds', f.remaining_rounds,
        'ticks_on', f.ticks_on, 'visible', f.visible,
        'can_remove', full_view or coalesce(not coalesce(as_table, false) and ch.user_id = viewer, false))
        order by f.created_at, f.id)
      from public.encounter_effects f
      join public.encounter_combatants t on t.id = f.target_combatant
      left join public.encounter_combatants src on src.id = f.source_combatant
      left join public.characters ch on ch.id = t.character_id
      where f.encounter_id = e.id and (full_view or (f.visible and not t.hidden))), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(ev.j order by ev.created_at desc) from (
      select x.created_at, jsonb_strip_nulls(jsonb_build_object('id', x.id, 'kind', x.kind, 'round', x.round,
          'target_combatant', x.target_combatant,
          'target_name', case when full_view then x.target_name
            when tc.id is not null then coalesce(tc.public_name, x.target_name)
            -- RYT-118: a removed combatant keeps the alias it left with.
            when x.target_combatant is not null then coalesce((select y.detail ->> 'target_alias'
                from public.encounter_events y
                where y.encounter_id = e.id and y.target_combatant = x.target_combatant
                  and y.detail ? 'target_alias'
                order by y.created_at desc, y.id desc limit 1), x.target_name)
            else x.target_name end,
          'amount', x.amount,
          'source_name', case when full_view then src.name
            when not coalesce(src.hidden, false) then coalesce(src.public_name, src.name) end,
          'detail', x.detail,
          'undone', x.undone_by is not null,
          'visible', case when full_view then x.visible end,
          'mine', x.actor_id = viewer,
          'undoable', x.before_state is not null and x.undone_by is null and e.status in ('initiative', 'active')
            and not coalesce(as_table, false) and x.target_combatant is not null
            and (full_view or (x.actor_id = viewer and tc.character_id is not null and ch.user_id = viewer)),
          'created_at', x.created_at)) j
      from public.encounter_events x
      left join public.encounter_combatants src on src.id = x.source_combatant
      left join public.encounter_combatants tc on tc.id = x.target_combatant
      left join public.characters ch on ch.id = tc.character_id
      -- RYT-118: nothing about a combatant that is hidden now, even from before it was hidden.
      where x.encounter_id = e.id and (full_view or (x.visible and not coalesce(tc.hidden, false)))
      order by x.created_at desc, x.id desc limit 60) ev), '[]'::jsonb));
end;
$fn$;

revoke all on function public.get_combat_state(uuid, uuid, boolean) from public, anon;
grant execute on function public.get_combat_state(uuid, uuid, boolean) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre.get_combat_state(uuid,uuid,boolean)') is not null
      and to_regprocedure('pre_private.combat_log(pre.encounters,text,pre.encounter_combatants,integer,jsonb,jsonb,jsonb,boolean)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'encounter_combatants' and column_name = 'public_name') then
    execute pre_admin.remap(ddl);
  end if;
end;
$m$;
