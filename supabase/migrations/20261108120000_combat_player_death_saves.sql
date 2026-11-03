-- RYT-045: Players end their own turn and roll their own death saves from the table view.
--
-- advance_turn is unchanged: a caller that is not an active DM of the campaign already moves only
-- forward, only from the active combatant, and only when that combatant is a character the caller
-- plays (characters.user_id = auth.uid()); expected_active refuses double taps ('Stale turn').
--
-- record_death_save keeps its signature, grants, campaign lock and request-id replay (a retried
-- request returns its first result before any rule below). Rules added for Players:
--   * only on their own turn: the encounter is active and the character is the active combatant
--     ('Not your turn'). SRD: a creature at 0 hit points rolls at the start of each of its turns;
--   * one roll per round: a death save of this character in the current round that was not undone
--     refuses another ('Already rolled'). An accidental double tap with a fresh request id is
--     refused; after the DM undoes a mistaken roll, the Player rolls again;
--   * a stable character (three successes) does not roll ('Not dying').
-- The DM keeps recording any death save at any time (the console). Outcomes are unchanged:
-- success, failure, nat1 (two failures), nat20 (regain 1 hit point, wake, reset the saves);
-- three successes are stable, three failures are dead (defeated).
--
-- get_combat_state keeps its signature and grants and adds `death_state` for characters:
--   stable   at 0 hit points with three successes and not dead;
--   revived  above 0 hit points while the last death save of the current round (not undone) was a
--            natural 20;
--   (absent) otherwise. Dead stays `defeated`. These outcomes reach every projection, including the
--            table and teammates who do not share live vitals: the table hears them announced at
--            the physical table anyway. Counts of successes and failures keep the ADR 020 sharing.
--
-- Actor matrix for record_death_save: anon cannot execute; outsiders and inactive members raise
-- Forbidden; another Player raises Forbidden (not their character) and Combatant unavailable for
-- hidden combatants; a DM of another campaign raises Combatant unavailable through its own campaign
-- id; drafts and ended encounters stay closed.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has
-- the combat RPCs, the same DDL is executed again remapped with pre_admin.remap.

do $deathsaves$
declare ddl text := $ddl$
create or replace function public.record_death_save(target_campaign uuid, target_combatant uuid, outcome text,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('death_save', target_campaign, target_combatant, outcome);
  replay jsonb; e public.encounters; c public.encounter_combatants; v public.character_vitals;
  before jsonb; result text := null; dm boolean;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  perform private.combat_require_live(e);
  c := private.combat_combatant(e, c.id);
  perform private.combat_require_act(c);
  dm := private.is_campaign_dm(target_campaign);
  if c.kind <> 'character' or outcome is null or outcome not in ('success', 'failure', 'nat1', 'nat20') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into v from public.character_vitals where character_id = c.character_id for update;
  if v.current_hp <> 0 or c.defeated or (not dm and v.death_successes >= 3) then
    raise exception 'Not dying' using errcode = 'P0001'; end if;
  if not dm then
    if e.status <> 'active' or e.active_combatant is distinct from c.id then
      raise exception 'Not your turn' using errcode = 'P0001'; end if;
    if exists (select 1 from public.encounter_events x
        where x.encounter_id = e.id and x.target_combatant = c.id and x.kind = 'death_save'
          and x.round = e.round and x.undone_by is null) then
      raise exception 'Already rolled' using errcode = 'P0001'; end if;
  end if;
  before := private.combat_snapshot(c.id);
  if outcome = 'nat20' then
    update public.character_vitals set current_hp = 1, death_successes = 0, death_failures = 0,
        conditions = array_remove(conditions, 'unconscious'), revision = revision + 1
      where character_id = c.character_id;
    result := 'up';
  elsif outcome = 'success' then
    update public.character_vitals set death_successes = least(3, death_successes + 1), revision = revision + 1
      where character_id = c.character_id returning * into v;
    if v.death_successes >= 3 then result := 'stable'; end if;
  else
    update public.character_vitals set death_failures = least(3, death_failures + case when outcome = 'nat1'
        then 2 else 1 end), revision = revision + 1
      where character_id = c.character_id returning * into v;
    if v.death_failures >= 3 then
      result := 'dead';
      update public.encounter_combatants set defeated = true where id = c.id;
    end if;
  end if;
  update public.encounter_combatants set revision = revision + 1 where id = c.id;
  perform private.combat_log(e, 'death_save', c, null, jsonb_build_object('outcome', outcome, 'result', result),
    before, private.combat_snapshot(c.id), true);
  if result = 'dead' then perform private.combat_log(e, 'defeated', c, null, '{}'::jsonb, null, null, true); end if;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload,
    private.combat_result(e.id) || jsonb_build_object('result', result));
end;
$fn$;

revoke all on function public.record_death_save(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.record_death_save(uuid, uuid, text, uuid) to authenticated;

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
        else e.summary || jsonb_build_object('combatants', coalesce((select jsonb_agg(s.value)
          from jsonb_array_elements(e.summary -> 'combatants') s
          where exists (select 1 from public.encounter_combatants c
            where c.id = (s.value ->> 'combatant_id')::uuid and not c.hidden)), '[]'::jsonb)) end),
    'combatants', coalesce((select jsonb_agg(row_json order by pos) from (
      select array_position(all_order, c.id) pos,
        jsonb_strip_nulls(jsonb_build_object(
          'id', c.id, 'kind', c.kind, 'side', c.side, 'name', c.name,
          'initiative', c.initiative,
          'initiative_bonus', case when full_view or own then c.initiative_bonus end,
          'in_turn_order', c.id = any(turn_order),
          'is_active', coalesce(c.id = e.active_combatant, false),
          'is_own', own,
          'can_act', own or full_view,
          'defeated', c.defeated,
          'character_id', case when full_view or own then c.character_id end,
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
          'image_path', case when c.kind = 'character' then c.portrait_path
            when c.kind = 'npc' then c.template_image end,
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
          (x.kind = 'character' and ch.user_id is not null and ch.shares_live) shared,
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
          s.portrait_path, tp.image_path template_image
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
          'target_combatant', x.target_combatant, 'target_name', x.target_name, 'amount', x.amount,
          'source_name', case when full_view or not coalesce(src.hidden, false) then src.name end,
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
      where x.encounter_id = e.id and (full_view or x.visible)
      order by x.created_at desc, x.id desc limit 60) ev), '[]'::jsonb));
end;
$fn$;

revoke all on function public.get_combat_state(uuid, uuid, boolean) from public, anon;
grant execute on function public.get_combat_state(uuid, uuid, boolean) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre.record_death_save(uuid,uuid,text,uuid)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null
      -- The projection reads RYT-043 columns; a PRE without them is refreshed instead.
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'encounter_combatants' and column_name = 'template_id') then
    execute pre_admin.remap(ddl);
  end if;
end;
$deathsaves$;
