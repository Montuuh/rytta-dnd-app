-- RYT-007 / RYT-035 / RYT-036 / RYT-037: shared combat (encounters, initiative, turns, hit points,
-- conditions, timed effects, concentration, death saves, combat log with undo and summary) and a
-- homebrew combatant bestiary. Player characters join an encounter by reference: their hit points,
-- death saves and conditions stay in character_vitals (one source of truth with the sheet), while
-- NPCs, monsters and the lair keep their own combat state in encounter_combatants.
--
-- Actor matrix:
--   anon: no table access, no RPC execution.
--   outsider / inactive member / DM of another campaign: every RPC raises Forbidden (or
--           Encounter unavailable for ids of another campaign); RLS hides every row.
--   Player (active member): reads non-draft encounters of the campaign (encounters row only; no
--           secrets) and the role projection get_combat_state. Sets the initiative of, and applies
--           hit points, conditions, concentration, death saves and effects to, characters it can
--           play (its own). Undoes its own events on its own character. Never reads hidden
--           combatants, exact NPC hit points the DM did not reveal, NPC armor class, DM notes,
--           private events or vitals of teammates that do not share live (ADR 020).
--   active campaign DM: prepares, runs and ends encounters; edits every combatant and template.
-- Table projection (get_combat_state with as_table): the Player projection without own data.
-- Tables are read-only through the Data API. Only encounters is in the realtime publication; it
-- carries no secret, and every mutation (and every vitals/sheet/resource change of a character in a
-- live encounter) increments its revision so subscribers refetch the projection.
-- Mutations lock the campaign row first and replay retried request ids (private.combat_requests).
--
-- Environments: this file runs on production (public). A PRE (pre / pre_private) that predates
-- this migration receives the same tables, policies, triggers and functions through the guarded
-- blocks, remapped with the canonical pre_admin.remap used by the ETL (docs/pre-environment.md).
-- Apply to PRE first, validate, then to production.

do $structure$
declare ddl text := $ddl$
  create table public.encounters (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    name text not null check (char_length(btrim(name)) between 1 and 80),
    status text not null default 'draft' check (status in ('draft', 'initiative', 'active', 'ended')),
    round integer not null default 0 check (round between 0 and 9999),
    active_combatant uuid,
    revision bigint not null default 0 check (revision between 0 and 9007199254740991),
    summary jsonb check (summary is null or (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 65536)),
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    started_at timestamptz,
    ended_at timestamptz,
    unique (campaign_id, id)
  );
  -- One live encounter per campaign.
  create unique index encounters_live on public.encounters(campaign_id) where status in ('initiative', 'active');
  create index encounters_campaign on public.encounters(campaign_id, updated_at desc);

  create table public.encounter_combatants (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null,
    encounter_id uuid not null,
    kind text not null check (kind in ('character', 'npc', 'lair')),
    character_id uuid,
    side text not null default 'enemy' check (side in ('party', 'ally', 'enemy')),
    name text not null check (char_length(btrim(name)) between 1 and 80),
    initiative integer check (initiative between -20 and 99),
    initiative_bonus integer not null default 0 check (initiative_bonus between -20 and 30),
    order_key integer not null default 0 check (order_key between 0 and 1000),
    group_key text check (group_key is null or char_length(group_key) between 1 and 80),
    max_hp integer check (max_hp between 1 and 99999),
    current_hp integer check (current_hp between 0 and 99999),
    temp_hp integer not null default 0 check (temp_hp between 0 and 99999),
    armor_class integer check (armor_class between 0 and 99),
    hidden boolean not null default false,
    hp_revealed boolean not null default false,
    conditions text[] not null default array[]::text[] check (conditions <@ array[
      'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible',
      'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious']::text[]),
    defeated boolean not null default false,
    concentration text check (concentration is null or char_length(concentration) between 1 and 80),
    legendary_max integer not null default 0 check (legendary_max between 0 and 9),
    legendary_used integer not null default 0 check (legendary_used between 0 and 9),
    dm_notes text not null default '' check (char_length(dm_notes) <= 2000),
    created_at timestamptz not null default now(),
    revision bigint not null default 0 check (revision between 0 and 9007199254740991),
    unique (campaign_id, id),
    unique (encounter_id, character_id),
    foreign key (campaign_id, encounter_id) references public.encounters(campaign_id, id) on delete cascade,
    foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade,
    check ((kind = 'character') = (character_id is not null)),
    check (kind = 'character' or (max_hp is not null and current_hp is not null and current_hp <= max_hp)),
    check (legendary_used <= legendary_max)
  );
  create index encounter_combatants_encounter on public.encounter_combatants(encounter_id);
  create index encounter_combatants_character on public.encounter_combatants(character_id)
    where character_id is not null;

  create table public.encounter_effects (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null,
    encounter_id uuid not null,
    target_combatant uuid not null,
    source_combatant uuid references public.encounter_combatants(id) on delete set null,
    label text not null check (char_length(btrim(label)) between 1 and 60),
    condition text check (condition is null or condition = any (array[
      'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible',
      'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious']::text[])),
    remaining_rounds integer check (remaining_rounds between 1 and 100),
    ticks_on text not null default 'end' check (ticks_on in ('start', 'end')),
    visible boolean not null default true,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    foreign key (campaign_id, encounter_id) references public.encounters(campaign_id, id) on delete cascade,
    foreign key (campaign_id, target_combatant) references public.encounter_combatants(campaign_id, id)
      on delete cascade
  );
  create index encounter_effects_encounter on public.encounter_effects(encounter_id);

  create table public.encounter_events (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null,
    encounter_id uuid not null,
    round integer not null default 0,
    kind text not null check (kind in ('status', 'turn', 'round', 'initiative', 'join', 'leave', 'reveal',
      'damage', 'heal', 'temp', 'condition_on', 'condition_off', 'concentration', 'death_save',
      'defeated', 'revived', 'effect_on', 'effect_off', 'effect_expired', 'undo')),
    actor_id uuid references auth.users(id) on delete set null,
    source_combatant uuid,
    target_combatant uuid,
    target_name text,
    amount integer,
    detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
    before_state jsonb,
    after_state jsonb,
    visible boolean not null default true,
    undone_by uuid,
    created_at timestamptz not null default now(),
    foreign key (campaign_id, encounter_id) references public.encounters(campaign_id, id) on delete cascade
  );
  create index encounter_events_encounter on public.encounter_events(encounter_id, created_at desc);

  create table public.combatant_templates (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    name text not null check (char_length(btrim(name)) between 1 and 80),
    side text not null default 'enemy' check (side in ('ally', 'enemy')),
    max_hp integer not null check (max_hp between 1 and 99999),
    armor_class integer not null default 10 check (armor_class between 0 and 99),
    initiative_bonus integer not null default 0 check (initiative_bonus between -20 and 30),
    legendary_max integer not null default 0 check (legendary_max between 0 and 9),
    notes text not null default '' check (char_length(notes) <= 2000),
    revision bigint not null default 0 check (revision between 0 and 9007199254740991),
    updated_at timestamptz not null default now(),
    unique (campaign_id, id)
  );

  create table private.combat_requests (
    request_id uuid primary key,
    actor_id uuid not null,
    payload jsonb not null,
    result jsonb not null
  );
  revoke all on private.combat_requests from public, anon, authenticated;
  alter table private.combat_requests enable row level security;

  alter table public.encounters enable row level security;
  alter table public.encounter_combatants enable row level security;
  alter table public.encounter_effects enable row level security;
  alter table public.encounter_events enable row level security;
  alter table public.combatant_templates enable row level security;
  revoke all on public.encounters, public.encounter_combatants, public.encounter_effects,
    public.encounter_events, public.combatant_templates from public, anon, authenticated;
  grant select on public.encounters, public.encounter_combatants, public.encounter_effects,
    public.encounter_events, public.combatant_templates to authenticated;
  -- Members see that a non-draft encounter exists (realtime signal); everything else is DM-only
  -- and reaches Players through the get_combat_state projection.
  create policy encounters_read on public.encounters for select to authenticated
    using (private.is_campaign_dm(campaign_id)
      or (status <> 'draft' and private.is_campaign_member(campaign_id)));
  create policy encounter_combatants_read on public.encounter_combatants for select to authenticated
    using (private.is_campaign_dm(campaign_id));
  create policy encounter_effects_read on public.encounter_effects for select to authenticated
    using (private.is_campaign_dm(campaign_id));
  create policy encounter_events_read on public.encounter_events for select to authenticated
    using (private.is_campaign_dm(campaign_id));
  create policy combatant_templates_read on public.combatant_templates for select to authenticated
    using (private.is_campaign_dm(campaign_id));
  comment on table public.encounters is
    'RYT-007 encounters: status, round and active turn. No secrets; realtime signal. RPC writes only.';
  comment on table public.encounter_combatants is
    'RYT-007 combatants: characters by reference, NPC/lair combat state. DM-only reads. RPC writes only.';
  comment on table public.encounter_effects is
    'RYT-036 timed effects that tick at the start or end of a turn. DM-only reads. RPC writes only.';
  comment on table public.encounter_events is
    'RYT-036 combat log with undo snapshots. DM-only reads; Players use get_combat_state. RPC writes only.';
  comment on table public.combatant_templates is
    'RYT-035 homebrew combatant bestiary of a campaign. DM-only. RPC writes only.';

  -- A vitals, sheet or resource change of a character in a live encounter bumps that encounter,
  -- so realtime subscribers refetch (the sheet and the combat screen share one source of truth).
  create function private.combat_touch_character() returns trigger
  language plpgsql security definer set search_path = '' as $fn$
  begin
    update public.encounters e set revision = e.revision + 1, updated_at = now()
      where e.campaign_id = new.campaign_id and e.status in ('initiative', 'active')
        and exists (select 1 from public.encounter_combatants c
          where c.encounter_id = e.id and c.character_id = new.character_id);
    return new;
  end;
  $fn$;
  revoke all on function private.combat_touch_character() from public, anon, authenticated;
  create trigger vitals_combat after update on public.character_vitals
    for each row execute function private.combat_touch_character();
  create trigger sheets_combat after update on public.character_sheets
    for each row execute function private.combat_touch_character();
  create trigger resources_combat after update on public.character_resources
    for each row execute function private.combat_touch_character();
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.characters') is not null and to_regprocedure('pre_admin.remap(text)') is not null
      and to_regclass('pre.encounters') is null then
    execute pre_admin.remap(ddl);
  end if;
end;
$structure$;

-- ---------------------------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------------------------

-- Campaign lock, membership and idempotent replay. Role checks follow in each RPC.
create function private.combat_begin(target_campaign uuid, request_id uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare prior private.combat_requests;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if auth.uid() is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.combat_requests r where r.request_id = combat_begin.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result;
  end if;
  return null;
end;
$$;

create function private.combat_finish(request_id uuid, payload jsonb, result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.combat_requests values (request_id, auth.uid(), payload, result);
  return result;
end;
$$;

create function private.combat_require_dm(target_campaign uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
end;
$$;

-- The encounter row, locked. Players never reach drafts (no existence leak).
create function private.combat_encounter(target_campaign uuid, target_encounter uuid)
returns public.encounters
language plpgsql security definer set search_path = '' as $$
declare e public.encounters;
begin
  select * into e from public.encounters
    where campaign_id = target_campaign and id = target_encounter for update;
  if e.id is null or (e.status = 'draft' and not private.is_campaign_dm(target_campaign)) then
    raise exception 'Encounter unavailable' using errcode = '42501'; end if;
  return e;
end;
$$;

create function private.combat_require_live(e public.encounters) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if e.status not in ('initiative', 'active') then
    raise exception 'Encounter closed' using errcode = 'P0001'; end if;
end;
$$;

create function private.combat_combatant(e public.encounters, target uuid)
returns public.encounter_combatants
language plpgsql security definer set search_path = '' as $$
declare c public.encounter_combatants;
begin
  select * into c from public.encounter_combatants
    where encounter_id = e.id and campaign_id = e.campaign_id and id = target for update;
  -- Players cannot address hidden combatants either.
  if c.id is null or (c.hidden and not private.is_campaign_dm(e.campaign_id)) then
    raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  return c;
end;
$$;

-- DM for anyone; a Player only for a character combatant it can play.
create function private.combat_can_act(c public.encounter_combatants) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.is_campaign_dm(c.campaign_id)
    or (c.kind = 'character' and private.can_play_character(c.campaign_id, c.character_id));
end;
$$;

create function private.combat_require_act(c public.encounter_combatants) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.combat_can_act(c) then raise exception 'Forbidden' using errcode = '42501'; end if;
end;
$$;

create function private.combat_bump(target_encounter uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare r bigint;
begin
  update public.encounters set revision = revision + 1, updated_at = now()
    where id = target_encounter returning revision into r;
  return r;
end;
$$;

create function private.combat_result(target_encounter uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('encounter_id', e.id, 'status', e.status, 'round', e.round,
    'active_combatant', e.active_combatant, 'revision', e.revision)
  from public.encounters e where e.id = target_encounter;
$$;

create function private.combat_log(e public.encounters, event_kind text, target public.encounter_combatants,
  event_amount integer, event_detail jsonb, before_snapshot jsonb, after_snapshot jsonb,
  is_visible boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  insert into public.encounter_events(campaign_id, encounter_id, round, kind, actor_id, source_combatant,
    target_combatant, target_name, amount, detail, before_state, after_state, visible)
  values (e.campaign_id, e.id, e.round, event_kind, auth.uid(), e.active_combatant, target.id, target.name,
    event_amount, coalesce(event_detail, '{}'::jsonb), before_snapshot, after_snapshot,
    is_visible and not coalesce(target.hidden, false))
  returning id into new_id;
  return new_id;
end;
$$;

-- Undoable state of one combatant: hit points, death saves, conditions and defeat.
create function private.combat_snapshot(target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.encounter_combatants; v public.character_vitals;
begin
  select * into c from public.encounter_combatants where id = target;
  if c.kind = 'character' then
    select * into v from public.character_vitals where character_id = c.character_id;
    return jsonb_build_object('hp', v.current_hp, 'temp', v.temp_hp, 'ds', v.death_successes,
      'df', v.death_failures, 'conditions', to_jsonb(v.conditions), 'defeated', c.defeated,
      'concentration', c.concentration);
  end if;
  return jsonb_build_object('hp', c.current_hp, 'temp', c.temp_hp, 'conditions', to_jsonb(c.conditions),
    'defeated', c.defeated, 'concentration', c.concentration);
end;
$$;

create function private.combat_restore(target uuid, snapshot jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.encounter_combatants;
  restored text[] := array(select jsonb_array_elements_text(snapshot -> 'conditions'));
begin
  select * into c from public.encounter_combatants where id = target for update;
  if c.kind = 'character' then
    update public.character_vitals set current_hp = (snapshot ->> 'hp')::integer,
        temp_hp = (snapshot ->> 'temp')::integer, death_successes = (snapshot ->> 'ds')::integer,
        death_failures = (snapshot ->> 'df')::integer, conditions = restored, revision = revision + 1
      where character_id = c.character_id;
  else
    update public.encounter_combatants set current_hp = (snapshot ->> 'hp')::integer,
        temp_hp = (snapshot ->> 'temp')::integer, conditions = restored
      where id = c.id;
  end if;
  update public.encounter_combatants set defeated = (snapshot ->> 'defeated')::boolean,
      concentration = snapshot ->> 'concentration', revision = revision + 1
    where id = c.id;
end;
$$;

-- Adds or removes one condition on a combatant (vitals for characters). Returns true on change.
create function private.combat_condition(c public.encounter_combatants, condition_key text, enabled boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare current_conditions text[];
begin
  if c.kind = 'character' then
    select conditions into current_conditions from public.character_vitals
      where character_id = c.character_id for update;
  else
    select conditions into current_conditions from public.encounter_combatants where id = c.id;
  end if;
  if enabled = (condition_key = any(current_conditions)) then return false; end if;
  current_conditions := case when enabled then current_conditions || condition_key
    else array_remove(current_conditions, condition_key) end;
  if c.kind = 'character' then
    update public.character_vitals set conditions = current_conditions, revision = revision + 1
      where character_id = c.character_id;
  else
    update public.encounter_combatants set conditions = current_conditions, revision = revision + 1
      where id = c.id;
  end if;
  return true;
end;
$$;

-- Initiative order of an encounter: higher total, then higher bonus, then the DM tie order.
create function private.combat_order(target_encounter uuid, turns_only boolean) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id order by c.initiative desc nulls last, c.initiative_bonus desc,
      c.order_key, c.created_at, c.name, c.id), array[]::uuid[])
  from public.encounter_combatants c
  where c.encounter_id = target_encounter and (not turns_only or (not c.hidden and not c.defeated));
$$;

-- Removes one effect, clears its condition when no other effect on the target still grants it.
create function private.combat_drop_effect(e public.encounters, fx public.encounter_effects, event_kind text)
returns void
language plpgsql security definer set search_path = '' as $$
declare target public.encounter_combatants;
begin
  delete from public.encounter_effects where id = fx.id;
  select * into target from public.encounter_combatants where id = fx.target_combatant;
  if fx.condition is not null and not exists (select 1 from public.encounter_effects o
      where o.target_combatant = fx.target_combatant and o.condition = fx.condition) then
    perform private.combat_condition(target, fx.condition, false);
  end if;
  perform private.combat_log(e, event_kind, target, null,
    jsonb_build_object('label', fx.label, 'condition', fx.condition), null, null, fx.visible);
end;
$$;

-- Counts down effects tied to the start or end of one combatant's turn.
create function private.combat_tick(e public.encounters, who uuid, phase text) returns void
language plpgsql security definer set search_path = '' as $$
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
end;
$$;

-- Strict integer field of a jsonb object, with a default when absent.
create function private.combat_int(source jsonb, field text, low integer, high integer, fallback integer)
returns integer
language plpgsql immutable set search_path = '' as $$
declare n numeric;
begin
  if source is null or not (source ? field) or jsonb_typeof(source -> field) = 'null' then return fallback; end if;
  if jsonb_typeof(source -> field) <> 'number' then raise exception 'Invalid request' using errcode = '22023'; end if;
  n := (source ->> field)::numeric;
  if n <> trunc(n) or n < low or n > high then raise exception 'Invalid request' using errcode = '22023'; end if;
  return n::integer;
end;
$$;

create function private.combat_text(source jsonb, field text, max_length integer, fallback text) returns text
language plpgsql immutable set search_path = '' as $$
declare t text;
begin
  if source is null or not (source ? field) or jsonb_typeof(source -> field) = 'null' then return fallback; end if;
  if jsonb_typeof(source -> field) <> 'string' then raise exception 'Invalid request' using errcode = '22023'; end if;
  t := btrim(source ->> field);
  if char_length(t) > max_length then raise exception 'Invalid request' using errcode = '22023'; end if;
  return t;
end;
$$;

create function private.combat_bool(source jsonb, field text, fallback boolean) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if source is null or not (source ? field) or jsonb_typeof(source -> field) = 'null' then return fallback; end if;
  if jsonb_typeof(source -> field) <> 'boolean' then raise exception 'Invalid request' using errcode = '22023'; end if;
  return (source ->> field)::boolean;
end;
$$;

-- Summary of a finished encounter from the log (undone events excluded). Damage dealt is
-- attributed to whoever held the turn when it was applied.
create function private.combat_summary(target_encounter uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rounds', e.round,
    'started_at', e.started_at,
    'ended_at', now(),
    'combatants', coalesce((select jsonb_agg(jsonb_build_object(
        'combatant_id', c.id, 'name', c.name, 'kind', c.kind, 'side', c.side, 'defeated', c.defeated,
        'damage_taken', coalesce((select sum(x.amount) from public.encounter_events x
          where x.encounter_id = e.id and x.target_combatant = c.id and x.kind = 'damage'
            and x.undone_by is null), 0),
        'damage_dealt', coalesce((select sum(x.amount) from public.encounter_events x
          where x.encounter_id = e.id and x.source_combatant = c.id and x.kind = 'damage'
            and x.undone_by is null and x.target_combatant is distinct from c.id), 0),
        'healing', coalesce((select sum(x.amount) from public.encounter_events x
          where x.encounter_id = e.id and x.target_combatant = c.id and x.kind = 'heal'
            and x.undone_by is null), 0),
        'downed', exists (select 1 from public.encounter_events x
          where x.encounter_id = e.id and x.target_combatant = c.id and x.undone_by is null
            and x.kind = 'damage' and (x.after_state ->> 'hp')::integer = 0))
      order by c.side, c.name, c.id)
      from public.encounter_combatants c where c.encounter_id = e.id), '[]'::jsonb))
  from public.encounters e where e.id = target_encounter;
$$;

-- ---------------------------------------------------------------------------------------------
-- Encounter lifecycle (DM)
-- ---------------------------------------------------------------------------------------------

create function public.create_encounter(target_campaign uuid, encounter_name text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('encounter_create', target_campaign, encounter_name);
  replay jsonb; new_id uuid;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  if encounter_name is null or char_length(btrim(encounter_name)) not between 1 and 80 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  insert into public.encounters(campaign_id, name, created_by)
    values (target_campaign, btrim(encounter_name), auth.uid()) returning id into new_id;
  return private.combat_finish(request_id, payload, private.combat_result(new_id));
end;
$$;

create function public.rename_encounter(target_campaign uuid, target_encounter uuid, encounter_name text,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('encounter_rename', target_campaign, target_encounter, encounter_name);
  replay jsonb; e public.encounters;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  e := private.combat_encounter(target_campaign, target_encounter);
  if encounter_name is null or char_length(btrim(encounter_name)) not between 1 and 80 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  update public.encounters set name = btrim(encounter_name) where id = e.id;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- Drafts and finished encounters can be deleted; a live one must be ended first.
create function public.delete_encounter(target_campaign uuid, target_encounter uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.encounters;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  perform private.combat_require_dm(target_campaign);
  select * into e from public.encounters where campaign_id = target_campaign and id = target_encounter for update;
  if e.id is null then return jsonb_build_object('deleted', false); end if;
  if e.status in ('initiative', 'active') then
    raise exception 'Encounter live' using errcode = 'P0001'; end if;
  delete from public.encounters where id = e.id;
  return jsonb_build_object('deleted', true);
end;
$$;

-- draft -> initiative -> active -> ended; initiative -> draft (cancel); draft -> active (skip).
create function public.set_encounter_status(target_campaign uuid, target_encounter uuid, new_status text,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('encounter_status', target_campaign, target_encounter, new_status);
  replay jsonb; e public.encounters; turn_order uuid[]; first uuid;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  e := private.combat_encounter(target_campaign, target_encounter);
  if not ((e.status = 'draft' and new_status in ('initiative', 'active'))
      or (e.status = 'initiative' and new_status in ('active', 'draft', 'ended'))
      or (e.status = 'active' and new_status = 'ended')) then
    raise exception 'Invalid transition' using errcode = 'P0001'; end if;
  if new_status in ('initiative', 'active') and e.status = 'draft' and exists (select 1 from public.encounters o
      where o.campaign_id = target_campaign and o.status in ('initiative', 'active') and o.id <> e.id) then
    raise exception 'Encounter busy' using errcode = 'P0001'; end if;
  if new_status = 'active' then
    turn_order := private.combat_order(e.id, true);
    if cardinality(turn_order) = 0 then raise exception 'No combatants' using errcode = 'P0001'; end if;
    first := turn_order[1];
    update public.encounters set status = 'active', round = 1, active_combatant = first,
        started_at = now(), updated_at = now()
      where id = e.id returning * into e;
    update public.encounter_combatants set legendary_used = 0 where id = first;
    perform private.combat_log(e, 'status', null, null, jsonb_build_object('status', 'active'), null, null, true);
    perform private.combat_tick(e, first, 'start');
  elsif new_status = 'ended' then
    update public.encounters set status = 'ended', active_combatant = null, ended_at = now(),
        summary = private.combat_summary(e.id), updated_at = now()
      where id = e.id returning * into e;
    update public.encounter_combatants set concentration = null where encounter_id = e.id;
    perform private.combat_log(e, 'status', null, null, jsonb_build_object('status', 'ended'), null, null, true);
  else
    update public.encounters set status = new_status, updated_at = now() where id = e.id returning * into e;
    perform private.combat_log(e, 'status', null, null, jsonb_build_object('status', new_status), null, null, true);
  end if;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Combatants (DM)
-- ---------------------------------------------------------------------------------------------

-- entries: [{kind:'character', character_id}
--          | {kind:'npc', name, count, max_hp, armor_class, initiative_bonus, side, hidden,
--             share_initiative, legendary_max, dm_notes, template_id}
--          | {kind:'lair', name}]
create function public.add_combatants(target_campaign uuid, target_encounter uuid, entries jsonb,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('combatants_add', target_campaign, target_encounter, entries);
  replay jsonb; e public.encounters; entry jsonb; t public.combatant_templates; ch public.characters;
  base_name text; total integer; existing integer; i integer; hp integer; ac integer; bonus integer;
  side_value text; legendary integer; notes text; hidden_value boolean; group_value text;
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
      select * into ch from public.characters c
        where c.campaign_id = target_campaign and c.id = (entry ->> 'character_id')::uuid;
      if ch.id is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
      insert into public.encounter_combatants(campaign_id, encounter_id, kind, character_id, side, name)
        values (target_campaign, e.id, 'character', ch.id, 'party', left(ch.name, 80))
        on conflict (encounter_id, character_id) do nothing
        returning * into added;
      if added.id is not null then
        added_count := added_count + 1;
        perform private.combat_log(e, 'join', added, null, '{}'::jsonb, null, null, true);
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
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload,
    private.combat_result(e.id) || jsonb_build_object('added', added_count));
end;
$$;

-- patch keys: name, max_hp, current_hp, temp_hp, armor_class, initiative_bonus, side, hidden,
-- hp_revealed, defeated, legendary_max, legendary_used, dm_notes. Character combatants accept only
-- hidden, defeated and dm_notes (their vitals belong to the sheet).
create function public.update_combatant(target_campaign uuid, target_combatant uuid, patch jsonb,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
        'hp_revealed', 'defeated', 'legendary_max', 'legendary_used', 'dm_notes')
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
  update public.encounter_combatants set name = next_c.name, max_hp = next_c.max_hp,
      current_hp = next_c.current_hp, temp_hp = next_c.temp_hp, armor_class = next_c.armor_class,
      initiative_bonus = next_c.initiative_bonus, side = next_c.side, hidden = next_c.hidden,
      hp_revealed = next_c.hp_revealed, defeated = next_c.defeated, legendary_max = next_c.legendary_max,
      legendary_used = next_c.legendary_used, dm_notes = next_c.dm_notes, revision = revision + 1
    where id = c.id returning * into next_c;
  if c.hidden and not next_c.hidden then
    perform private.combat_log(e, 'reveal', next_c, null, '{}'::jsonb, null, null, true);
  end if;
  if c.defeated <> next_c.defeated then
    perform private.combat_log(e, case when next_c.defeated then 'defeated' else 'revived' end, next_c, null,
      '{}'::jsonb, null, null, true);
  end if;
  -- A defeated or hidden active combatant keeps its slot; advance_turn continues from it.
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

create function public.remove_combatant(target_campaign uuid, target_combatant uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('combatant_remove', target_campaign, target_combatant);
  replay jsonb; e public.encounters; c public.encounter_combatants; turn_order uuid[]; pos integer;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  if e.status = 'ended' then raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  if e.active_combatant = c.id then
    turn_order := private.combat_order(e.id, true);
    pos := array_position(turn_order, c.id);
    update public.encounters set active_combatant = case
        when cardinality(turn_order) <= 1 then null
        when pos is null or pos >= cardinality(turn_order) then turn_order[1]
        else turn_order[pos + 1] end
      where id = e.id;
  end if;
  perform private.combat_log(e, 'leave', c, null, '{}'::jsonb, null, null, true);
  delete from public.encounter_combatants where id = c.id;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Initiative and turns
-- ---------------------------------------------------------------------------------------------

-- DM for anyone; a Player for its own character. Group members share the value.
create function public.set_initiative(target_campaign uuid, target_combatant uuid, initiative_total integer,
  tiebreak_bonus integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('initiative', target_campaign, target_combatant, initiative_total,
    tiebreak_bonus);
  replay jsonb; e public.encounters; c public.encounter_combatants;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  c := private.combat_combatant(e, c.id);
  perform private.combat_require_act(c);
  if e.status = 'ended' or (e.status = 'draft' and not private.is_campaign_dm(target_campaign)) then
    raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  if initiative_total is null or initiative_total not between -20 and 99
      or (tiebreak_bonus is not null and tiebreak_bonus not between -20 and 30) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  update public.encounter_combatants set initiative = initiative_total,
      initiative_bonus = coalesce(tiebreak_bonus, initiative_bonus), revision = revision + 1
    where encounter_id = e.id and (id = c.id or (c.group_key is not null and group_key = c.group_key));
  perform private.combat_log(e, 'initiative', c, initiative_total, '{}'::jsonb, null, null, true);
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- Server-side d20 + bonus for NPCs without initiative (one roll per shared group); lair acts on 20.
create function public.roll_npc_initiative(target_campaign uuid, target_encounter uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('initiative_roll', target_campaign, target_encounter);
  replay jsonb; e public.encounters; c public.encounter_combatants; roll integer; rolled integer := 0;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  e := private.combat_encounter(target_campaign, target_encounter);
  if e.status = 'ended' then raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  for c in select * from public.encounter_combatants
      where encounter_id = e.id and kind <> 'character' and initiative is null
      order by created_at, id for update loop
    -- A group member may already have been set in this loop.
    if exists (select 1 from public.encounter_combatants x where x.id = c.id and x.initiative is not null) then
      continue; end if;
    roll := case when c.kind = 'lair' then 20 else 1 + floor(random() * 20)::integer + c.initiative_bonus end;
    roll := greatest(-20, least(99, roll));
    update public.encounter_combatants set initiative = roll, revision = revision + 1
      where encounter_id = e.id and (id = c.id or (c.group_key is not null and group_key = c.group_key));
    perform private.combat_log(e, 'initiative', c, roll, jsonb_build_object('rolled', true), null, null, true);
    rolled := rolled + 1;
  end loop;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload,
    private.combat_result(e.id) || jsonb_build_object('rolled', rolled));
end;
$$;

-- The DM tie order: position in ordered_ids becomes order_key (only matters for equal totals).
create function public.set_turn_order(target_campaign uuid, target_encounter uuid, ordered_ids uuid[],
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('turn_order', target_campaign, target_encounter, to_jsonb(ordered_ids));
  replay jsonb; e public.encounters;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  e := private.combat_encounter(target_campaign, target_encounter);
  if ordered_ids is null or cardinality(ordered_ids) > 200 or exists (select 1 from unnest(ordered_ids) x(id)
      where not exists (select 1 from public.encounter_combatants c where c.encounter_id = e.id and c.id = x.id)) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  update public.encounter_combatants c set order_key = least(1000, o.n::integer - 1), revision = c.revision + 1
    from unnest(ordered_ids) with ordinality o(id, n)
    where c.encounter_id = e.id and c.id = o.id and c.kind <> 'lair';
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- Next (1) or previous (-1) turn. expected_active guards against double taps and two DMs.
-- Forward: end-of-turn effects of the current combatant tick, the round advances on wrap, the new
-- combatant's legendary actions reset and its start-of-turn effects tick. Backward only moves.
-- The DM moves either way; a Player may only end the turn of its own active character.
create function public.advance_turn(target_campaign uuid, target_encounter uuid, direction integer,
  expected_active uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('turn', target_campaign, target_encounter, direction, expected_active);
  replay jsonb; e public.encounters; all_ids uuid[]; turn_order uuid[]; pos integer; next_id uuid;
  old_round integer; new_round integer; current_c public.encounter_combatants; target public.encounter_combatants;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  e := private.combat_encounter(target_campaign, target_encounter);
  if e.status <> 'active' then raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  if direction is null or direction not in (1, -1) then raise exception 'Invalid request' using errcode = '22023'; end if;
  if not private.is_campaign_dm(target_campaign) then
    select * into current_c from public.encounter_combatants where id = e.active_combatant;
    if direction <> 1 or current_c.id is null or current_c.kind <> 'character'
        or not private.can_play_character(target_campaign, current_c.character_id) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
  end if;
  if e.active_combatant is distinct from expected_active then
    raise exception 'Stale turn' using errcode = 'P0001'; end if;
  if direction = 1 then perform private.combat_tick(e, e.active_combatant, 'end'); end if;
  all_ids := private.combat_order(e.id, false);
  turn_order := private.combat_order(e.id, true);
  if cardinality(turn_order) = 0 then raise exception 'No combatants' using errcode = 'P0001'; end if;
  -- The active combatant may have left the turn order (defeated, hidden): continue from its slot.
  pos := array_position(all_ids, e.active_combatant);
  old_round := e.round;
  new_round := e.round;
  if direction = 1 then
    select o.id into next_id from unnest(turn_order) o(id)
      where array_position(all_ids, o.id) > coalesce(pos, 0)
      order by array_position(all_ids, o.id) limit 1;
    if next_id is null then next_id := turn_order[1]; new_round := e.round + 1; end if;
  else
    select o.id into next_id from unnest(turn_order) o(id)
      where array_position(all_ids, o.id) < coalesce(pos, cardinality(all_ids) + 1)
      order by array_position(all_ids, o.id) desc limit 1;
    if next_id is null then
      if e.round <= 1 then raise exception 'First turn' using errcode = 'P0001'; end if;
      next_id := turn_order[cardinality(turn_order)]; new_round := e.round - 1;
    end if;
  end if;
  update public.encounters set active_combatant = next_id, round = least(9999, new_round), updated_at = now()
    where id = e.id returning * into e;
  select * into target from public.encounter_combatants where id = next_id;
  if direction = 1 then
    update public.encounter_combatants set legendary_used = 0 where id = next_id and legendary_used <> 0;
  end if;
  perform private.combat_log(e, case when new_round > old_round then 'round' else 'turn' end,
    target, null, jsonb_build_object('direction', direction), null, null, true);
  if direction = 1 then perform private.combat_tick(e, next_id, 'start'); end if;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- Jump to any combatant (no effect ticks); used to fix the turn after a mistake.
create function public.set_active_turn(target_campaign uuid, target_encounter uuid, target_combatant uuid,
  expected_active uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('turn_set', target_campaign, target_encounter, target_combatant,
    expected_active);
  replay jsonb; e public.encounters; c public.encounter_combatants;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  e := private.combat_encounter(target_campaign, target_encounter);
  if e.status <> 'active' then raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  if e.active_combatant is distinct from expected_active then
    raise exception 'Stale turn' using errcode = 'P0001'; end if;
  c := private.combat_combatant(e, target_combatant);
  if c.hidden or c.defeated then raise exception 'Invalid request' using errcode = '22023'; end if;
  update public.encounters set active_combatant = c.id, updated_at = now() where id = e.id returning * into e;
  perform private.combat_log(e, 'turn', c, null, jsonb_build_object('direction', 0), null, null, true);
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Hit points, conditions, concentration, death saves (DM or the character's Player)
-- ---------------------------------------------------------------------------------------------

-- hits: [{combatant_id, amount}] (1..30). Damage: temporary HP absorb first; a character that
-- drops to 0 falls unconscious and loses concentration; damage at 0 adds a death save failure
-- (three = dead/defeated); an NPC at 0 is defeated. Heal: up to max, resets death saves and wakes a
-- character at 0. Temp: keeps the higher value (temporary HP do not stack).
create function public.apply_combat_hp(target_campaign uuid, target_encounter uuid, hp_mode text, hits jsonb,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('hp', target_campaign, target_encounter, hp_mode, hits);
  replay jsonb; e public.encounters; hit jsonb; c public.encounter_combatants; v public.character_vitals;
  amount integer; max_hp integer; cur integer; tmp integer; absorbed integer; ds integer; df integer;
  conds text[]; defeated_now boolean; conc text; before jsonb; after jsonb; detail jsonb;
  results jsonb := '[]'::jsonb; seen uuid[] := array[]::uuid[]; target_id uuid;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  e := private.combat_encounter(target_campaign, target_encounter);
  perform private.combat_require_live(e);
  if hp_mode not in ('damage', 'heal', 'temp') or hits is null or jsonb_typeof(hits) <> 'array'
      or jsonb_array_length(hits) not between 1 and 30 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  for hit in select value from jsonb_array_elements(hits) loop
    if jsonb_typeof(hit) <> 'object'
        or coalesce(hit ->> 'combatant_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    target_id := (hit ->> 'combatant_id')::uuid;
    if target_id = any(seen) then raise exception 'Invalid request' using errcode = '22023'; end if;
    seen := seen || target_id;
    amount := private.combat_int(hit, 'amount', 0, 9999, null);
    if amount is null then raise exception 'Invalid request' using errcode = '22023'; end if;
    c := private.combat_combatant(e, target_id);
    perform private.combat_require_act(c);
    if c.kind = 'lair' then raise exception 'Invalid request' using errcode = '22023'; end if;
    before := private.combat_snapshot(c.id);
    defeated_now := c.defeated; conc := c.concentration;
    if c.kind = 'character' then
      select * into v from public.character_vitals where character_id = c.character_id for update;
      select s.max_hp into max_hp from public.character_sheets s where s.character_id = c.character_id;
      cur := v.current_hp; tmp := v.temp_hp; ds := v.death_successes; df := v.death_failures; conds := v.conditions;
    else
      max_hp := c.max_hp; cur := c.current_hp; tmp := c.temp_hp; ds := 0; df := 0; conds := c.conditions;
    end if;
    detail := '{}'::jsonb;
    if hp_mode = 'damage' then
      if conc is not null and amount > 0 then
        detail := detail || jsonb_build_object('concentration_dc', least(30, greatest(10, amount / 2)),
          'concentration', conc);
      end if;
      absorbed := least(tmp, amount);
      tmp := tmp - absorbed;
      if cur = 0 and amount > 0 and c.kind = 'character' then
        df := least(3, df + 1);
        if df >= 3 then defeated_now := true; detail := detail || jsonb_build_object('result', 'dead'); end if;
      end if;
      if cur > 0 and amount - absorbed >= cur then
        if c.kind = 'character' then
          if not ('unconscious' = any(conds)) then conds := conds || 'unconscious'::text; end if;
          detail := detail || jsonb_build_object('result', 'down');
        else
          defeated_now := true; detail := detail || jsonb_build_object('result', 'defeated');
        end if;
        if conc is not null then conc := null; detail := detail || jsonb_build_object('concentration_lost', true); end if;
      end if;
      cur := greatest(0, cur - (amount - absorbed));
    elsif hp_mode = 'heal' then
      if cur = 0 and amount > 0 then
        conds := array_remove(conds, 'unconscious');
        if c.kind <> 'character' or df < 3 then defeated_now := false; end if;
        detail := detail || jsonb_build_object('result', 'up');
      end if;
      cur := least(max_hp, cur + amount);
      if amount > 0 then ds := 0; df := 0; end if;
    else
      tmp := greatest(tmp, amount);
    end if;
    if c.kind = 'character' then
      update public.character_vitals set current_hp = cur, temp_hp = tmp, death_successes = ds,
          death_failures = df, conditions = conds, revision = revision + 1
        where character_id = c.character_id;
    else
      update public.encounter_combatants set current_hp = cur, temp_hp = tmp, conditions = conds
        where id = c.id;
    end if;
    update public.encounter_combatants set defeated = defeated_now, concentration = conc, revision = revision + 1
      where id = c.id;
    after := private.combat_snapshot(c.id);
    perform private.combat_log(e, hp_mode, c, amount, detail, before, after, true);
    if defeated_now and not c.defeated then
      perform private.combat_log(e, 'defeated', c, null, '{}'::jsonb, null, null, true);
    elsif c.defeated and not defeated_now then
      perform private.combat_log(e, 'revived', c, null, '{}'::jsonb, null, null, true);
    end if;
    results := results || (jsonb_build_object('combatant_id', c.id, 'name', c.name) || detail);
  end loop;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload,
    private.combat_result(e.id) || jsonb_build_object('hits', results));
end;
$$;

create function public.set_combat_condition(target_campaign uuid, target_combatant uuid, condition_key text,
  enabled boolean, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('condition', target_campaign, target_combatant, condition_key, enabled);
  replay jsonb; e public.encounters; c public.encounter_combatants; before jsonb;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  perform private.combat_require_live(e);
  c := private.combat_combatant(e, c.id);
  perform private.combat_require_act(c);
  if enabled is null or condition_key is null or not (condition_key = any (array[
      'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible',
      'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'])) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  before := private.combat_snapshot(c.id);
  if private.combat_condition(c, condition_key, enabled) then
    update public.encounter_combatants set revision = revision + 1 where id = c.id;
    perform private.combat_log(e, case when enabled then 'condition_on' else 'condition_off' end, c, null,
      jsonb_build_object('condition', condition_key), before, private.combat_snapshot(c.id), true);
  end if;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- spell null ends concentration.
create function public.set_concentration(target_campaign uuid, target_combatant uuid, spell text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('concentration', target_campaign, target_combatant, spell);
  replay jsonb; e public.encounters; c public.encounter_combatants; before jsonb; value text;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  perform private.combat_require_live(e);
  c := private.combat_combatant(e, c.id);
  perform private.combat_require_act(c);
  value := nullif(btrim(coalesce(spell, '')), '');
  if char_length(value) > 80 then raise exception 'Invalid request' using errcode = '22023'; end if;
  before := private.combat_snapshot(c.id);
  update public.encounter_combatants set concentration = value, revision = revision + 1 where id = c.id;
  perform private.combat_log(e, 'concentration', c, null, jsonb_build_object('spell', value), before,
    private.combat_snapshot(c.id), true);
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- outcome: success | failure | nat1 (two failures) | nat20 (regain 1 HP). Characters at 0 HP only.
create function public.record_death_save(target_campaign uuid, target_combatant uuid, outcome text,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('death_save', target_campaign, target_combatant, outcome);
  replay jsonb; e public.encounters; c public.encounter_combatants; v public.character_vitals;
  before jsonb; result text := null;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  perform private.combat_require_live(e);
  c := private.combat_combatant(e, c.id);
  perform private.combat_require_act(c);
  if c.kind <> 'character' or outcome not in ('success', 'failure', 'nat1', 'nat20') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into v from public.character_vitals where character_id = c.character_id for update;
  if v.current_hp <> 0 or c.defeated then raise exception 'Not dying' using errcode = 'P0001'; end if;
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
$$;

-- ---------------------------------------------------------------------------------------------
-- Timed effects
-- ---------------------------------------------------------------------------------------------

-- effect: {target_combatant, source_combatant?, label, condition?, rounds?, ticks_on?, visible?}.
-- DM for anyone; a Player only on its own character (source must be visible to it).
create function public.add_combat_effect(target_campaign uuid, target_encounter uuid, effect jsonb,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('effect_add', target_campaign, target_encounter, effect);
  replay jsonb; e public.encounters; c public.encounter_combatants; src public.encounter_combatants;
  fx public.encounter_effects; cond text; label_value text; rounds integer; phase text;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  e := private.combat_encounter(target_campaign, target_encounter);
  perform private.combat_require_live(e);
  if effect is null or jsonb_typeof(effect) <> 'object'
      or coalesce(effect ->> 'target_combatant', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (effect ? 'source_combatant' and jsonb_typeof(effect -> 'source_combatant') <> 'null'
        and coalesce(effect ->> 'source_combatant', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  c := private.combat_combatant(e, (effect ->> 'target_combatant')::uuid);
  perform private.combat_require_act(c);
  if c.kind = 'lair' then raise exception 'Invalid request' using errcode = '22023'; end if;
  if effect ->> 'source_combatant' is not null then
    src := private.combat_combatant(e, (effect ->> 'source_combatant')::uuid);
  end if;
  cond := private.combat_text(effect, 'condition', 20, null);
  if cond is not null and not (cond = any (array[
      'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible',
      'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'])) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  label_value := private.combat_text(effect, 'label', 60, null);
  if label_value is null or label_value = '' then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  rounds := private.combat_int(effect, 'rounds', 1, 100, null);
  phase := coalesce(private.combat_text(effect, 'ticks_on', 5, null), 'end');
  if phase not in ('start', 'end') then raise exception 'Invalid request' using errcode = '22023'; end if;
  insert into public.encounter_effects(campaign_id, encounter_id, target_combatant, source_combatant, label,
      condition, remaining_rounds, ticks_on, visible, created_by)
    values (target_campaign, e.id, c.id, src.id, label_value, cond, rounds, phase,
      private.is_campaign_dm(target_campaign) is false or private.combat_bool(effect, 'visible', true), auth.uid())
    returning * into fx;
  if cond is not null then perform private.combat_condition(c, cond, true); end if;
  perform private.combat_log(e, 'effect_on', c, fx.remaining_rounds,
    jsonb_build_object('label', fx.label, 'condition', cond), null, null, fx.visible);
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload,
    private.combat_result(e.id) || jsonb_build_object('effect_id', fx.id));
end;
$$;

create function public.remove_combat_effect(target_campaign uuid, target_effect uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('effect_remove', target_campaign, target_effect);
  replay jsonb; e public.encounters; c public.encounter_combatants; fx public.encounter_effects;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into fx from public.encounter_effects where campaign_id = target_campaign and id = target_effect;
  if fx.id is null then raise exception 'Effect unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, fx.encounter_id);
  perform private.combat_require_live(e);
  c := private.combat_combatant(e, fx.target_combatant);
  perform private.combat_require_act(c);
  if not fx.visible and not private.is_campaign_dm(target_campaign) then
    raise exception 'Effect unavailable' using errcode = '42501'; end if;
  select * into fx from public.encounter_effects where id = fx.id for update;
  perform private.combat_drop_effect(e, fx, 'effect_off');
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Undo (compensating; refuses when the target changed since the event)
-- ---------------------------------------------------------------------------------------------

create function public.undo_combat_event(target_campaign uuid, target_event uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('undo', target_campaign, target_event);
  replay jsonb; e public.encounters; c public.encounter_combatants; ev public.encounter_events;
  undo_id uuid; current_state jsonb;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into ev from public.encounter_events where campaign_id = target_campaign and id = target_event;
  if ev.id is null then raise exception 'Event unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, ev.encounter_id);
  perform private.combat_require_live(e);
  select * into ev from public.encounter_events where id = ev.id for update;
  if ev.before_state is null or ev.after_state is null or ev.target_combatant is null then
    raise exception 'Not undoable' using errcode = 'P0001'; end if;
  if ev.undone_by is not null then raise exception 'Already undone' using errcode = 'P0001'; end if;
  c := private.combat_combatant(e, ev.target_combatant);
  perform private.combat_require_act(c);
  -- Players undo only their own events.
  if not private.is_campaign_dm(target_campaign) and ev.actor_id is distinct from auth.uid() then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  current_state := private.combat_snapshot(c.id);
  if current_state <> ev.after_state then raise exception 'Undo conflict' using errcode = 'P0001'; end if;
  perform private.combat_restore(c.id, ev.before_state);
  undo_id := private.combat_log(e, 'undo', c, ev.amount, jsonb_build_object('undo_of', ev.id, 'undo_kind', ev.kind)
      || (ev.detail - 'concentration_dc'), ev.after_state, ev.before_state, ev.visible);
  update public.encounter_events set undone_by = undo_id where id = ev.id;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Bestiary (DM)
-- ---------------------------------------------------------------------------------------------

-- data: {name, side, max_hp, armor_class, initiative_bonus, legendary_max, notes}
create function public.save_combatant_template(target_campaign uuid, target_template uuid,
  expected_revision bigint, data jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('template_save', target_campaign, target_template, expected_revision, data);
  replay jsonb; t public.combatant_templates; name_value text; side_value text;
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
  if target_template is null then
    insert into public.combatant_templates(campaign_id, name, side, max_hp, armor_class, initiative_bonus,
        legendary_max, notes)
      values (target_campaign, name_value, side_value, private.combat_int(data, 'max_hp', 1, 99999, null),
        private.combat_int(data, 'armor_class', 0, 99, 10), private.combat_int(data, 'initiative_bonus', -20, 30, 0),
        private.combat_int(data, 'legendary_max', 0, 9, 0), coalesce(private.combat_text(data, 'notes', 2000, ''), ''))
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
        revision = revision + 1, updated_at = now()
      where id = t.id returning * into t;
  end if;
  return private.combat_finish(request_id, payload, jsonb_build_object('id', t.id, 'revision', t.revision));
end;
$$;

create function public.delete_combatant_template(target_campaign uuid, target_template uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare deleted integer;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  perform private.combat_require_dm(target_campaign);
  delete from public.combatant_templates where campaign_id = target_campaign and id = target_template;
  get diagnostics deleted = row_count;
  return jsonb_build_object('deleted', deleted > 0);
end;
$$;

create function public.list_combatant_templates(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.combat_require_dm(target_campaign);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'side', t.side,
      'max_hp', t.max_hp, 'armor_class', t.armor_class, 'initiative_bonus', t.initiative_bonus,
      'legendary_max', t.legendary_max, 'notes', t.notes, 'revision', t.revision)
      order by lower(t.name), t.id), '[]'::jsonb)
    from public.combatant_templates t where t.campaign_id = target_campaign);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------------------------

create function public.list_encounters(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid := auth.uid(); dm boolean;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'status', e.status,
      'round', e.round, 'updated_at', e.updated_at, 'started_at', e.started_at, 'ended_at', e.ended_at,
      'combatants', (select count(*) from public.encounter_combatants c
        where c.encounter_id = e.id and (dm or not c.hidden)),
      'needs_initiative', e.status in ('initiative', 'active') and exists (
        select 1 from public.encounter_combatants c join public.characters ch on ch.id = c.character_id
        where c.encounter_id = e.id and c.initiative is null and ch.user_id = viewer))
      order by case e.status when 'active' then 0 when 'initiative' then 1 when 'draft' then 2 else 3 end,
        e.updated_at desc), '[]'::jsonb)
    from public.encounters e
    where e.campaign_id = target_campaign and (dm or e.status <> 'draft'));
end;
$$;

-- Role projection. DM: everything. Player: own character in full; teammates with shares_live;
-- NPC hit points only as a descriptive status unless revealed; no hidden combatants, NPC armor
-- class, DM notes or private events. Table (as_table): the Player projection without own data.
-- target_encounter null selects the live encounter (or the most recently ended one).
create function public.get_combat_state(target_campaign uuid, target_encounter uuid, as_table boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
          'is_active', c.id = e.active_combatant,
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
          (x.kind = 'character' and ch.user_id = viewer and not coalesce(as_table, false)) own,
          (x.kind = 'character' and ch.user_id is not null and ch.shares_live) shared,
          case when x.kind = 'character' then v.current_hp else x.current_hp end hp_cur,
          case when x.kind = 'character' then s.max_hp else x.max_hp end hp_max,
          case when x.kind = 'character' then v.temp_hp else x.temp_hp end hp_tmp,
          case when x.kind = 'character' then s.armor_class else x.armor_class end ac,
          case when x.kind = 'character' then v.conditions else x.conditions end conds,
          v.death_successes ds, v.death_failures df, r.exhaustion::integer exh
        from public.encounter_combatants x
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
        'can_remove', full_view or (not coalesce(as_table, false) and ch.user_id = viewer))
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
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke all on function private.combat_begin(uuid, uuid, jsonb), private.combat_finish(uuid, jsonb, jsonb),
  private.combat_require_dm(uuid), private.combat_encounter(uuid, uuid),
  private.combat_require_live(public.encounters), private.combat_combatant(public.encounters, uuid),
  private.combat_can_act(public.encounter_combatants), private.combat_require_act(public.encounter_combatants),
  private.combat_bump(uuid), private.combat_result(uuid),
  private.combat_log(public.encounters, text, public.encounter_combatants, integer, jsonb, jsonb, jsonb, boolean),
  private.combat_snapshot(uuid), private.combat_restore(uuid, jsonb),
  private.combat_condition(public.encounter_combatants, text, boolean), private.combat_order(uuid, boolean),
  private.combat_drop_effect(public.encounters, public.encounter_effects, text),
  private.combat_tick(public.encounters, uuid, text), private.combat_int(jsonb, text, integer, integer, integer),
  private.combat_text(jsonb, text, integer, text), private.combat_bool(jsonb, text, boolean),
  private.combat_summary(uuid)
  from public, anon, authenticated;
revoke all on function public.create_encounter(uuid, text, uuid),
  public.rename_encounter(uuid, uuid, text, uuid), public.delete_encounter(uuid, uuid),
  public.set_encounter_status(uuid, uuid, text, uuid), public.add_combatants(uuid, uuid, jsonb, uuid),
  public.update_combatant(uuid, uuid, jsonb, uuid), public.remove_combatant(uuid, uuid, uuid),
  public.set_initiative(uuid, uuid, integer, integer, uuid), public.roll_npc_initiative(uuid, uuid, uuid),
  public.set_turn_order(uuid, uuid, uuid[], uuid), public.advance_turn(uuid, uuid, integer, uuid, uuid),
  public.set_active_turn(uuid, uuid, uuid, uuid, uuid), public.apply_combat_hp(uuid, uuid, text, jsonb, uuid),
  public.set_combat_condition(uuid, uuid, text, boolean, uuid), public.set_concentration(uuid, uuid, text, uuid),
  public.record_death_save(uuid, uuid, text, uuid), public.add_combat_effect(uuid, uuid, jsonb, uuid),
  public.remove_combat_effect(uuid, uuid, uuid), public.undo_combat_event(uuid, uuid, uuid),
  public.save_combatant_template(uuid, uuid, bigint, jsonb, uuid), public.delete_combatant_template(uuid, uuid),
  public.list_combatant_templates(uuid), public.list_encounters(uuid), public.get_combat_state(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.create_encounter(uuid, text, uuid),
  public.rename_encounter(uuid, uuid, text, uuid), public.delete_encounter(uuid, uuid),
  public.set_encounter_status(uuid, uuid, text, uuid), public.add_combatants(uuid, uuid, jsonb, uuid),
  public.update_combatant(uuid, uuid, jsonb, uuid), public.remove_combatant(uuid, uuid, uuid),
  public.set_initiative(uuid, uuid, integer, integer, uuid), public.roll_npc_initiative(uuid, uuid, uuid),
  public.set_turn_order(uuid, uuid, uuid[], uuid), public.advance_turn(uuid, uuid, integer, uuid, uuid),
  public.set_active_turn(uuid, uuid, uuid, uuid, uuid), public.apply_combat_hp(uuid, uuid, text, jsonb, uuid),
  public.set_combat_condition(uuid, uuid, text, boolean, uuid), public.set_concentration(uuid, uuid, text, uuid),
  public.record_death_save(uuid, uuid, text, uuid), public.add_combat_effect(uuid, uuid, jsonb, uuid),
  public.remove_combat_effect(uuid, uuid, uuid), public.undo_combat_event(uuid, uuid, uuid),
  public.save_combatant_template(uuid, uuid, bigint, jsonb, uuid), public.delete_combatant_template(uuid, uuid),
  public.list_combatant_templates(uuid), public.list_encounters(uuid), public.get_combat_state(uuid, uuid, boolean)
  to authenticated;

-- Realtime: members subscribe to postgres_changes on encounters; RLS filters each event.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.encounters;
  end if;
end;
$$;

-- PRE mirror of the functions (only when PRE exists and predates this migration).
do $$
declare fn text;
begin
  if to_regclass('pre.encounters') is null or to_regprocedure('pre_admin.remap(text)') is null
      or to_regprocedure('pre.get_combat_state(uuid,uuid,boolean)') is not null then
    return;
  end if;
  -- Row-typed helper parameters print schema-qualified only with an empty search path, which
  -- lets pre_admin.remap point them at the PRE tables (the ETL runs the same way).
  perform set_config('search_path', '', true);
  foreach fn in array array['private.combat_begin(uuid,uuid,jsonb)', 'private.combat_finish(uuid,jsonb,jsonb)',
      'private.combat_require_dm(uuid)', 'private.combat_encounter(uuid,uuid)',
      'private.combat_require_live(public.encounters)', 'private.combat_combatant(public.encounters,uuid)',
      'private.combat_can_act(public.encounter_combatants)', 'private.combat_require_act(public.encounter_combatants)',
      'private.combat_bump(uuid)', 'private.combat_result(uuid)',
      'private.combat_log(public.encounters,text,public.encounter_combatants,integer,jsonb,jsonb,jsonb,boolean)',
      'private.combat_snapshot(uuid)', 'private.combat_restore(uuid,jsonb)',
      'private.combat_condition(public.encounter_combatants,text,boolean)', 'private.combat_order(uuid,boolean)',
      'private.combat_drop_effect(public.encounters,public.encounter_effects,text)',
      'private.combat_tick(public.encounters,uuid,text)', 'private.combat_int(jsonb,text,integer,integer,integer)',
      'private.combat_text(jsonb,text,integer,text)', 'private.combat_bool(jsonb,text,boolean)',
      'private.combat_summary(uuid)'] loop
    execute pre_admin.remap(pg_get_functiondef(fn::regprocedure));
    execute format('revoke all on function %s from public, anon, authenticated', pre_admin.remap(fn));
  end loop;
  foreach fn in array array['public.create_encounter(uuid,text,uuid)',
      'public.rename_encounter(uuid,uuid,text,uuid)', 'public.delete_encounter(uuid,uuid)',
      'public.set_encounter_status(uuid,uuid,text,uuid)', 'public.add_combatants(uuid,uuid,jsonb,uuid)',
      'public.update_combatant(uuid,uuid,jsonb,uuid)', 'public.remove_combatant(uuid,uuid,uuid)',
      'public.set_initiative(uuid,uuid,integer,integer,uuid)', 'public.roll_npc_initiative(uuid,uuid,uuid)',
      'public.set_turn_order(uuid,uuid,uuid[],uuid)', 'public.advance_turn(uuid,uuid,integer,uuid,uuid)',
      'public.set_active_turn(uuid,uuid,uuid,uuid,uuid)', 'public.apply_combat_hp(uuid,uuid,text,jsonb,uuid)',
      'public.set_combat_condition(uuid,uuid,text,boolean,uuid)', 'public.set_concentration(uuid,uuid,text,uuid)',
      'public.record_death_save(uuid,uuid,text,uuid)', 'public.add_combat_effect(uuid,uuid,jsonb,uuid)',
      'public.remove_combat_effect(uuid,uuid,uuid)', 'public.undo_combat_event(uuid,uuid,uuid)',
      'public.save_combatant_template(uuid,uuid,bigint,jsonb,uuid)', 'public.delete_combatant_template(uuid,uuid)',
      'public.list_combatant_templates(uuid)', 'public.list_encounters(uuid)',
      'public.get_combat_state(uuid,uuid,boolean)'] loop
    execute pre_admin.remap(pg_get_functiondef(fn::regprocedure));
    execute format('revoke all on function %s from public, anon', pre_admin.remap(fn));
    execute format('grant execute on function %s to authenticated', pre_admin.remap(fn));
  end loop;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table pre.encounters;
  end if;
end;
$$;
