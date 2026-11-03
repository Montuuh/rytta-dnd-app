-- RYT-043: combat art. Character portraits and creature images reach the combat projection, and
-- creature health reads as five named bands.
--
-- Data:
--   combatant_templates.image_path   private object in the 'creature-images' bucket, attached by the DM
--                                    through set_combatant_template_image (revision-checked, idempotent,
--                                    the object must exist; same contract as set_item_image, ADR 017).
--   encounter_combatants.template_id the bestiary template an NPC was added from. The image follows the
--                                    template (a new image shows in a running fight); deleting the
--                                    template only clears the link (ON DELETE SET NULL (template_id)).
-- Projection (get_combat_state, same signature and grants):
--   image_path  characters: character_sheets.portrait_path; NPCs: their template's image_path; lairs:
--               none. Hidden combatants stay out of the Player and table projections, so their images
--               never reach Players.
--   hp_band     unhurt | wounded (over half) | bloodied (over a quarter) | critical (a quarter or less)
--               | down | unknown. hp_status keeps its four values so clients deployed before this
--               migration keep parsing the projection.
-- Storage (global, shared by PROD and PRE; the object prefix selects the schema that authorizes):
--   creature-images     '{public|pre}/{campaign}/{template}/{uuid}.{webp|png|jpg}', 1 MB, image types.
--                       DM of the campaign: read, upload and delete under the prefix. Active member:
--                       read only the image attached to a template that a visible combatant of a
--                       non-draft encounter was added from. Anon, outsiders, other-campaign DMs: nothing.
--   character-portraits reading also lets an active member read the current portrait of a character
--                       that fights visibly in a non-draft encounter of the campaign (teammates on the
--                       table view). Upload and delete are unchanged (owner or DM).
--
-- Actor matrix for set_combatant_template_image: anon cannot execute; outsiders, inactive members and
-- Players raise Forbidden; a DM of another campaign raises Forbidden through the target campaign id and
-- Template unavailable for templates of other campaigns. Every other RPC keeps its matrix.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has the
-- combat RPCs and not this change, the same DDL is executed again remapped with pre_admin.remap. The
-- storage routers and policies are global and authorize PRE objects against pre_private helpers.

do $media$
declare ddl text := $ddl$
alter table public.combatant_templates add column image_path text check (
  image_path is null or image_path ~ '^(public|pre)/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](webp|png|jpg)$');
alter table public.encounter_combatants add column template_id uuid;
alter table public.encounter_combatants add constraint encounter_combatants_template_fkey
  foreign key (campaign_id, template_id) references public.combatant_templates(campaign_id, id)
  on delete set null (template_id);
create index encounter_combatants_template on public.encounter_combatants(template_id)
  where template_id is not null;
comment on column public.combatant_templates.image_path is
  'RYT-043 private creature-images object; the DM attaches it with set_combatant_template_image.';
comment on column public.encounter_combatants.template_id is
  'RYT-043 bestiary template an NPC was added from; its image follows the template.';

-- Players read a creature image only when a visible combatant of a non-draft encounter was added from
-- the template that holds it (so a hidden combatant's image never reaches them).
create function private.can_view_creature_image(target_campaign uuid, target_template uuid, object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
begin
  return exists (select 1 from public.combatant_templates t
    where t.campaign_id = target_campaign and t.id = target_template and t.image_path = object_name
      and (private.is_campaign_dm(target_campaign) or (private.is_campaign_member(target_campaign)
        and exists (select 1 from public.encounter_combatants c
          join public.encounters e on e.id = c.encounter_id
          where c.campaign_id = target_campaign and c.template_id = t.id and not c.hidden
            and e.status <> 'draft'))));
end;
$fn$;
revoke all on function private.can_view_creature_image(uuid, uuid, text) from public, anon, authenticated;

-- Owner and DM read every portrait object of the character (unchanged); other active members read the
-- current portrait while the character fights visibly in a non-draft encounter.
create function private.can_view_portrait(target_campaign uuid, target_character uuid, object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
begin
  return private.can_play_character(target_campaign, target_character) or (
    private.is_campaign_member(target_campaign)
    and exists (select 1 from public.character_sheets s
      where s.campaign_id = target_campaign and s.character_id = target_character
        and s.portrait_path = object_name)
    and exists (select 1 from public.encounter_combatants c
      join public.encounters e on e.id = c.encounter_id
      where c.campaign_id = target_campaign and c.character_id = target_character and not c.hidden
        and e.status <> 'draft'));
end;
$fn$;
revoke all on function private.can_view_portrait(uuid, uuid, text) from public, anon, authenticated;

create function public.set_combatant_template_image(target_campaign uuid, target_template uuid,
  expected_revision bigint, new_path text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('template_image', target_campaign, target_template, expected_revision,
    new_path);
  replay jsonb; t public.combatant_templates; found_object boolean; environment text;
begin
  -- search_path is empty: the owning table tells which environment this copy of the function serves.
  environment := case when 'public.combatant_templates'::regclass::text like 'pre.%' then 'pre' else 'public' end;
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  select * into t from public.combatant_templates
    where campaign_id = target_campaign and id = target_template for update;
  if t.id is null then raise exception 'Template unavailable' using errcode = '42501'; end if;
  if t.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if new_path is not null then
    if new_path !~ ('^' || environment || '/' || target_campaign || '/' || target_template
        || '/[0-9a-f-]{36}[.](webp|png|jpg)$') then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    if to_regclass('storage.objects') is null then
      raise exception 'Image unavailable' using errcode = '22023'; end if;
    execute 'select exists (select 1 from storage.objects where bucket_id = ''creature-images'' and name = $1)'
      into found_object using new_path;
    if not found_object then raise exception 'Image unavailable' using errcode = '22023'; end if;
  end if;
  update public.combatant_templates set image_path = new_path, revision = revision + 1, updated_at = now()
    where id = t.id returning * into t;
  -- Running fights with creatures from this template refetch their projection.
  update public.encounters e set revision = e.revision + 1, updated_at = now()
    where e.campaign_id = target_campaign and e.status in ('initiative', 'active')
      and exists (select 1 from public.encounter_combatants c
        where c.encounter_id = e.id and c.template_id = t.id);
  return private.combat_finish(request_id, payload,
    jsonb_build_object('id', t.id, 'revision', t.revision, 'image_path', t.image_path));
end;
$fn$;
revoke all on function public.set_combatant_template_image(uuid, uuid, bigint, text, uuid) from public, anon;
grant execute on function public.set_combatant_template_image(uuid, uuid, bigint, text, uuid) to authenticated;

create or replace function public.list_combatant_templates(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.combat_require_dm(target_campaign);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'side', t.side,
      'max_hp', t.max_hp, 'armor_class', t.armor_class, 'initiative_bonus', t.initiative_bonus,
      'legendary_max', t.legendary_max, 'notes', t.notes, 'image_path', t.image_path,
      'revision', t.revision) order by lower(t.name), t.id), '[]'::jsonb)
    from public.combatant_templates t where t.campaign_id = target_campaign);
end;
$fn$;

-- add_combatants (RYT-041 body) now records the template an NPC entry was added from.
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
            initiative_bonus, group_key, max_hp, current_hp, armor_class, hidden, legendary_max, dm_notes,
            template_id)
          values (target_campaign, e.id, 'npc', side_value,
            case when total = 1 and existing = 0 then base_name else base_name || ' ' || (existing + i)::text end,
            bonus, group_value, hp, hp, ac, hidden_value, legendary, notes, t.id)
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
          'exhaustion', case when c.kind = 'character' and (full_view or own or shared) then exh end
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
  if to_regprocedure('pre.get_combat_state(uuid,uuid,boolean)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null
      and not exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'encounter_combatants' and column_name = 'template_id') then
    execute pre_admin.remap(ddl);
  end if;
end;
$media$;

-- ---------------------------------------------------------------------------------------------
-- GLOBAL STORAGE: shared Storage routers, deliberately outside PRE remapping (like item_image_access).
-- ---------------------------------------------------------------------------------------------

create or replace function private.creature_image_access(object_name text, writing boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare env text := split_part(object_name, '/', 1); helper text; campaign uuid; template uuid; allowed boolean;
begin
  if object_name is null
      or object_name !~ '^(public|pre)/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](webp|png|jpg)$' then
    return false; end if;
  begin
    campaign := split_part(object_name, '/', 2)::uuid;
    template := split_part(object_name, '/', 3)::uuid;
  exception when invalid_text_representation then return false; end;
  helper := case env when 'pre' then 'pre_private' else 'private' end;
  if to_regprocedure(format('%I.can_view_creature_image(uuid,uuid,text)', helper)) is null then
    return false; end if;
  if writing then
    execute format('select %I.is_campaign_dm($1) and exists (select 1 from %I.combatant_templates '
      'where campaign_id = $1 and id = $2)', helper, env) into allowed using campaign, template;
  else
    -- DMs may read unattached uploads for preview and cleanup; Players never may.
    execute format('select %I.is_campaign_dm($1) or %I.can_view_creature_image($1, $2, $3)', helper, helper)
      into allowed using campaign, template, object_name;
  end if;
  return coalesce(allowed, false);
end;
$$;
revoke all on function private.creature_image_access(text, boolean) from public, anon;
grant execute on function private.creature_image_access(text, boolean) to authenticated;

create or replace function private.portrait_read_access(object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare env text := split_part(object_name, '/', 1); helper text; campaign uuid; character uuid; allowed boolean;
begin
  if object_name is null or env not in ('public', 'pre') then return false; end if;
  begin
    campaign := split_part(object_name, '/', 2)::uuid;
    character := split_part(object_name, '/', 3)::uuid;
  exception when others then return false; end;
  helper := case env when 'pre' then 'pre_private' else 'private' end;
  if to_regprocedure(format('%I.can_view_portrait(uuid,uuid,text)', helper)) is not null then
    execute format('select %I.can_view_portrait($1, $2, $3)', helper)
      into allowed using campaign, character, object_name;
  elsif to_regprocedure(format('%I.can_play_character(uuid,uuid)', helper)) is not null then
    -- An environment without this change keeps the previous rule (owner or DM).
    execute format('select %I.can_play_character($1, $2)', helper) into allowed using campaign, character;
  end if;
  return coalesce(allowed, false);
end;
$$;
revoke all on function private.portrait_read_access(text) from public, anon;
grant execute on function private.portrait_read_access(text) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('creature-images', 'creature-images', false, 1048576,
      array['image/webp', 'image/png', 'image/jpeg'])
    on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'creature_images_read') then
    execute $p$create policy creature_images_read on storage.objects for select to authenticated
      using (bucket_id = 'creature-images' and private.creature_image_access(name, false))$p$;
    execute $p$create policy creature_images_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'creature-images' and private.creature_image_access(name, true))$p$;
    execute $p$create policy creature_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'creature-images' and private.creature_image_access(name, true))$p$;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'portraits_read') then
    execute $p$alter policy portraits_read on storage.objects
      using (bucket_id = 'character-portraits' and private.portrait_read_access(name))$p$;
  end if;
end
$storage$;
