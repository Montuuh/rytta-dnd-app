-- RYT-134 (backend): the sheet's play state stores a concentration marker, so casting a
-- concentration spell spends the slot and sets the marker in one atomic write.
--
-- What.
-- 1. character_vitals.concentration text, nullable: null = not concentrating, otherwise the name of
--    the spell (1..100 characters, the app's spell name limit). Refused by code point, so the rule
--    does not depend on the database locale: C0 and C1 controls and DEL (U+0001-U+001F,
--    U+007F-U+009F), zero-width and direction marks (U+200B-U+200F), bidi embeddings and
--    overrides (U+202A-U+202E), invisible operators (U+2060-U+2064), bidi isolates
--    (U+2066-U+2069) and the BOM (U+FEFF), so a marker cannot look blank or spoofed to the DM
--    and teammates. No leading or trailing Unicode space (U+0020, U+00A0, U+1680,
--    U+2000-U+200A, U+202F, U+205F, U+3000). Existing rows stay null; nothing is rewritten.
-- 2. set_character_vitals (latest definition 20261112120000) gains two trailing arguments with
--    defaults: change_concentration boolean default false and new_concentration text default null.
--      change_concentration false (or omitted): the marker is left as it is; new_concentration
--        must then be null ('Invalid request' otherwise).
--      change_concentration true: the marker is set to new_concentration with those Unicode
--        spaces trimmed, or cleared when new_concentration is null. A value that is empty after
--        trimming, longer than 100 characters or holds a refused code point raises
--        'Invalid concentration'. The function and the column check use the same expressions.
--    The marker is written in the same UPDATE as HP, slots, uses and conditions, under the same
--    campaign lock, authorization, request-id replay and revision check. The idempotency payload
--    is the previous array unchanged when the marker is not changed, and that array plus
--    ('concentration', new_concentration) when it is: a request id stored before this migration
--    still replays, and reusing an id with another marker raises 'Request mismatch'. The marker is
--    not under the encounter play lock (like conditions and slots). Absent characters stay
--    read-only for their Player through the existing vitals_absent trigger; archived characters
--    keep today's rules (none in this function).
-- 3. A long rest that rests the character (private.rest_apply, latest definition 20261114120000)
--    also clears the marker: it already restores every spell slot and resets death saves on the
--    server, and no concentration spell outlasts an eight-hour rest of sleep under the 2024 rules
--    in normal play, so a marker left over would be stale. A short rest leaves it (many
--    concentration spells last one hour or more). Unconsciousness, damage and the combat marker are
--    out of scope and stay manual.
-- 4. Reads. The sheet reads character_vitals directly under RLS (vitals_read: assigned Player or
--    campaign DM), so the new column follows the same rule with no grant change.
--    get_party_overview (latest definition 20261130120000) adds concentration under the rule of
--    conditions (DM, own character, or a teammate the DM shares live), so nobody new sees it.
--    export_my_data (latest definition 20261130120000) adds it to each own character's vitals.
--    get_combat_state is not changed: combatants keep their own encounter_combatants.concentration.
-- 5. History. private.history_changes (latest definition 20261202120000) adds concentration to the
--    vitals allow-list (after tracker_uses), so get_character_history shows the change to whoever
--    already reads that history (assigned Player and campaign DM).
--
-- Why this design (rollout). The migration reaches production before the new frontend. The
-- frontend in production calls set_character_vitals by name with the thirteen current arguments.
-- A second function name would duplicate the write path; an overload of the same name makes
-- PostgREST's named-argument resolution ambiguous (PGRST203). PostgreSQL cannot add arguments with
-- create or replace (it would create that overload), so the thirteen-argument function is dropped
-- and the fifteen-argument one created in the same transaction. The old call (named or positional,
-- without the new keys) resolves to it through the defaults and leaves the marker untouched, also
-- while a PostgREST schema cache still describes the old signature. A separate boolean tells
-- "leave unchanged" from "clear" without a sentinel string or a jsonb patch.
--
-- Security. Every function keeps security definer and search_path '' (history_changes stays
-- invoker and immutable; rest_apply stays definer). Grants are restated as before: the dropped and
-- recreated set_character_vitals and get_party_overview revoke all from public and anon and grant
-- execute to authenticated; export_my_data keeps its grants (create or replace);
-- history_changes and rest_apply keep no client execute. Table grants and RLS are unchanged. No
-- privilege is widened. The client never sends identity: auth.uid() and can_play_character decide.
--
-- Actor matrix: anon has no execute; outsiders, inactive members, another Player of the campaign
-- and a DM of another campaign raise Forbidden on set_character_vitals and read no vitals row; the
-- assigned Player and the campaign DM write and read it.
--
-- Environments: production runs the DDL on public / private. A PRE that has the objects this file
-- re-creates receives the same DDL through pre_admin.remap; where PRE does not exist (staging,
-- PGlite before an ETL) or lacks one of those objects, only production objects change and a
-- notice names every missing PRE object. The DDL is idempotent (add column if not exists, drop
-- function if exists, create or replace).
--
-- Rollout: apply this migration, check that the old thirteen-argument call still answers, then
-- publish the frontend that sends change_concentration / new_concentration. Rolling back the
-- frontend needs nothing; the column and arguments are additive for clients.

do $concentration$
declare ddl text := $ddl$
alter table public.character_vitals add column if not exists concentration text
  constraint character_vitals_concentration_check check (concentration is null or (
    char_length(concentration) between 1 and 100
    and concentration !~ '[\u0001-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]'
    and concentration = regexp_replace(concentration, '^[\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+|[\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+$', '', 'g')));
comment on column public.character_vitals.concentration is
  'RYT-134: the spell the character concentrates on; null when not concentrating. RPC writes only.';

-- 20261112120000 plus the concentration marker (two trailing arguments with defaults).
drop function if exists public.set_character_vitals(uuid, uuid, bigint, integer, integer, integer,
  integer, integer, boolean, text[], integer[], jsonb, uuid);
create or replace function public.set_character_vitals(target_campaign uuid, target_character uuid,
  expected_revision bigint, new_current_hp integer, new_temp_hp integer, new_hit_dice_spent integer,
  new_death_successes integer, new_death_failures integer, new_heroic_inspiration boolean,
  new_conditions text[], new_slots_used integer[], new_tracker_uses jsonb, request_id uuid,
  change_concentration boolean default false, new_concentration text default null)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare current public.character_vitals; sheet public.character_sheets; prior private.sheet_requests;
  changing boolean := coalesce(change_concentration, false);
  -- Unicode spaces trimmed at both ends; the same expressions as the column check.
  cleaned text := regexp_replace(new_concentration, '^[\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+|[\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+$', '', 'g');
  payload jsonb := jsonb_build_array('vitals', target_campaign, target_character, expected_revision,
    new_current_hp, new_temp_hp, new_hit_dice_spent, new_death_successes, new_death_failures,
    new_heroic_inspiration, new_conditions, new_slots_used, new_tracker_uses);
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null or (not changing and new_concentration is not null) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if changing and cleaned is not null and (char_length(cleaned) not between 1 and 100
      or cleaned ~ '[\u0001-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]') then
    raise exception 'Invalid concentration' using errcode = '22023'; end if;
  if changing then payload := payload || jsonb_build_array('concentration', new_concentration); end if;
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
    tracker_uses = coalesce(new_tracker_uses, '{}'::jsonb),
    concentration = case when changing then cleaned else concentration end,
    revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character;
  insert into private.sheet_requests(request_id, actor_id, character_id, payload, result_revision)
    values (request_id, auth.uid(), target_character, payload, current.revision + 1);
  return current.revision + 1;
end;
$fn$;
revoke all on function public.set_character_vitals(uuid, uuid, bigint, integer, integer, integer, integer,
  integer, boolean, text[], integer[], jsonb, uuid, boolean, text) from public, anon;
grant execute on function public.set_character_vitals(uuid, uuid, bigint, integer, integer, integer, integer,
  integer, boolean, text[], integer[], jsonb, uuid, boolean, text) to authenticated;

-- 20261114120000 plus: a long rest ends concentration.
create or replace function private.rest_apply(target_campaign uuid, target_character uuid, rest_kind text,
  spent integer, roll integer)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare e jsonb; w jsonb;
begin
  perform 1 from public.character_vitals where campaign_id = target_campaign and character_id = target_character for update;
  e := private.rest_effect(target_campaign, target_character, rest_kind, spent, roll);
  if e is null or not (e ->> 'can_rest')::boolean then return e - 'vitals'; end if;
  w := e -> 'vitals';
  update public.character_vitals set current_hp = (w ->> 'current_hp')::integer,
    temp_hp = (w ->> 'temp_hp')::integer, hit_dice_spent = (w ->> 'hit_dice_spent')::integer,
    death_successes = case when (w ->> 'death')::boolean then 0 else death_successes end,
    death_failures = case when (w ->> 'death')::boolean then 0 else death_failures end,
    slots_used = array(select t.slot::integer from jsonb_array_elements_text(w -> 'slots_used')
      with ordinality t(slot, ord) order by t.ord),
    tracker_uses = w -> 'tracker_uses',
    concentration = case when rest_kind = 'long' then null else concentration end,
    revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character;
  return e - 'vitals';
end;
$fn$;
revoke all on function private.rest_apply(uuid, uuid, text, integer, integer) from public, anon, authenticated;

-- 20261202120000 plus concentration in the vitals allow-list.
create or replace function private.history_changes(kind text, before_value jsonb, after_value jsonb)
returns jsonb language sql immutable set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('field', f.field, 'before', f.b, 'after', f.a)
      order by f.ord, f.field), '[]'::jsonb)
  from (
    select k.field, k.ord, before_value -> k.field b, after_value -> k.field a
      from unnest(case split_part(kind, ':', 1)
          when 'character_vitals' then array['current_hp', 'temp_hp', 'hit_dice_spent', 'death_successes',
            'death_failures', 'heroic_inspiration', 'conditions', 'slots_used', 'tracker_uses',
            'concentration']
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

-- 20261130120000 plus concentration, under the rule of conditions.
drop function if exists public.get_party_overview(uuid);
create function public.get_party_overview(target_campaign uuid)
returns table(id uuid, name text, is_own boolean, is_assigned boolean, shares_live boolean, sheet_status text,
  class_key text, class_label text, level integer, current_hp integer, max_hp integer,
  temp_hp integer, armor_class integer, exhaustion integer, conditions text[], below_party_level boolean,
  concentration text)
language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; party integer;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  select c.party_level into party from public.campaigns c where c.id = target_campaign;
  return query
    select c.id, c.name, c.user_id is not distinct from viewer, c.user_id is not null, c.shares_live, s.status,
      s.build->>'classKey', s.build->>'classLabel', s.level,
      case when x.live then v.current_hp end, case when x.live then s.max_hp end,
      case when x.live then v.temp_hp end, case when x.live then s.armor_class end,
      case when x.live then r.exhaustion::integer end, case when x.live then v.conditions end,
      coalesce(s.status = 'complete' and s.level < party, false),
      case when x.live then v.concentration end
    from public.characters c
    cross join lateral (select dm or c.user_id is not distinct from viewer or c.shares_live as live) x
    left join public.character_sheets s on s.campaign_id = c.campaign_id and s.character_id = c.id
    left join public.character_vitals v on v.campaign_id = c.campaign_id and v.character_id = c.id
    left join public.character_resources r on r.campaign_id = c.campaign_id and r.character_id = c.id
    where c.campaign_id = target_campaign and c.is_active and (dm or c.user_id is not null)
    order by c.created_at, c.id;
end;
$fn$;
revoke all on function public.get_party_overview(uuid) from public, anon;
grant execute on function public.get_party_overview(uuid) to authenticated;

-- 20261130120000 plus concentration in each own character's vitals.
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); env constant text := split_part('public.campaigns', '.', 1);
  cap constant integer := 500; my_email text := private.verified_email();
  sections jsonb; section_name text; truncated text[] := '{}';
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  sections := jsonb_build_object(
    'memberships', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select m.joined_at k, m.campaign_id id, jsonb_build_object('campaign_id', m.campaign_id,
          'campaign_name', case when m.active then c.name end, 'role', m.role, 'active', m.active,
          'joined_at', m.joined_at, 'is_owner', c.owner_id = viewer) j
        from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
        where m.user_id = viewer order by m.joined_at, m.campaign_id limit cap + 1) x), '[]'::jsonb),
    'characters', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select ch.created_at k, ch.id, jsonb_build_object('id', ch.id, 'campaign_id', ch.campaign_id,
          'name', ch.name, 'created_at', ch.created_at, 'is_active', ch.is_active,
          'archived_at', ch.archived_at, 'absent', ch.absent, 'shares_live', ch.shares_live,
          'sheet', (select jsonb_build_object('status', s.status, 'level', s.level, 'max_hp', s.max_hp,
              'armor_class', s.armor_class, 'build', s.build, 'portrait_path', s.portrait_path,
              'updated_at', s.updated_at)
            from public.character_sheets s where s.campaign_id = ch.campaign_id and s.character_id = ch.id),
          'vitals', (select jsonb_build_object('current_hp', v.current_hp, 'temp_hp', v.temp_hp,
              'hit_dice_spent', v.hit_dice_spent, 'death_successes', v.death_successes,
              'death_failures', v.death_failures, 'heroic_inspiration', v.heroic_inspiration,
              'conditions', v.conditions, 'slots_used', v.slots_used, 'tracker_uses', v.tracker_uses,
              'concentration', v.concentration)
            from public.character_vitals v where v.campaign_id = ch.campaign_id and v.character_id = ch.id),
          'resources', (select jsonb_build_object('gold', r.gold, 'water_units', r.water_units,
              'rations', r.rations, 'exhaustion', r.exhaustion)
            from public.character_resources r where r.campaign_id = ch.campaign_id and r.character_id = ch.id)) j
        from public.characters ch
        where ch.user_id = viewer and exists (select 1 from public.campaign_members m
          where m.campaign_id = ch.campaign_id and m.user_id = viewer and m.active)
        order by ch.created_at, ch.id limit cap + 1) x), '[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select i.created_at k, i.id, jsonb_build_object('id', i.id, 'campaign_id', i.campaign_id,
          'character_id', i.character_id, 'quantity', i.quantity, 'equipped_slot', i.equipped_slot,
          'source', i.source, 'notes', i.notes, 'created_at', i.created_at,
          'item', private.shop_item_json(i.definition_id)) j
        from public.inventory_items i join public.characters ch
          on ch.campaign_id = i.campaign_id and ch.id = i.character_id
        where ch.user_id = viewer and exists (select 1 from public.campaign_members m
          where m.campaign_id = ch.campaign_id and m.user_id = viewer and m.active)
        order by i.created_at, i.id limit cap + 1) x), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select i.created_at k, i.id, jsonb_build_object('id', i.id, 'campaign_id', i.campaign_id,
          'campaign_name', case when i.status = 'pending' and i.expires_at > now() then c.name end,
          'status', i.status, 'created_at', i.created_at, 'expires_at', i.expires_at,
          'responded_at', i.responded_at) j
        from public.campaign_invitations i join public.campaigns c on c.id = i.campaign_id
        where my_email is not null and i.email = my_email
        order by i.created_at, i.id limit cap + 1) x), '[]'::jsonb),
    'shop_orders', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select o.created_at k, o.id, jsonb_build_object('id', o.id, 'campaign_id', o.campaign_id,
          'shop_id', o.shop_id, 'character_id', o.character_id, 'kind', o.kind, 'status', o.status,
          'total', o.total, 'refunded', o.refunded, 'player_note', o.player_note,
          'created_at', o.created_at, 'closed_at', o.closed_at,
          'lines', (select coalesce(jsonb_agg(jsonb_build_object('item_name', d.name,
              'quantity', ln.quantity, 'final_price', ln.final_price) order by ln.id), '[]'::jsonb)
            from public.shop_order_lines ln join public.item_definitions d
              on d.campaign_id = ln.campaign_id and d.id = ln.definition_id
            where ln.campaign_id = o.campaign_id and ln.order_id = o.id)) j
        from public.shop_orders o where o.actor_id = viewer
        order by o.created_at, o.id limit cap + 1) x), '[]'::jsonb),
    'trades', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select t.created_at k, t.id, jsonb_build_object('id', t.id, 'campaign_id', t.campaign_id,
          'initiator_character', t.initiator_character, 'partner_character', t.partner_character,
          'status', t.status, 'created_at', t.created_at, 'completed_at', t.completed_at) j
        from public.trades t where t.created_by = viewer
        order by t.created_at, t.id limit cap + 1) x), '[]'::jsonb),
    'item_proposals', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select p.created_at k, p.id, jsonb_build_object('id', p.id, 'campaign_id', p.campaign_id,
          'character_id', p.character_id, 'draft', p.draft, 'quantity', p.quantity,
          'status', p.status, 'created_at', p.created_at, 'resolved_at', p.resolved_at) j
        from public.item_proposals p where p.proposed_by = viewer
        order by p.created_at, p.id limit cap + 1) x), '[]'::jsonb),
    'rest_requests', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select r.created_at k, r.id, jsonb_build_object('id', r.id, 'campaign_id', r.campaign_id,
          'kind', r.kind, 'status', r.status, 'created_at', r.created_at) j
        from public.rest_requests r where r.requested_by = viewer
        order by r.created_at, r.id limit cap + 1) x), '[]'::jsonb),
    'character_events', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select e.created_at k, e.id, jsonb_build_object('id', e.id, 'campaign_id', e.campaign_id,
          'character_id', e.character_id, 'kind', e.kind, 'created_at', e.created_at) j
        from public.character_events e where e.actor_id = viewer
        order by e.created_at, e.id limit cap + 1) x), '[]'::jsonb),
    'inventory_events', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select e.created_at k, e.id, jsonb_build_object('id', e.id, 'campaign_id', e.campaign_id,
          'character_id', e.character_id, 'item_id', e.item_id, 'kind', e.kind,
          'quantity_delta', e.quantity_delta, 'created_at', e.created_at) j
        from public.inventory_events e where e.actor_id = viewer
        order by e.created_at, e.id limit cap + 1) x), '[]'::jsonb),
    'combat_events', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select e.created_at k, e.id, jsonb_build_object('id', e.id, 'campaign_id', e.campaign_id,
          'encounter_id', e.encounter_id, 'round', e.round, 'kind', e.kind, 'created_at', e.created_at) j
        from public.encounter_events e where e.actor_id = viewer
          and (e.visible or exists (select 1 from public.campaign_members m
            where m.campaign_id = e.campaign_id and m.user_id = viewer and m.active and m.role = 'dm'))
        order by e.created_at, e.id limit cap + 1) x), '[]'::jsonb),
    'item_definitions', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select d.created_at k, d.id, jsonb_build_object('id', d.id, 'campaign_id', d.campaign_id,
          'name', d.name, 'origin', d.origin, 'created_at', d.created_at) j
        from public.item_definitions d where d.created_by = viewer
          and exists (select 1 from public.campaign_members m
            where m.campaign_id = d.campaign_id and m.user_id = viewer and m.active)
        order by d.created_at, d.id limit cap + 1) x), '[]'::jsonb),
    'glossary_entries', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select g.created_at k, g.id, jsonb_build_object('id', g.id, 'campaign_id', g.campaign_id,
          'category', g.category, 'name', g.name, 'created_at', g.created_at) j
        from public.glossary_entries g where g.created_by = viewer
          and exists (select 1 from public.campaign_members m
            where m.campaign_id = g.campaign_id and m.user_id = viewer and m.active and m.role = 'dm')
        order by g.created_at, g.id limit cap + 1) x), '[]'::jsonb),
    'content_packs', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select p.created_at k, p.id, jsonb_build_object('id', p.id, 'slug', p.slug,
          'title_en', p.title_en, 'title_es', p.title_es, 'visibility', p.visibility,
          'version', p.version, 'created_at', p.created_at) j
        from public.content_packs p where p.owner_id = viewer
        order by p.created_at, p.id limit cap + 1) x), '[]'::jsonb),
    -- RYT-133: own rolls and authored campaign settings events (20261130120000).
    'rolls', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select r.created_at k, r.id, jsonb_build_object('id', r.id, 'campaign_id', r.campaign_id,
          'character_id', r.character_id, 'label', r.label, 'expression', r.expression, 'dice', r.dice,
          'total', r.total, 'kind', r.kind, 'source', r.source, 'visibility', r.visibility,
          'created_at', r.created_at) j
        from public.campaign_rolls r where r.roller_id = viewer
        order by r.created_at, r.id limit cap + 1) x), '[]'::jsonb),
    'campaign_events', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select e.created_at k, e.id, jsonb_build_object('id', e.id, 'campaign_id', e.campaign_id,
          'kind', e.kind, 'before_value', e.before_value, 'after_value', e.after_value,
          'created_at', e.created_at) j
        from public.campaign_events e where e.actor_id = viewer
        order by e.created_at, e.id limit cap + 1) x), '[]'::jsonb));
  for section_name in select jsonb_object_keys(sections) loop
    if jsonb_array_length(sections -> section_name) > cap then
      sections := jsonb_set(sections, array[section_name], (sections -> section_name) - cap);
      truncated := truncated || section_name;
    end if;
  end loop;
  return jsonb_build_object('format', 'rytta-account-export', 'version', 1, 'environment', env,
    'generated_at', now(), 'limits', jsonb_build_object('rows_per_section', cap),
    'truncated', to_jsonb(array(select t from unnest(truncated) t order by t)),
    'profile', (select jsonb_build_object('user_id', u.id, 'email', u.email,
        'name', nullif(left(u.raw_user_meta_data ->> 'full_name', 100), ''),
        'username', (select p.username from public.profiles p where p.user_id = viewer))
      from auth.users u where u.id = viewer)) || sections;
end;
$fn$;
$ddl$;
  missing text[];
begin
  execute ddl;
  select coalesce(array_agg(x.name order by x.ord), '{}') into missing
    from (values
      (1, 'pre_admin.remap(text)', to_regprocedure('pre_admin.remap(text)') is not null),
      (2, 'pre.character_vitals', to_regclass('pre.character_vitals') is not null),
      (3, 'pre.campaign_rolls', to_regclass('pre.campaign_rolls') is not null),
      (4, 'pre.campaign_events', to_regclass('pre.campaign_events') is not null),
      (5, 'pre_private.sheet_requests', to_regclass('pre_private.sheet_requests') is not null),
      (6, 'pre_private.character_in_live_encounter(uuid,uuid)',
        to_regprocedure('pre_private.character_in_live_encounter(uuid,uuid)') is not null),
      (7, 'pre_private.rest_effect(uuid,uuid,text,integer,integer)',
        to_regprocedure('pre_private.rest_effect(uuid,uuid,text,integer,integer)') is not null),
      (8, 'pre_private.rest_apply(uuid,uuid,text,integer,integer)',
        to_regprocedure('pre_private.rest_apply(uuid,uuid,text,integer,integer)') is not null),
      (9, 'pre_private.history_changes(text,jsonb,jsonb)',
        to_regprocedure('pre_private.history_changes(text,jsonb,jsonb)') is not null),
      (10, 'pre_private.verified_email()', to_regprocedure('pre_private.verified_email()') is not null),
      (11, 'pre.get_party_overview(uuid)', to_regprocedure('pre.get_party_overview(uuid)') is not null),
      (12, 'pre.export_my_data()', to_regprocedure('pre.export_my_data()') is not null),
      (13, 'pre.apply_level_up(uuid,uuid,bigint,integer,integer,jsonb,uuid)',
        to_regprocedure('pre.apply_level_up(uuid,uuid,bigint,integer,integer,jsonb,uuid)') is not null)
    ) x(ord, name, present)
    where not x.present;
  if cardinality(missing) = 0 then
    execute pre_admin.remap(ddl);
  else
    raise notice '20261203120000: PRE not updated, missing %', array_to_string(missing, ', ');
  end if;
end;
$concentration$;
