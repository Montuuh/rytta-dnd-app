-- RYT-079 and RYT-080: characters who do not come to a session, the DM choosing a Player's active
-- character, and the group rest with a vote (ADR 037).
--
-- Absence. characters.absent is set by the DM only (set_character_absent). An absent character is
-- never active (is_active = false), so every campaign list that keeps to active characters (Party,
-- party overview, trades, shops, encounter pickers, combat state) leaves it out; it stays in the
-- Player's own roster and in the DM's roster listing. Marking absent is refused while the
-- character is in an open trade or a live encounter (private.character_busy). Marking present
-- makes the character active again when its Player (or, unassigned, the DM) has no active one.
-- A Player whose roster has an absent character and no active one is "benched": they cannot
-- activate another character (set_active_character raises 'Character absent') and a character
-- they create, restore or accept joins the roster in reserve. An absent character cannot be
-- archived (mark it present first). Read-only for the Player: a guard trigger refuses writes by
-- anyone but the DM to an absent character's row, sheet, play state, resources, inventory and shop
-- orders, and nobody can add an absent character to an encounter.
--
-- Active character. set_active_character keeps its signature; the active DM of the campaign may now
-- choose any present, non-archived character of a Player (user decision 2026-11-10). The busy
-- guard on the outgoing active character still applies.
--
-- Group rest. One open request per campaign (rest_requests, readable by members for realtime; the
-- votes live in private.rest_votes). request_rest: any Player whose active character is present
-- and not in a live encounter, or the DM at any time. Voters are the campaign's active characters
-- with at least 1 HP (SRD 5.2.1: a rest needs 1 HP); each Player votes for their own character and
-- the DM for unassigned ones. A short-rest "yes" carries the hit point dice spent and their rolled
-- total; Rytta adds the Constitution modifier per die (minimum 1 HP per die). Unanimity: one "no"
-- rejects the request; when every voter says yes the rest applies to all of them in the same
-- transaction. The DM may apply it at once (resolve_rest_now) or cancel; the requester may cancel.
-- A request expires 10 minutes after it was made. Rests apply the 2024 rules already used by the
-- sheet (domain/rules.ts applyRest): long = all HP, temporary HP to 0, all hit dice, all slots and
-- short/long resources; short = short resources, Pact Magic slots and the dice healing.
--
-- Actor matrix: anon executes nothing; outsiders, inactive members and DMs of other campaigns raise
-- Forbidden; a Player votes only for their own active character; set_character_absent and
-- resolve_rest_now are DM only; cancel_rest is the DM or the requester. get_rest_state hides the
-- recovery numbers of a teammate who does not share their live sheet (RYT-031).
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) exists and
-- predates it, the same DDL runs remapped with pre_admin.remap.

do $rest$
declare ddl text := $ddl$
-- ---------------------------------------------------------------------------------------------
-- Absence and the roster invariants
-- ---------------------------------------------------------------------------------------------
alter table public.characters add column absent boolean not null default false;
comment on column public.characters.absent is
  'RYT-079: the DM marked the character as not coming to the session; never active while set. RPC writes only.';

alter table public.characters drop constraint characters_unassigned_active;
alter table public.characters add constraint characters_unassigned_active
  check (user_id is not null or is_active or archived_at is not null or absent);
alter table public.characters add constraint characters_absent_inactive check (not absent or not is_active);

-- A Player with characters keeps exactly one active one, unless the DM benched them (an absent
-- character and none active).
create or replace function private.check_character_roster() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare pair record; total integer; active_count integer; absent_count integer;
begin
  for pair in
    select distinct x.campaign_id, x.user_id from (values
      (case when tg_op <> 'INSERT' then old.campaign_id end, case when tg_op <> 'INSERT' then old.user_id end),
      (case when tg_op <> 'DELETE' then new.campaign_id end, case when tg_op <> 'DELETE' then new.user_id end)
    ) x(campaign_id, user_id) where x.user_id is not null
  loop
    select count(*) filter (where c.archived_at is null), count(*) filter (where c.is_active),
        count(*) filter (where c.absent and c.archived_at is null)
      into total, active_count, absent_count
      from public.characters c where c.campaign_id = pair.campaign_id and c.user_id = pair.user_id;
    if total > 4 then raise exception 'Character limit' using errcode = 'P0001'; end if;
    if total > 0 and active_count <> 1 and not (active_count = 0 and absent_count > 0) then
      raise exception 'Active character required' using errcode = 'P0001'; end if;
  end loop;
  return null;
end;
$fn$;
drop trigger characters_roster on public.characters;
create constraint trigger characters_roster
  after insert or delete or update of user_id, is_active, archived_at, absent on public.characters
  deferrable initially deferred for each row execute function private.check_character_roster();

create function private.player_benched(target_campaign uuid, target_user uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select target_user is not null
    and not exists (select 1 from public.characters c where c.campaign_id = target_campaign
      and c.user_id = target_user and c.is_active)
    and exists (select 1 from public.characters c where c.campaign_id = target_campaign
      and c.user_id = target_user and c.absent and c.archived_at is null);
$fn$;
revoke all on function private.player_benched(uuid, uuid) from public, anon, authenticated;

-- Row rules for absence. System writes (no auth.uid()) and the campaign DM pass; anyone else cannot
-- change an absent character. An absent character is never active and cannot be archived; a
-- benched Player's new, restored or accepted character joins the roster in reserve.
create function private.characters_absence_rules() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare dm boolean := auth.uid() is null or private.is_campaign_dm(new.campaign_id);
begin
  if tg_op = 'UPDATE' and old.absent then
    if not dm then raise exception 'Character absent' using errcode = 'P0001'; end if;
    if new.archived_at is not null and old.archived_at is null then
      raise exception 'Character absent' using errcode = 'P0001'; end if;
  end if;
  if new.absent then
    new.is_active := false;
  elsif not dm and new.user_id is not null and new.is_active
      and (tg_op = 'INSERT' or not old.is_active or new.user_id is distinct from old.user_id)
      and private.player_benched(new.campaign_id, new.user_id) then
    new.is_active := false;
  end if;
  return new;
end;
$fn$;
revoke all on function private.characters_absence_rules() from public, anon, authenticated;
create trigger characters_absence before insert or update on public.characters
  for each row execute function private.characters_absence_rules();

-- Character-scoped rows: TG_ARGV[0] = 'players' lets the DM write; 'all' refuses everyone.
create function private.guard_absent_character() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare target uuid; campaign uuid;
begin
  if tg_op = 'DELETE' then target := old.character_id; campaign := old.campaign_id;
  else target := new.character_id; campaign := new.campaign_id; end if;
  if target is not null and auth.uid() is not null
      and exists (select 1 from public.characters c where c.id = target and c.absent)
      and (tg_argv[0] = 'all' or not private.is_campaign_dm(campaign)) then
    raise exception 'Character absent' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$fn$;
revoke all on function private.guard_absent_character() from public, anon, authenticated;
create trigger sheets_absent before insert or update or delete on public.character_sheets
  for each row execute function private.guard_absent_character('players');
create trigger vitals_absent before insert or update or delete on public.character_vitals
  for each row execute function private.guard_absent_character('players');
create trigger resources_absent before insert or update or delete on public.character_resources
  for each row execute function private.guard_absent_character('players');
create trigger inventory_absent before insert or update or delete on public.inventory_items
  for each row execute function private.guard_absent_character('players');
create trigger orders_absent before insert or update on public.shop_orders
  for each row execute function private.guard_absent_character('players');
create trigger combatants_absent before insert on public.encounter_combatants
  for each row execute function private.guard_absent_character('all');

-- The DM marks a character absent or present.
create function public.set_character_absent(target_campaign uuid, target_character uuid, make_absent boolean)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare target public.characters; busy text;
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if make_absent is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into target from public.characters c
    where c.campaign_id = target_campaign and c.id = target_character and c.archived_at is null for update;
  if target.id is null then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
  if target.absent is distinct from make_absent then
    if make_absent then
      busy := private.character_busy(target_campaign, target.id);
      if busy is not null then raise exception '%', busy using errcode = 'P0001'; end if;
      update public.characters set absent = true, is_active = false where id = target.id;
    else
      update public.characters set absent = false, is_active = target.user_id is null or not exists (
          select 1 from public.characters c where c.campaign_id = target_campaign
            and c.user_id = target.user_id and c.is_active)
        where id = target.id;
    end if;
  end if;
  select * into target from public.characters where id = target_character;
  return jsonb_build_object('id', target.id, 'absent', target.absent, 'is_active', target.is_active);
end;
$fn$;

-- The owner switches the active character; the campaign DM may choose any present character of a
-- Player. Repeating the call is a no-op.
create or replace function public.set_active_character(target_campaign uuid, target_character uuid)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; target public.characters; current_active uuid; busy text;
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  select * into target from public.characters c
    where c.campaign_id = target_campaign and c.id = target_character and c.archived_at is null
      and (c.user_id = viewer or (dm and c.user_id is not null))
    for update;
  if target.id is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
  if target.absent then raise exception 'Character absent' using errcode = 'P0001'; end if;
  if target.is_active then return target.id; end if;
  if not dm and private.player_benched(target_campaign, target.user_id) then
    raise exception 'Character absent' using errcode = 'P0001'; end if;
  select c.id into current_active from public.characters c
    where c.campaign_id = target_campaign and c.user_id = target.user_id and c.is_active for update;
  if current_active is not null then
    busy := private.character_busy(target_campaign, current_active);
    if busy is not null then raise exception '%', busy using errcode = 'P0001'; end if;
    update public.characters set is_active = false where id = current_active;
  end if;
  update public.characters set is_active = true where id = target.id;
  return target.id;
end;
$fn$;

-- The history names absence changes too.
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

-- ---------------------------------------------------------------------------------------------
-- Group rest
-- ---------------------------------------------------------------------------------------------
create table public.rest_requests (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind text not null check (kind in ('short', 'long')),
  status text not null default 'open' check (status in ('open', 'done', 'rejected', 'cancelled', 'expired')),
  requested_by uuid not null,
  requester_character uuid references public.characters(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  resolved_by uuid,
  outcome jsonb,
  revision bigint not null default 0
);
comment on table public.rest_requests is
  'RYT-080: group rest requests; read by members for realtime, written only by the rest RPCs.';
create unique index rest_requests_one_open on public.rest_requests(campaign_id) where status = 'open';
create index rest_requests_recent on public.rest_requests(campaign_id, created_at desc);
alter table public.rest_requests enable row level security;
revoke all on public.rest_requests from public, anon, authenticated;
grant select on public.rest_requests to authenticated;
create policy rest_requests_read on public.rest_requests for select to authenticated
  using (private.is_campaign_member(campaign_id));

create table private.rest_votes (
  request_id uuid not null references public.rest_requests(id) on delete cascade,
  campaign_id uuid not null,
  character_id uuid not null references public.characters(id) on delete cascade,
  vote text not null check (vote in ('yes', 'no')),
  dice_spent integer not null default 0 check (dice_spent between 0 and 20),
  dice_roll integer check (dice_roll between 0 and 240),
  voted_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (request_id, character_id)
);
revoke all on private.rest_votes from public, anon, authenticated;
alter table private.rest_votes enable row level security;

-- A whole number stored in the sheet build, or the fallback when it is missing or not a number.
create function private.rest_int(value jsonb, fallback integer) returns integer
language sql immutable set search_path = '' as $fn$
  select case when jsonb_typeof(value) = 'number'
    then least(greatest(trunc((value #>> '{}')::numeric), -100000), 100000)::integer else fallback end;
$fn$;
revoke all on function private.rest_int(jsonb, integer) from public, anon, authenticated;

-- What a rest would do to one character: the preview shown in the panel and, under 'vitals', the
-- play state it writes. Mirrors domain/rules.ts applyRest plus the short-rest dice healing.
create function private.rest_effect(target_campaign uuid, target_character uuid, rest_kind text,
  spent integer, roll integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare s public.character_sheets; v public.character_vitals; b jsonb; trackers jsonb; con integer;
  die integer; resets_short boolean := rest_kind = 'short'; can_rest boolean; hp_after integer;
  temp_after integer; dice_after integer; gain integer := 0; uses_after jsonb; slots_after integer[];
  slots_back jsonb; tracker_list jsonb;
begin
  select * into s from public.character_sheets where campaign_id = target_campaign and character_id = target_character;
  select * into v from public.character_vitals where campaign_id = target_campaign and character_id = target_character;
  if v.character_id is null or s.character_id is null then return null; end if;
  b := case when jsonb_typeof(s.build) = 'object' then s.build else '{}'::jsonb end;
  trackers := case when jsonb_typeof(b -> 'trackers') = 'array' then b -> 'trackers' else '[]'::jsonb end;
  con := floor((least(30, private.rest_int(b -> 'baseAbilities' -> 'con', 10)
    + private.rest_int(b -> 'bonuses' -> 'con', 0)) - 10) / 2.0)::integer;
  die := private.rest_int(b -> 'hitDie', 0);
  if die not in (6, 8, 10, 12) then die := 0; end if;
  can_rest := v.current_hp > 0;
  spent := case when rest_kind = 'short' and can_rest then greatest(0, coalesce(spent, 0)) else 0 end;
  if rest_kind = 'long' then
    hp_after := case when can_rest then s.max_hp else v.current_hp end;
    temp_after := case when can_rest then 0 else v.temp_hp end;
    dice_after := case when can_rest then 0 else v.hit_dice_spent end;
  else
    if spent > 0 then gain := greatest(spent, coalesce(roll, 0) + con * spent); end if;
    hp_after := least(s.max_hp, v.current_hp + gain);
    temp_after := v.temp_hp;
    dice_after := least(s.level, v.hit_dice_spent + spent);
  end if;
  select coalesce(jsonb_object_agg(u.key, u.value), '{}'::jsonb) into uses_after
    from jsonb_each(coalesce(v.tracker_uses, '{}'::jsonb)) u
    where not can_rest or exists (select 1 from jsonb_array_elements(trackers) t where t ->> 'id' = u.key
      and not (t ->> 'reset' = 'short' or (rest_kind = 'long' and t ->> 'reset' = 'long')));
  select coalesce(jsonb_agg(jsonb_build_object('id', left(t ->> 'id', 40), 'key', left(t ->> 'key', 60),
      'name', left(t ->> 'name', 60), 'max', n.mx, 'before', greatest(0, n.mx - n.used), 'after', n.mx)
      order by x.ord), '[]'::jsonb) into tracker_list
    from jsonb_array_elements(trackers) with ordinality x(t, ord)
    cross join lateral (select private.rest_int(t -> 'max', 0) mx,
      private.rest_int(v.tracker_uses -> (t ->> 'id'), 0) used) n
    where can_rest and (t ->> 'reset' = 'short' or (rest_kind = 'long' and t ->> 'reset' = 'long'))
      and n.used > 0 and n.mx > 0;
  if can_rest and (rest_kind = 'long' or b ->> 'casterKind' = 'pact') then
    slots_after := array_fill(0, array[9]);
    slots_back := to_jsonb(v.slots_used);
  else
    slots_after := v.slots_used;
    slots_back := to_jsonb(array_fill(0, array[9]));
  end if;
  return jsonb_build_object('can_rest', can_rest, 'max_hp', s.max_hp, 'hp_before', v.current_hp,
    'hp_after', hp_after, 'temp_before', v.temp_hp, 'temp_after', temp_after, 'hit_die', die,
    'con_mod', con, 'dice_left_before', greatest(0, s.level - v.hit_dice_spent),
    'dice_left_after', greatest(0, s.level - dice_after), 'dice_spent', spent, 'trackers', tracker_list,
    'slots', slots_back,
    'vitals', jsonb_build_object('current_hp', hp_after, 'temp_hp', temp_after, 'hit_dice_spent', dice_after,
      'death', rest_kind = 'long' and can_rest, 'slots_used', to_jsonb(slots_after),
      'tracker_uses', case when can_rest then uses_after else v.tracker_uses end));
end;
$fn$;
revoke all on function private.rest_effect(uuid, uuid, text, integer, integer) from public, anon, authenticated;

-- Writes one character's rest (a new play-state revision, audited like any vitals change).
create function private.rest_apply(target_campaign uuid, target_character uuid, rest_kind text,
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
    tracker_uses = w -> 'tracker_uses', revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character;
  return e - 'vitals';
end;
$fn$;
revoke all on function private.rest_apply(uuid, uuid, text, integer, integer) from public, anon, authenticated;

-- Open requests past their 10 minutes expire.
create function private.rest_expire(target_campaign uuid) returns void
language sql security definer set search_path = '' as $fn$
  update public.rest_requests set status = 'expired', resolved_at = now(), revision = revision + 1
    where campaign_id = target_campaign and status = 'open' and expires_at <= now();
$fn$;
revoke all on function private.rest_expire(uuid) from public, anon, authenticated;

-- Applies the rest to every voter (active characters with HP) and closes the request as done.
create function private.rest_finish(target_request uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
declare req public.rest_requests; ch record; vote private.rest_votes; e jsonb; results jsonb := '[]'::jsonb;
begin
  select * into req from public.rest_requests where id = target_request for update;
  for ch in select c.id, c.name, c.user_id, c.shares_live from public.characters c
      where c.campaign_id = req.campaign_id and c.is_active and c.archived_at is null order by c.name, c.id loop
    select * into vote from private.rest_votes where request_id = req.id and character_id = ch.id;
    e := private.rest_apply(req.campaign_id, ch.id, req.kind, coalesce(vote.dice_spent, 0), vote.dice_roll);
    results := results || jsonb_build_array(jsonb_build_object('id', ch.id, 'name', ch.name, 'user_id', ch.user_id,
      'shares', ch.user_id is null or ch.shares_live, 'vote', vote.vote,
      'rested', coalesce((e ->> 'can_rest')::boolean, false), 'effect', e));
  end loop;
  update public.rest_requests set status = 'done', resolved_at = now(), resolved_by = auth.uid(),
    outcome = results, revision = revision + 1 where id = req.id;
end;
$fn$;
revoke all on function private.rest_finish(uuid) from public, anon, authenticated;

-- Unanimity: one "no" rejects; every voter saying yes rests the group.
create function private.rest_settle(target_request uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
declare req public.rest_requests; voters integer; ayes integer; nays integer;
begin
  select * into req from public.rest_requests where id = target_request for update;
  if req.status <> 'open' then return; end if;
  select count(*), count(*) filter (where v.vote = 'yes'), count(*) filter (where v.vote = 'no')
    into voters, ayes, nays
    from public.characters c
    join public.character_vitals x on x.campaign_id = c.campaign_id and x.character_id = c.id
    left join private.rest_votes v on v.request_id = req.id and v.character_id = c.id
    where c.campaign_id = req.campaign_id and c.is_active and c.archived_at is null and x.current_hp > 0;
  if nays > 0 then
    update public.rest_requests set status = 'rejected', resolved_at = now(), resolved_by = auth.uid(),
      outcome = (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'user_id', c.user_id,
          'shares', c.user_id is null or c.shares_live, 'vote', v.vote, 'rested', false) order by c.name, c.id), '[]'::jsonb)
        from public.characters c
        left join private.rest_votes v on v.request_id = req.id and v.character_id = c.id
        where c.campaign_id = req.campaign_id and c.is_active and c.archived_at is null),
      revision = revision + 1 where id = req.id;
  elsif voters > 0 and ayes = voters then
    perform private.rest_finish(req.id);
  end if;
end;
$fn$;
revoke all on function private.rest_settle(uuid) from public, anon, authenticated;

-- The request as one member sees it.
create function private.rest_state(target_request uuid, viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare req public.rest_requests; dm boolean; people jsonb;
begin
  select * into req from public.rest_requests where id = target_request;
  if req.id is null then return null; end if;
  dm := private.is_campaign_dm(req.campaign_id);
  if req.status = 'open' then
    select coalesce(jsonb_agg(p order by p ->> 'sort', p ->> 'name'), '[]'::jsonb) into people from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'own', coalesce(c.user_id = viewer, false),
          'dm_controlled', c.user_id is null,
          'controlled', coalesce(c.user_id = viewer, false) or (dm and c.user_id is null),
          'vote', v.vote, 'dice_spent', coalesce(v.dice_spent, 0),
          'dice_roll', case when dm or c.user_id = viewer or c.user_id is null or c.shares_live then v.dice_roll end,
          'can_rest', x.current_hp > 0,
          'shares', dm or c.user_id = viewer or c.user_id is null or c.shares_live,
          'effect', case when dm or c.user_id = viewer or c.user_id is null or c.shares_live then
            private.rest_effect(req.campaign_id, c.id, req.kind, coalesce(v.dice_spent, 0), v.dice_roll) - 'vitals' end,
          'sort', case when c.user_id = viewer then '0' when c.user_id is null then '2' else '1' end) p
        from public.characters c
        join public.character_vitals x on x.campaign_id = c.campaign_id and x.character_id = c.id
        left join private.rest_votes v on v.request_id = req.id and v.character_id = c.id
        where c.campaign_id = req.campaign_id and c.is_active and c.archived_at is null) q(p);
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', o ->> 'id', 'name', o ->> 'name',
        'own', coalesce((o ->> 'user_id') = viewer::text, false), 'dm_controlled', o ->> 'user_id' is null,
        'controlled', false, 'vote', o ->> 'vote', 'rested', coalesce((o ->> 'rested')::boolean, false),
        'shares', dm or coalesce((o ->> 'user_id') = viewer::text, false) or coalesce((o ->> 'shares')::boolean, false),
        'effect', case when dm or coalesce((o ->> 'user_id') = viewer::text, false)
          or coalesce((o ->> 'shares')::boolean, false) then o -> 'effect' end)), '[]'::jsonb)
      into people from jsonb_array_elements(coalesce(req.outcome, '[]'::jsonb)) o;
  end if;
  return jsonb_build_object('id', req.id, 'kind', req.kind, 'status', req.status,
    'created_at', req.created_at, 'expires_at', req.expires_at, 'resolved_at', req.resolved_at,
    'revision', req.revision, 'requester_name', (select c.name from public.characters c where c.id = req.requester_character),
    'mine', req.requested_by = viewer, 'dm', dm,
    'can_cancel', req.status = 'open' and (dm or req.requested_by = viewer),
    'participants', people);
end;
$fn$;
revoke all on function private.rest_state(uuid, uuid) from public, anon, authenticated;

-- The open request, or the last one closed in the past 10 minutes; null when there is none.
create function public.get_rest_state(target_campaign uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); found_id uuid;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  perform private.rest_expire(target_campaign);
  select r.id into found_id from public.rest_requests r where r.campaign_id = target_campaign
      and (r.status = 'open' or r.resolved_at > now() - interval '10 minutes')
    order by (r.status = 'open') desc, r.created_at desc limit 1;
  if found_id is null then return null; end if;
  return private.rest_state(found_id, viewer);
end;
$fn$;

-- A Player with a present active character outside a live encounter, or the DM, asks the group.
-- The request id makes retries safe. A long rest counts the requester's own yes.
create function public.request_rest(target_campaign uuid, rest_kind text, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; mine public.characters; prior public.rest_requests;
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_member(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if rest_kind is null or rest_kind not in ('short', 'long') or request_id is null then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from public.rest_requests r where r.id = request_rest.request_id;
  if prior.id is not null then
    if prior.campaign_id <> target_campaign or prior.requested_by <> viewer or prior.kind <> rest_kind then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return private.rest_state(prior.id, viewer);
  end if;
  dm := private.is_campaign_dm(target_campaign);
  if not dm then
    select * into mine from public.characters c where c.campaign_id = target_campaign and c.user_id = viewer
      and c.is_active and c.archived_at is null;
    if mine.id is null then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
    if private.character_in_live_encounter(target_campaign, mine.id) then
      raise exception 'Character in combat' using errcode = 'P0001'; end if;
  end if;
  perform private.rest_expire(target_campaign);
  if exists (select 1 from public.rest_requests r where r.campaign_id = target_campaign and r.status = 'open') then
    raise exception 'Rest open' using errcode = 'P0001'; end if;
  insert into public.rest_requests(id, campaign_id, kind, requested_by, requester_character, expires_at)
    values (request_rest.request_id, target_campaign, rest_kind, viewer, mine.id, now() + interval '10 minutes');
  if mine.id is not null and rest_kind = 'long' and exists (select 1 from public.character_vitals x
      where x.campaign_id = target_campaign and x.character_id = mine.id and x.current_hp > 0) then
    insert into private.rest_votes(request_id, campaign_id, character_id, vote, voted_by)
      values (request_rest.request_id, target_campaign, mine.id, 'yes', viewer);
    perform private.rest_settle(request_rest.request_id);
  end if;
  return private.rest_state(request_rest.request_id, viewer);
end;
$fn$;

-- A Player votes for their active character, the DM for an unassigned one. A short-rest yes carries
-- the hit point dice spent and the total rolled on them.
create function public.vote_rest(target_campaign uuid, target_request uuid, target_character uuid,
  vote_value text, spent integer, roll integer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; req public.rest_requests; ch public.characters;
  s public.character_sheets; x public.character_vitals; die integer;
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_member(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if vote_value is null or vote_value not in ('yes', 'no') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  dm := private.is_campaign_dm(target_campaign);
  perform private.rest_expire(target_campaign);
  select * into req from public.rest_requests r where r.id = target_request and r.campaign_id = target_campaign for update;
  if req.id is null then raise exception 'Rest unavailable' using errcode = 'P0001'; end if;
  if req.status <> 'open' then raise exception 'Rest closed' using errcode = 'P0001'; end if;
  select * into ch from public.characters c where c.campaign_id = target_campaign and c.id = target_character
    and c.is_active and c.archived_at is null;
  if ch.id is null then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
  if not (ch.user_id = viewer or (dm and ch.user_id is null)) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into x from public.character_vitals where campaign_id = target_campaign and character_id = ch.id;
  if x.current_hp <= 0 then raise exception 'Cannot rest' using errcode = 'P0001'; end if;
  if req.kind = 'long' or vote_value = 'no' then
    spent := 0; roll := null;
  else
    spent := coalesce(spent, 0);
    select * into s from public.character_sheets where campaign_id = target_campaign and character_id = ch.id;
    die := private.rest_int(case when jsonb_typeof(s.build) = 'object' then s.build -> 'hitDie' end, 0);
    if spent < 0 or spent > greatest(0, s.level - x.hit_dice_spent) then
      raise exception 'Invalid dice' using errcode = '22023'; end if;
    if spent > 0 and (die not in (6, 8, 10, 12) or roll is null or roll < spent or roll > spent * die) then
      raise exception 'Invalid dice' using errcode = '22023'; end if;
    if spent = 0 then roll := null; end if;
  end if;
  insert into private.rest_votes(request_id, campaign_id, character_id, vote, dice_spent, dice_roll, voted_by)
    values (req.id, target_campaign, ch.id, vote_value, spent, roll, viewer)
    on conflict (request_id, character_id) do update set vote = excluded.vote, dice_spent = excluded.dice_spent,
      dice_roll = excluded.dice_roll, voted_by = excluded.voted_by, updated_at = now();
  update public.rest_requests set revision = revision + 1 where id = req.id;
  perform private.rest_settle(req.id);
  return private.rest_state(req.id, viewer);
end;
$fn$;

-- The DM rests the group now, whatever the votes say (each voter's chosen dice still count).
create function public.resolve_rest_now(target_campaign uuid, target_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); req public.rest_requests;
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform private.rest_expire(target_campaign);
  select * into req from public.rest_requests r where r.id = target_request and r.campaign_id = target_campaign for update;
  if req.id is null then raise exception 'Rest unavailable' using errcode = 'P0001'; end if;
  if req.status <> 'open' then raise exception 'Rest closed' using errcode = 'P0001'; end if;
  perform private.rest_finish(req.id);
  return private.rest_state(req.id, viewer);
end;
$fn$;

-- The DM or the requester withdraws an open request.
create function public.cancel_rest(target_campaign uuid, target_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); req public.rest_requests;
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_member(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform private.rest_expire(target_campaign);
  select * into req from public.rest_requests r where r.id = target_request and r.campaign_id = target_campaign for update;
  if req.id is null then raise exception 'Rest unavailable' using errcode = 'P0001'; end if;
  if not (private.is_campaign_dm(target_campaign) or req.requested_by = viewer) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if req.status = 'open' then
    update public.rest_requests set status = 'cancelled', resolved_at = now(), resolved_by = viewer,
      revision = revision + 1 where id = req.id;
  elsif req.status <> 'cancelled' then
    raise exception 'Rest closed' using errcode = 'P0001';
  end if;
  return private.rest_state(req.id, viewer);
end;
$fn$;

revoke all on function public.set_character_absent(uuid, uuid, boolean), public.get_rest_state(uuid),
  public.request_rest(uuid, text, uuid), public.vote_rest(uuid, uuid, uuid, text, integer, integer),
  public.resolve_rest_now(uuid, uuid), public.cancel_rest(uuid, uuid) from public, anon;
grant execute on function public.set_character_absent(uuid, uuid, boolean), public.get_rest_state(uuid),
  public.request_rest(uuid, text, uuid), public.vote_rest(uuid, uuid, uuid, text, integer, integer),
  public.resolve_rest_now(uuid, uuid), public.cancel_rest(uuid, uuid) to authenticated;
$ddl$;
begin
  execute ddl;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rest_requests;
  end if;
  if to_regclass('pre.characters') is not null and to_regclass('pre.encounter_combatants') is not null
      and to_regclass('pre.shop_orders') is not null and to_regclass('pre.rest_requests') is null
      and to_regprocedure('pre_admin.remap(text)') is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'characters' and column_name = 'archived_at') then
    execute pre_admin.remap(ddl);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      alter publication supabase_realtime add table pre.rest_requests;
    end if;
  end if;
end;
$rest$;
