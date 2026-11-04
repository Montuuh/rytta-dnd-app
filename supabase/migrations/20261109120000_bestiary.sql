-- RYT-046 / RYT-047 / RYT-048: SRD bestiary, full homebrew stat blocks and creatures in combat (ADR 028).
--
-- The SRD 5.2.1 monster catalogue is bundled in the app (CC-BY-4.0); this migration stores only what
-- the DM prepares: full stat blocks on campaign creature templates and the combat state of creatures.
--
-- Data:
--   combatant_templates.stat_block     DM stat block (jsonb object, <= 48 KB, shape checked by
--                                      private.bestiary_stat_block_ok); the core columns (name, side,
--                                      HP, AC, initiative, legendary, notes) stay the combat contract.
--   combatant_templates.srd_id         the SRD creature a template was customised from.
--   combatant_templates.hp_formula     hit dice (NdM, NdM+K, NdM-K) used to roll hit points.
--   combatant_templates.challenge      challenge rating text (0, 1/8, 1/4, 1/2, 1..30).
--   combatant_templates.creature_type  one of the 14 SRD creature types.
--   encounter_combatants.public_name   the name Players and the table see instead of the real one.
--   encounter_combatants.srd_id        the SRD creature an NPC was added from.
--   encounter_combatants.trackers      DM-only per-creature trackers: [{key, kind: recharge, label,
--                                      min, spent} | {key, kind: uses, label, max, used}] (<= 24).
--   encounter_events.kind              adds 'recharge' (server roll at turn start) and 'tracker'.
--
-- RPCs:
--   save_combatant_template            data also accepts stat_block, srd_id, hp_formula, challenge
--                                      and creature_type (same signature, revision check, replay).
--   list_combatant_templates           returns the new columns (DM only, unchanged matrix).
--   add_combatants                     NPC entries accept public_name (numbered like names), srd_id,
--                                      hp_mode ('average' | 'roll': the server rolls each creature's
--                                      hit points from the template's or the entry's formula) and
--                                      trackers (validated, created fresh).
--   update_combatant                   accepts public_name for NPCs and the lair; clearing it logs a
--                                      visible 'reveal' with {alias} so the table learns the name.
--   set_combatant_tracker (new)        DM: marks a recharge spent (1) or available (0), or sets the
--                                      uses spent (0..max). Idempotent, DM-only 'tracker' event.
--   private.combat_tick                at the start of a creature's turn, every spent recharge rolls
--                                      1d6 on the server and recharges on min..6 ('recharge' event,
--                                      DM only).
--   get_combat_state                   Players and the table see public_name instead of the name in
--                                      rows, log and summary, and no image while an alias is set;
--                                      public_name, srd_id, template_id and trackers are DM only.
--
-- Actor matrix (new and changed RPCs): anon cannot execute; outsiders and inactive members raise
-- Forbidden; Players raise Forbidden on every template and tracker RPC and on alias changes; a DM of
-- another campaign raises Forbidden through the target campaign id and Combatant/Template unavailable
-- for ids of other campaigns. Every mutation locks the campaign row and replays retried request ids.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has the
-- RYT-043 combat columns and not this change, the same DDL is executed again remapped with
-- pre_admin.remap. A PRE that already has it (the remapped DDL was tested there first) is left as is.

do $bestiary$
declare ddl text := $ddl$
alter table public.combatant_templates
  add column stat_block jsonb check (stat_block is null
    or (jsonb_typeof(stat_block) = 'object' and octet_length(stat_block::text) <= 49152)),
  add column srd_id text check (srd_id is null
    or (srd_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(srd_id) <= 80)),
  add column hp_formula text check (hp_formula is null
    or hp_formula ~ '^[1-9][0-9]{0,2}d(4|6|8|10|12|20)([+-][0-9]{1,4})?$'),
  add column challenge text check (challenge is null
    or challenge ~ '^(0|1/8|1/4|1/2|[1-9]|[12][0-9]|30)$'),
  add column creature_type text check (creature_type is null or creature_type in ('aberration', 'beast',
    'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity',
    'ooze', 'plant', 'undead'));
comment on column public.combatant_templates.stat_block is
  'ADR 028 DM stat block (bestiary StatBlock shape); the core columns stay the combat contract.';

alter table public.encounter_combatants
  add column public_name text check (public_name is null or char_length(btrim(public_name)) between 1 and 80),
  add column srd_id text check (srd_id is null
    or (srd_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(srd_id) <= 80)),
  add column trackers jsonb not null default '[]'::jsonb check (jsonb_typeof(trackers) = 'array'
    and jsonb_array_length(trackers) <= 24 and octet_length(trackers::text) <= 8192);
comment on column public.encounter_combatants.public_name is
  'ADR 028 table alias: Players and the table read it instead of name.';
comment on column public.encounter_combatants.trackers is
  'ADR 028 DM-only recharge and uses trackers of a creature.';

alter table public.encounter_events drop constraint encounter_events_kind_check;
alter table public.encounter_events add constraint encounter_events_kind_check check (kind in ('status', 'turn',
  'round', 'initiative', 'join', 'leave', 'reveal', 'damage', 'heal', 'temp', 'condition_on', 'condition_off',
  'concentration', 'death_save', 'defeated', 'revived', 'effect_on', 'effect_off', 'effect_expired', 'undo',
  'recharge', 'tracker'));

-- Rolls hit dice such as 3d6, 20d10+40 or 1d4-1 (at least 1).
create function private.bestiary_roll(formula text) returns integer
language plpgsql volatile set search_path = '' as $fn$
declare parts text[]; dice integer; faces integer; bonus integer; total integer := 0; i integer;
begin
  parts := regexp_match(coalesce(formula, ''), '^([1-9][0-9]{0,2})d(4|6|8|10|12|20)([+-][0-9]{1,4})?$');
  if parts is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  dice := parts[1]::integer; faces := parts[2]::integer; bonus := coalesce(parts[3]::integer, 0);
  for i in 1 .. dice loop total := total + 1 + floor(random() * faces)::integer; end loop;
  return least(99999, greatest(1, total + bonus));
end;
$fn$;
revoke all on function private.bestiary_roll(text) from public, anon, authenticated;

-- Shape check of a stat block: an object with known keys, bounded sections and entries of strings.
create function private.bestiary_stat_block_ok(block jsonb) returns boolean
language plpgsql immutable set search_path = '' as $fn$
declare k text; s jsonb; en jsonb; p jsonb;
begin
  if block is null then return true; end if;
  if jsonb_typeof(block) <> 'object' or octet_length(block::text) > 49152 then return false; end if;
  for k in select jsonb_object_keys(block) loop
    if k not in ('name', 'meta', 'ac', 'initiative', 'hp', 'hpFormula', 'speed', 'abilities', 'details', 'cr',
        'sections', 'page') then return false; end if;
  end loop;
  if block ? 'abilities' and jsonb_typeof(block -> 'abilities') <> 'object' then return false; end if;
  if block ? 'details' and jsonb_typeof(block -> 'details') <> 'object' then return false; end if;
  if not (block ? 'sections') then return true; end if;
  if jsonb_typeof(block -> 'sections') <> 'array' or jsonb_array_length(block -> 'sections') > 6 then
    return false; end if;
  for s in select value from jsonb_array_elements(block -> 'sections') loop
    if jsonb_typeof(s) <> 'object' or coalesce(s ->> 'kind', '') not in ('traits', 'actions', 'bonusActions',
        'reactions', 'legendaryActions') or jsonb_typeof(s -> 'entries') <> 'array'
        or jsonb_array_length(s -> 'entries') > 40 then return false; end if;
    for en in select value from jsonb_array_elements(s -> 'entries') loop
      if jsonb_typeof(en) <> 'object' or jsonb_typeof(en -> 'name') <> 'string'
          or jsonb_typeof(en -> 'key') <> 'string' or jsonb_typeof(en -> 'text') <> 'array'
          or jsonb_array_length(en -> 'text') > 12 then return false; end if;
      for p in select value from jsonb_array_elements(en -> 'text') loop
        if jsonb_typeof(p) <> 'string' then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
end;
$fn$;
revoke all on function private.bestiary_stat_block_ok(jsonb) from public, anon, authenticated;
alter table public.combatant_templates add constraint combatant_templates_stat_block_shape
  check (private.bestiary_stat_block_ok(stat_block));

-- Validates tracker definitions from an add request and returns them fresh (nothing spent).
create function private.bestiary_trackers(source jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $fn$
declare item jsonb; out jsonb := '[]'::jsonb; key_value text; label_value text; seen text[] := array[]::text[];
  n numeric;
begin
  if source is null or jsonb_typeof(source) = 'null' then return out; end if;
  if jsonb_typeof(source) <> 'array' or jsonb_array_length(source) > 24 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(source) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item -> 'key') <> 'string'
        or jsonb_typeof(item -> 'label') <> 'string' then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    key_value := item ->> 'key';
    label_value := btrim(item ->> 'label');
    if key_value !~ '^[a-z0-9][a-z0-9:.-]{0,119}$' or key_value = any (seen)
        or char_length(label_value) not between 1 and 120 then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    seen := seen || key_value;
    if item ->> 'kind' = 'recharge' then
      if jsonb_typeof(item -> 'min') <> 'number' then raise exception 'Invalid request' using errcode = '22023'; end if;
      n := (item ->> 'min')::numeric;
      if n <> trunc(n) or n not between 2 and 6 then raise exception 'Invalid request' using errcode = '22023'; end if;
      out := out || jsonb_build_array(jsonb_build_object('key', key_value, 'kind', 'recharge',
        'label', label_value, 'min', n::integer, 'spent', false));
    elsif item ->> 'kind' = 'uses' then
      if jsonb_typeof(item -> 'max') <> 'number' then raise exception 'Invalid request' using errcode = '22023'; end if;
      n := (item ->> 'max')::numeric;
      if n <> trunc(n) or n not between 1 and 9 then raise exception 'Invalid request' using errcode = '22023'; end if;
      out := out || jsonb_build_array(jsonb_build_object('key', key_value, 'kind', 'uses',
        'label', label_value, 'max', n::integer, 'used', 0));
    else
      raise exception 'Invalid request' using errcode = '22023';
    end if;
  end loop;
  return out;
end;
$fn$;
revoke all on function private.bestiary_trackers(jsonb) from public, anon, authenticated;

-- At the start of a creature's turn every spent recharge rolls 1d6 (SRD "Recharge X–Y").
create function private.bestiary_recharge(e public.encounters, who uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
declare c public.encounter_combatants; item jsonb; next_list jsonb := '[]'::jsonb; roll integer;
  changed boolean := false;
begin
  select * into c from public.encounter_combatants where id = who and kind = 'npc' for update;
  if c.id is null or not exists (select 1 from jsonb_array_elements(c.trackers) t
      where t.value ->> 'kind' = 'recharge' and (t.value ->> 'spent')::boolean) then return; end if;
  for item in select value from jsonb_array_elements(c.trackers) loop
    if item ->> 'kind' = 'recharge' and (item ->> 'spent')::boolean then
      roll := 1 + floor(random() * 6)::integer;
      changed := true;
      if roll >= (item ->> 'min')::integer then item := jsonb_set(item, '{spent}', 'false'::jsonb); end if;
      perform private.combat_log(e, 'recharge', c, roll, jsonb_build_object('key', item ->> 'key',
        'label', item ->> 'label', 'min', (item ->> 'min')::integer,
        'recharged', not (item ->> 'spent')::boolean), null, null, false);
    end if;
    next_list := next_list || jsonb_build_array(item);
  end loop;
  if changed then
    update public.encounter_combatants set trackers = next_list, revision = revision + 1 where id = c.id;
  end if;
end;
$fn$;
revoke all on function private.bestiary_recharge(public.encounters, uuid) from public, anon, authenticated;

create or replace function private.combat_tick(e public.encounters, who uuid, phase text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare fx public.encounter_effects;
begin
  if who is null then return; end if;
  for fx in select * from public.encounter_effects
      where encounter_id = e.id and coalesce(source_combatant, target_combatant) = who
        and ticks_on = phase and remaining_rounds is not null
      order by created_at, id for update loop
    if fx.remaining_rounds <= 1 then
      perform private.combat_drop_effect(e, fx, 'effect_expired');
    else
      update public.encounter_effects set remaining_rounds = remaining_rounds - 1 where id = fx.id;
    end if;
  end loop;
  if phase = 'start' then perform private.bestiary_recharge(e, who); end if;
end;
$fn$;

create or replace function public.save_combatant_template(target_campaign uuid, target_template uuid,
  expected_revision bigint, data jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('template_save', target_campaign, target_template, expected_revision, data);
  replay jsonb; t public.combatant_templates; name_value text; side_value text; block jsonb;
  srd_value text; formula_value text; challenge_value text; type_value text;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  if data is null or jsonb_typeof(data) <> 'object' then raise exception 'Invalid request' using errcode = '22023'; end if;
  name_value := private.combat_text(data, 'name', 80, null);
  side_value := coalesce(private.combat_text(data, 'side', 10, null), 'enemy');
  if name_value is null or name_value = '' or side_value not in ('ally', 'enemy')
      or private.combat_int(data, 'max_hp', 1, 99999, null) is null then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  block := case when jsonb_typeof(data -> 'stat_block') = 'object' then data -> 'stat_block' end;
  if data ? 'stat_block' and jsonb_typeof(data -> 'stat_block') not in ('object', 'null') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if not private.bestiary_stat_block_ok(block) then raise exception 'Invalid request' using errcode = '22023'; end if;
  srd_value := nullif(private.combat_text(data, 'srd_id', 80, null), '');
  formula_value := nullif(replace(private.combat_text(data, 'hp_formula', 20, ''), ' ', ''), '');
  challenge_value := nullif(private.combat_text(data, 'challenge', 4, ''), '');
  type_value := nullif(private.combat_text(data, 'creature_type', 20, ''), '');
  if (srd_value is not null and srd_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      or (formula_value is not null and formula_value !~ '^[1-9][0-9]{0,2}d(4|6|8|10|12|20)([+-][0-9]{1,4})?$')
      or (challenge_value is not null and challenge_value !~ '^(0|1/8|1/4|1/2|[1-9]|[12][0-9]|30)$')
      or (type_value is not null and type_value not in ('aberration', 'beast', 'celestial', 'construct', 'dragon',
        'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead')) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if target_template is null then
    insert into public.combatant_templates(campaign_id, name, side, max_hp, armor_class, initiative_bonus,
        legendary_max, notes, stat_block, srd_id, hp_formula, challenge, creature_type)
      values (target_campaign, name_value, side_value, private.combat_int(data, 'max_hp', 1, 99999, null),
        private.combat_int(data, 'armor_class', 0, 99, 10), private.combat_int(data, 'initiative_bonus', -20, 30, 0),
        private.combat_int(data, 'legendary_max', 0, 9, 0), coalesce(private.combat_text(data, 'notes', 2000, ''), ''),
        block, srd_value, formula_value, challenge_value, type_value)
      returning * into t;
  else
    select * into t from public.combatant_templates
      where campaign_id = target_campaign and id = target_template for update;
    if t.id is null then raise exception 'Template unavailable' using errcode = '42501'; end if;
    if t.revision is distinct from expected_revision then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    update public.combatant_templates set name = name_value, side = side_value,
        max_hp = private.combat_int(data, 'max_hp', 1, 99999, null),
        armor_class = private.combat_int(data, 'armor_class', 0, 99, 10),
        initiative_bonus = private.combat_int(data, 'initiative_bonus', -20, 30, 0),
        legendary_max = private.combat_int(data, 'legendary_max', 0, 9, 0),
        notes = coalesce(private.combat_text(data, 'notes', 2000, ''), ''),
        -- A quick edit (no stat_block key) keeps the stored stat block and its metadata.
        stat_block = case when data ? 'stat_block' then block else t.stat_block end,
        srd_id = case when data ? 'srd_id' then srd_value else t.srd_id end,
        hp_formula = case when data ? 'hp_formula' then formula_value else t.hp_formula end,
        challenge = case when data ? 'challenge' then challenge_value else t.challenge end,
        creature_type = case when data ? 'creature_type' then type_value else t.creature_type end,
        revision = revision + 1, updated_at = now()
      where id = t.id returning * into t;
  end if;
  return private.combat_finish(request_id, payload, jsonb_build_object('id', t.id, 'revision', t.revision));
end;
$fn$;

create or replace function public.list_combatant_templates(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.combat_require_dm(target_campaign);
  return (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', t.id, 'name', t.name,
      'side', t.side, 'max_hp', t.max_hp, 'armor_class', t.armor_class, 'initiative_bonus', t.initiative_bonus,
      'legendary_max', t.legendary_max, 'notes', t.notes, 'image_path', t.image_path,
      'stat_block', t.stat_block, 'srd_id', t.srd_id, 'hp_formula', t.hp_formula, 'challenge', t.challenge,
      'creature_type', t.creature_type, 'updated_at', t.updated_at, 'revision', t.revision))
      order by lower(t.name), t.id), '[]'::jsonb)
    from public.combatant_templates t where t.campaign_id = target_campaign);
end;
$fn$;

-- entries: [{kind:'character', character_id, initiative?}
--          | {kind:'npc', name, count, max_hp, armor_class, initiative_bonus, side, hidden,
--             share_initiative, legendary_max, dm_notes, template_id,
--             public_name, srd_id, hp_mode ('average' | 'roll'), hp_formula, trackers}
--          | {kind:'lair', name, hidden}]
create or replace function public.add_combatants(target_campaign uuid, target_encounter uuid, entries jsonb,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('combatants_add', target_campaign, target_encounter, entries);
  replay jsonb; e public.encounters; entry jsonb; t public.combatant_templates; ch public.characters;
  base_name text; total integer; existing integer; i integer; hp integer; ac integer; bonus integer;
  side_value text; legendary integer; notes text; hidden_value boolean; group_value text;
  initiative_value integer; turn_order uuid[]; alias_base text; alias_existing integer; srd_value text;
  hp_mode text; formula text; tracker_list jsonb; rolled integer;
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
      -- ADR 028: alias, SRD origin, rolled hit points and trackers.
      alias_base := nullif(private.combat_text(entry, 'public_name', 70, ''), '');
      srd_value := coalesce(nullif(private.combat_text(entry, 'srd_id', 80, ''), ''), t.srd_id);
      if srd_value is not null and srd_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      hp_mode := coalesce(private.combat_text(entry, 'hp_mode', 10, null), 'average');
      if hp_mode not in ('average', 'roll') then raise exception 'Invalid request' using errcode = '22023'; end if;
      formula := coalesce(t.hp_formula, nullif(replace(private.combat_text(entry, 'hp_formula', 20, ''), ' ', ''), ''));
      if hp_mode = 'roll' and formula is null then raise exception 'Invalid request' using errcode = '22023'; end if;
      if formula is not null then perform private.bestiary_roll(formula); end if;  -- validates the formula
      tracker_list := private.bestiary_trackers(entry -> 'trackers');
      -- Numbering continues after combatants already named "<base>" or "<base> N".
      select count(*) into existing from public.encounter_combatants c
        where c.encounter_id = e.id and (c.name = base_name
          or (left(c.name, char_length(base_name) + 1) = base_name || ' '
            and substr(c.name, char_length(base_name) + 2) ~ '^[0-9]+$'));
      alias_existing := 0;
      if alias_base is not null then
        select count(*) into alias_existing from public.encounter_combatants c
          where c.encounter_id = e.id and (c.public_name = alias_base
            or (left(c.public_name, char_length(alias_base) + 1) = alias_base || ' '
              and substr(c.public_name, char_length(alias_base) + 2) ~ '^[0-9]+$'));
      end if;
      for i in 1 .. total loop
        rolled := case when hp_mode = 'roll' then private.bestiary_roll(formula) else hp end;
        insert into public.encounter_combatants(campaign_id, encounter_id, kind, side, name,
            initiative_bonus, group_key, max_hp, current_hp, armor_class, hidden, legendary_max, dm_notes,
            template_id, public_name, srd_id, trackers)
          values (target_campaign, e.id, 'npc', side_value,
            case when total = 1 and existing = 0 then base_name else base_name || ' ' || (existing + i)::text end,
            bonus, group_value, rolled, rolled, ac, hidden_value, legendary, notes, t.id,
            case when alias_base is null then null
              when total = 1 and alias_existing = 0 then alias_base
              else alias_base || ' ' || (alias_existing + i)::text end,
            srd_value, tracker_list)
          returning * into added;
        added_count := added_count + 1;
        -- The join event is visible to the table: rolled hit points stay out of it.
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

create or replace function public.update_combatant(target_campaign uuid, target_combatant uuid, patch jsonb,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('combatant_update', target_campaign, target_combatant, patch);
  replay jsonb; e public.encounters; c public.encounter_combatants; next_c public.encounter_combatants;
  k text; new_side text;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  c := private.combat_combatant(e, c.id);
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(patch) loop
    if k not in ('name', 'max_hp', 'current_hp', 'temp_hp', 'armor_class', 'initiative_bonus', 'side', 'hidden',
        'hp_revealed', 'defeated', 'legendary_max', 'legendary_used', 'dm_notes', 'public_name')
        or (c.kind = 'character' and k not in ('hidden', 'defeated', 'dm_notes')) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
  end loop;
  next_c := c;
  next_c.name := coalesce(nullif(private.combat_text(patch, 'name', 80, c.name), ''), c.name);
  next_c.max_hp := private.combat_int(patch, 'max_hp', 1, 99999, c.max_hp);
  next_c.current_hp := least(private.combat_int(patch, 'current_hp', 0, 99999, c.current_hp), next_c.max_hp);
  next_c.temp_hp := private.combat_int(patch, 'temp_hp', 0, 99999, c.temp_hp);
  next_c.armor_class := private.combat_int(patch, 'armor_class', 0, 99, c.armor_class);
  next_c.initiative_bonus := private.combat_int(patch, 'initiative_bonus', -20, 30, c.initiative_bonus);
  new_side := private.combat_text(patch, 'side', 10, c.side);
  if c.kind <> 'character' and new_side not in ('ally', 'enemy') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  next_c.side := new_side;
  next_c.hidden := private.combat_bool(patch, 'hidden', c.hidden);
  next_c.hp_revealed := private.combat_bool(patch, 'hp_revealed', c.hp_revealed);
  next_c.defeated := private.combat_bool(patch, 'defeated', c.defeated);
  next_c.legendary_max := private.combat_int(patch, 'legendary_max', 0, 9, c.legendary_max);
  next_c.legendary_used := least(private.combat_int(patch, 'legendary_used', 0, 9, c.legendary_used),
    next_c.legendary_max);
  next_c.dm_notes := private.combat_text(patch, 'dm_notes', 2000, c.dm_notes);
  -- ADR 028: null (or an empty text) clears the alias and reveals the real name.
  if patch ? 'public_name' then
    next_c.public_name := nullif(private.combat_text(patch, 'public_name', 80, null), '');
  end if;
  update public.encounter_combatants set name = next_c.name, max_hp = next_c.max_hp,
      current_hp = next_c.current_hp, temp_hp = next_c.temp_hp, armor_class = next_c.armor_class,
      initiative_bonus = next_c.initiative_bonus, side = next_c.side, hidden = next_c.hidden,
      hp_revealed = next_c.hp_revealed, defeated = next_c.defeated, legendary_max = next_c.legendary_max,
      legendary_used = next_c.legendary_used, dm_notes = next_c.dm_notes, public_name = next_c.public_name,
      revision = revision + 1
    where id = c.id returning * into next_c;
  if c.hidden and not next_c.hidden then
    perform private.combat_log(e, 'reveal', next_c, null, '{}'::jsonb, null, null, true);
  end if;
  if c.public_name is not null and next_c.public_name is null then
    perform private.combat_log(e, 'reveal', next_c, null, jsonb_build_object('alias', c.public_name), null, null,
      true);
  end if;
  if c.defeated <> next_c.defeated then
    perform private.combat_log(e, case when next_c.defeated then 'defeated' else 'revived' end, next_c, null,
      '{}'::jsonb, null, null, true);
  end if;
  -- A defeated or hidden active combatant keeps its slot; advance_turn continues from it.
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$fn$;

-- tracker_value: recharge 1 = spent, 0 = available; uses = how many are spent (0..max).
create function public.set_combatant_tracker(target_campaign uuid, target_combatant uuid, tracker_key text,
  tracker_value integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('combatant_tracker', target_campaign, target_combatant, tracker_key,
    tracker_value);
  replay jsonb; e public.encounters; c public.encounter_combatants; item jsonb; next_list jsonb := '[]'::jsonb;
  found jsonb;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  if e.status = 'ended' then raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  c := private.combat_combatant(e, c.id);
  if tracker_key is null or tracker_value is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(c.trackers) loop
    if item ->> 'key' = tracker_key then
      if item ->> 'kind' = 'recharge' then
        if tracker_value not in (0, 1) then raise exception 'Invalid request' using errcode = '22023'; end if;
        item := jsonb_set(item, '{spent}', to_jsonb(tracker_value = 1));
      else
        if tracker_value < 0 or tracker_value > (item ->> 'max')::integer then
          raise exception 'Invalid request' using errcode = '22023'; end if;
        item := jsonb_set(item, '{used}', to_jsonb(tracker_value));
      end if;
      found := item;
    end if;
    next_list := next_list || jsonb_build_array(item);
  end loop;
  if found is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  update public.encounter_combatants set trackers = next_list, revision = revision + 1 where id = c.id;
  perform private.combat_log(e, 'tracker', c, tracker_value, jsonb_build_object('key', tracker_key,
    'label', found ->> 'label', 'kind', found ->> 'kind'), null, null, false);
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$fn$;
revoke all on function public.set_combatant_tracker(uuid, uuid, text, integer, uuid) from public, anon;
grant execute on function public.set_combatant_tracker(uuid, uuid, text, integer, uuid) to authenticated;

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
          'image_path', case when c.kind = 'character' then c.portrait_path
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
          'target_combatant', x.target_combatant,
          'target_name', case when full_view then x.target_name else coalesce(tc.public_name, x.target_name) end,
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
      where x.encounter_id = e.id and (full_view or x.visible)
      order by x.created_at desc, x.id desc limit 60) ev), '[]'::jsonb));
end;
$fn$;

revoke all on function public.get_combat_state(uuid, uuid, boolean) from public, anon;
grant execute on function public.get_combat_state(uuid, uuid, boolean) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre.add_combatants(uuid,uuid,jsonb,uuid)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null
      -- The projection reads RYT-043 columns; a PRE without them is refreshed instead.
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'encounter_combatants' and column_name = 'template_id')
      and not exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'encounter_combatants' and column_name = 'public_name') then
    execute pre_admin.remap(ddl);
  end if;
end;
$bestiary$;
