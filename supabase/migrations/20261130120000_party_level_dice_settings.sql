-- RYT-130 and RYT-133 (backend): the party level set by the DM, a guided level-up write, the
-- campaign's dice settings and a log of rolls made or recorded in the app. Additive: no row is
-- removed or rewritten at apply time; columns with constant defaults are added to campaigns, two
-- projections gain columns (drop and recreate, same arguments and grants) and
-- private.prune_stale_rows gains the new retention rules. Owner decisions of 2026-11-17.
--
-- 1. Party level. campaigns.party_level (null or 1..20; null = not set). set_party_level(campaign,
--    level, request_id) is DM-only, campaign-locked and idempotent (private.campaign_requests),
--    writes a 'party_level' row to public.campaign_events when the value changes and touches no
--    sheet. Lowering or clearing it only stops prompting. list_my_campaigns_with_modules returns
--    party_level; get_party_overview adds below_party_level per row it already returns (complete
--    sheet whose level is below the party level). Players keep receiving exactly the rows they
--    did (active assigned characters, whose level they already read); pool, reserve, absent and
--    archived characters stay out of their rows. The DM receives every active character.
-- 2. Level-up. save_character_sheet already writes level and max HP in one revision, but it does
--    not apply the play lock and does not bound the level, so a dedicated RPC is added:
--    apply_level_up(campaign, character, expected_revision, level, max_hp, build, request_id).
--    Same authorization (assigned active Player or campaign DM), campaign lock, request-id replay
--    (private.sheet_requests, 'Request mismatch' on a different payload or actor) and 'Stale
--    revision' check as the sheet save. The sheet must be complete. A Player raises exactly one
--    level, never above the party level (and not at all while it is unset: 'Above party level'),
--    is refused with the existing 'Encounter locked' while the character fights in an encounter
--    in initiative or active, and cannot level an archived character. A Player's max HP rises by
--    1..64 and the build keeps its classKey ('Class change' otherwise). The DM may raise any
--    number of levels up to 20 at any time, with any max HP not below the current one. One sheet
--    revision writes level, max HP and build (trackers live in the build; the AC trigger
--    recomputes armour class); current HP rises by the max HP gained. A 'level_up' character
--    event records before and after. Benched (inactive, present) characters stay playable by
--    their owner, as on the sheet: level-up and rolls are allowed for them.
--    save_character_sheet (latest definition 20261030200000, otherwise unchanged) now refuses a
--    level change on a complete sheet unless the caller is the campaign DM ('Use level up'), so
--    the DM raises the party and Players level only through apply_level_up. Finishing a draft
--    still sets any level.
-- 3. Dice settings. campaigns.dice_mode ('physical' default, 'app', 'player') and
--    campaigns.roll_visibility ('roller_dm' default, 'table', 'roller'), with checks.
--    set_dice_settings(campaign, mode, visibility, request_id) is DM-only, idempotent and audited
--    like set_party_level. set_campaign_modules is not a general settings RPC (no request id, no
--    audit, array of module keys), so it is not overloaded. Both settings are returned by
--    list_my_campaigns_with_modules. A Player's own choice when the mode is 'player' is a device
--    preference with no authorization meaning; it needs no schema.
-- 4. Roll log. public.campaign_rolls: client reads under RLS only, no write grants. log_roll is
--    the only writer: an active member for their own present, non-archived character, the DM for
--    any character of the campaign or none. Source 'app' is rolled on the server (dice and total
--    are not accepted from the client) and refused for Players while the mode is 'physical';
--    'recorded' stores physical dice the client reports, checked against the expression (count,
--    faces, keep-highest/lowest, total), or a total alone. The request id is the roll id: a
--    retry returns the stored roll and never re-rolls. 30 rolls per minute per user
--    (quota rolls_per_minute, 'Roll limit'); each insert keeps the newest rolls_per_campaign (200)
--    rolls of the campaign. Each roll stores the campaign's roll_visibility at the time it was
--    made; reads apply the stricter of the stored and the current setting (roller < roller_dm <
--    table), so widening the setting never reveals earlier rolls and narrowing it hides them:
--    table -> every active member; roller -> only the roller; roller_dm -> the roller and the
--    campaign's active DMs. A roller who is no longer an active member reads nothing.
--    A Player may log a 'recorded' roll with any total consistent with its expression in every
--    dice mode (physical dice stay legitimate); every roll returns its source for labelling.
--    Realtime: public.campaign_roll_signals (campaign id, revision, time) is published instead
--    of the roll rows, readable by every active member; it changes on every roll and on a
--    visibility change. Members refetch through RLS, so no realtime payload carries a roll.
--    Accepted residuals: the signal reveals the cadence of rolls (that someone rolled, not who
--    or what); a member can fish for a favourable 'app' roll by retrying with new request ids,
--    bounded by 30 per minute and visible to whoever may read those rolls; any member can fill
--    the 200-roll cap of the campaign and push older rolls out.
-- 5. Retention (private.prune_stale_rows, everything it did before is kept): campaign_requests
--    older than 30 days; rolls older than 30 days and beyond the newest rolls_per_campaign per
--    campaign; campaign_events beyond the newest campaign_events_per_campaign (500).
-- 6. Account deletion. Rolls and campaign request rows reference the membership (composite key,
--    on delete cascade) and campaign_events the membership with on delete set null (actor_id), so
--    the membership removal of delete_my_account (both environments) and a direct Auth deletion
--    remove the rolls and request rows and de-identify the audit rows without changing that
--    function. export_my_data (latest definition 20261125120000, otherwise unchanged) adds the
--    caller's own rolls ('rolls') and the campaign events they authored ('campaign_events'),
--    500 rows per section like the others.
--
-- Actor matrix (new and changed objects):
--   anon: no execute on any function, no grant on any new table.
--   outsider / inactive member / DM of another campaign: Forbidden on every RPC of the campaign;
--     no rows of campaign_rolls, campaign_roll_signals or campaign_events.
--   Player: reads the settings and the signal; logs rolls for own characters; reads rolls per
--     roll_visibility; levels up own character under the rules above; cannot set the party level
--     or the dice settings (Forbidden), cannot update the new campaign columns directly (column
--     privileges: only name and description are granted); reads no campaign_events.
--   campaign DM: every RPC; reads campaign_events and rolls per roll_visibility.
-- Every function is security definer with search_path '' (private.roll_eval is invoker and has no
-- client execute); no execute for public or anon. New tables have RLS on, explicit grants and an
-- index for every foreign key; read policies use the set helpers of 20261123120000.
--
-- Environments: production runs the DDL on public / private. A PRE that has the objects of
-- 20261128120000 receives the same DDL through pre_admin.remap; the DDL is idempotent. The
-- realtime publication and the service_role revoke stay outside the remapped DDL.

do $m$
declare ddl text := $ddl$
-- ---------------------------------------------------------------------------------------------
-- Campaign settings
-- ---------------------------------------------------------------------------------------------
alter table public.campaigns add column if not exists party_level integer
  constraint campaigns_party_level_range check (party_level between 1 and 20);
alter table public.campaigns add column if not exists dice_mode text not null default 'physical'
  constraint campaigns_dice_mode_valid check (dice_mode in ('physical', 'app', 'player'));
alter table public.campaigns add column if not exists roll_visibility text not null default 'roller_dm'
  constraint campaigns_roll_visibility_valid check (roll_visibility in ('table', 'roller', 'roller_dm'));
comment on column public.campaigns.party_level is
  'RYT-130: level the DM set for the party (null = not set). Written by set_party_level only.';
comment on column public.campaigns.dice_mode is
  'RYT-133: how the table rolls (physical, app, player). Written by set_dice_settings only.';
comment on column public.campaigns.roll_visibility is
  'RYT-133: who reads logged rolls (table, roller, roller_dm). Written by set_dice_settings only.';

insert into private.quota_limits (quota, max_count) values
  ('rolls_per_minute', 30), ('rolls_per_campaign', 200), ('campaign_events_per_campaign', 500)
  on conflict (quota) do nothing;

-- Idempotency of the campaign settings RPCs. Rows go with the membership of their actor.
create table if not exists private.campaign_requests (
  request_id uuid primary key,
  campaign_id uuid not null,
  actor_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint campaign_requests_actor_fkey foreign key (campaign_id, actor_id)
    references public.campaign_members(campaign_id, user_id) on delete cascade
);
create index if not exists campaign_requests_actor_fk on private.campaign_requests(campaign_id, actor_id);
create index if not exists campaign_requests_created_at on private.campaign_requests(created_at);
alter table private.campaign_requests enable row level security;
revoke all on private.campaign_requests from public, anon, authenticated;

-- Campaign-level audit (character_events needs a character). DM reads only, no client writes.
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid,
  kind text not null check (kind in ('party_level', 'dice_settings')),
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now(),
  constraint campaign_events_actor_fkey foreign key (campaign_id, actor_id)
    references public.campaign_members(campaign_id, user_id) on delete set null (actor_id)
);
create index if not exists campaign_events_campaign on public.campaign_events(campaign_id, created_at desc);
create index if not exists campaign_events_actor_fk on public.campaign_events(campaign_id, actor_id);
alter table public.campaign_events enable row level security;
revoke all on public.campaign_events from public, anon, authenticated;
grant select on public.campaign_events to authenticated;
drop policy if exists campaign_events_read on public.campaign_events;
create policy campaign_events_read on public.campaign_events for select to authenticated
  using (campaign_id in (select private.my_dm_campaign_ids()));
comment on table public.campaign_events is
  'RYT-130/133 campaign settings audit: actor, before and after. DM reads; RPC writes only.';

-- ---------------------------------------------------------------------------------------------
-- Roll log
-- ---------------------------------------------------------------------------------------------
create table if not exists public.campaign_rolls (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid,
  roller_id uuid not null,
  label text not null default '' check (char_length(label) <= 80 and label = btrim(label)
    and label !~ '[[:cntrl:]]'),
  expression text not null check (char_length(expression) between 2 and 40 and expression
    ~ '^([1-9][0-9]?)?d(2|3|4|6|8|10|12|20|100)(k[hl]1)?([+-](([1-9][0-9]?)?d(2|3|4|6|8|10|12|20|100)(k[hl]1)?|[0-9]{1,3}))*$'),
  dice smallint[] not null default '{}' check (cardinality(dice) <= 20
    and (cardinality(dice) = 0 or array_ndims(dice) = 1) and array_position(dice, null) is null
    and 1 <= all(dice) and 100 >= all(dice)),
  total integer not null check (total between -999 and 9999),
  kind text not null check (kind in ('ability', 'skill', 'save', 'attack', 'damage', 'initiative',
    'death_save', 'hit_die', 'custom')),
  source text not null check (source in ('app', 'recorded')),
  -- campaigns.roll_visibility when the roll was made; reads apply the stricter of both.
  visibility text not null check (visibility in ('table', 'roller', 'roller_dm')),
  created_at timestamptz not null default now(),
  constraint campaign_rolls_character_fkey foreign key (campaign_id, character_id)
    references public.characters(campaign_id, id) on delete cascade,
  constraint campaign_rolls_roller_fkey foreign key (campaign_id, roller_id)
    references public.campaign_members(campaign_id, user_id) on delete cascade
);
create index if not exists campaign_rolls_recent on public.campaign_rolls(campaign_id, created_at desc, id desc);
create index if not exists campaign_rolls_character_id_fk on public.campaign_rolls(campaign_id, character_id);
create index if not exists campaign_rolls_roller_id_fk on public.campaign_rolls(campaign_id, roller_id);
create index if not exists campaign_rolls_rate on public.campaign_rolls(roller_id, created_at);
create index if not exists campaign_rolls_created_at on public.campaign_rolls(created_at);
alter table public.campaign_rolls enable row level security;
revoke all on public.campaign_rolls from public, anon, authenticated;
grant select on public.campaign_rolls to authenticated;
comment on table public.campaign_rolls is
  'RYT-133 rolls made or recorded in the app. Read per campaigns.roll_visibility; log_roll writes only.';

-- Realtime signal: no roll content, readable by every active member.
create table if not exists public.campaign_roll_signals (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  updated_at timestamptz not null default now()
);
alter table public.campaign_roll_signals enable row level security;
revoke all on public.campaign_roll_signals from public, anon, authenticated;
grant select on public.campaign_roll_signals to authenticated;
drop policy if exists campaign_roll_signals_read on public.campaign_roll_signals;
create policy campaign_roll_signals_read on public.campaign_roll_signals for select to authenticated
  using (campaign_id in (select private.my_campaign_ids()));
comment on table public.campaign_roll_signals is
  'RYT-133 realtime signal per campaign: revision only. Changes on each roll and visibility change.';

-- (campaign, stored visibility) pairs whose rolls by others the caller reads. Ranks: roller 0,
-- roller_dm 1, table 2; the effective rank is the lower of the stored and the current setting;
-- a DM needs rank 1, any other member rank 2. Self-contained (no helper call), so the PRE copier
-- can create it in any order.
create or replace function private.my_roll_scopes() returns table(campaign_id uuid, visibility text)
language sql stable security definer set search_path = '' as $fn$
  select m.campaign_id, s.v from public.campaign_members m
    join public.campaigns c on c.id = m.campaign_id
    cross join (values ('table', 2), ('roller_dm', 1), ('roller', 0)) s(v, r)
   where m.user_id = (select auth.uid()) and m.active
     and least(s.r, case c.roll_visibility when 'table' then 2 when 'roller_dm' then 1 else 0 end)
       >= case when m.role = 'dm' then 1 else 2 end;
$fn$;
revoke all on function private.my_roll_scopes() from public, anon;
grant execute on function private.my_roll_scopes() to authenticated;

drop policy if exists campaign_rolls_read on public.campaign_rolls;
create policy campaign_rolls_read on public.campaign_rolls for select to authenticated
  using ((campaign_id, visibility) in (select k.campaign_id, k.visibility from private.my_roll_scopes() k)
    or (roller_id = (select auth.uid()) and campaign_id in (select private.my_campaign_ids())));

-- Evaluates a dice expression. given null: rolls on the server. given set: checks that the dice
-- match the expression in count and faces. Returns null dice and total when invalid.
create or replace function private.roll_eval(expr text, given smallint[], out dice smallint[],
  out total integer)
language plpgsql volatile set search_path = '' as $fn$
declare t text[]; n integer; faces integer; v integer; pos integer := 0; acc integer := 0;
  rolled smallint[] := '{}'; part integer[];
begin
  dice := null; total := null;
  if expr is null or char_length(expr) not between 2 and 40 or expr !~
      '^([1-9][0-9]?)?d(2|3|4|6|8|10|12|20|100)(k[hl]1)?([+-](([1-9][0-9]?)?d(2|3|4|6|8|10|12|20|100)(k[hl]1)?|[0-9]{1,3}))*$' then
    return; end if;
  if given is not null and (cardinality(given) > 20 or array_position(given, null) is not null) then
    return; end if;
  for t in select m from regexp_matches(expr,
      '([+-]?)(?:([0-9]{0,2})d([0-9]{1,3})(k[hl]1)?|([0-9]{1,3}))', 'g') m loop
    if t[3] is null then
      acc := acc + case when t[1] = '-' then -1 else 1 end * t[5]::integer;
      continue;
    end if;
    n := coalesce(nullif(t[2], ''), '1')::integer;
    faces := t[3]::integer;
    if t[4] is not null and n < 2 then return; end if;
    part := '{}';
    for i in 1..n loop
      pos := pos + 1;
      if pos > 20 then return; end if;
      if given is null then
        v := 1 + floor(random() * faces)::integer;
      else
        if pos > cardinality(given) then return; end if;
        v := given[pos];
        if v not between 1 and faces then return; end if;
      end if;
      part := part || v;
      rolled := rolled || v::smallint;
    end loop;
    acc := acc + case when t[1] = '-' then -1 else 1 end * case t[4]
      when 'kh1' then (select max(x) from unnest(part) x)
      when 'kl1' then (select min(x) from unnest(part) x)
      else (select sum(x)::integer from unnest(part) x) end;
  end loop;
  if pos = 0 or (given is not null and pos <> cardinality(given)) then return; end if;
  dice := rolled; total := acc;
end;
$fn$;
revoke all on function private.roll_eval(text, smallint[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Settings RPCs
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_party_level(target_campaign uuid, new_level integer, request_id uuid)
returns integer language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); prior private.campaign_requests; old_level integer;
  payload jsonb := jsonb_build_array('party_level', target_campaign, new_level);
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if viewer is null or not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.campaign_requests r where r.request_id = set_party_level.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> viewer or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return (prior.result ->> 'party_level')::integer;
  end if;
  if new_level is not null and new_level not between 1 and 20 then
    raise exception 'Invalid level' using errcode = '22023'; end if;
  select c.party_level into old_level from public.campaigns c where c.id = target_campaign;
  if old_level is distinct from new_level then
    update public.campaigns set party_level = new_level where id = target_campaign;
    insert into public.campaign_events(campaign_id, actor_id, kind, before_value, after_value)
      values (target_campaign, viewer, 'party_level', jsonb_build_object('party_level', old_level),
        jsonb_build_object('party_level', new_level));
  end if;
  insert into private.campaign_requests(request_id, campaign_id, actor_id, payload, result)
    values (request_id, target_campaign, viewer, payload, jsonb_build_object('party_level', new_level));
  return new_level;
end;
$fn$;
revoke all on function public.set_party_level(uuid, integer, uuid) from public, anon;
grant execute on function public.set_party_level(uuid, integer, uuid) to authenticated;

create or replace function public.set_dice_settings(target_campaign uuid, new_dice_mode text,
  new_roll_visibility text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); prior private.campaign_requests; c public.campaigns; result jsonb;
  payload jsonb := jsonb_build_array('dice_settings', target_campaign, new_dice_mode, new_roll_visibility);
begin
  select * into c from public.campaigns x where x.id = target_campaign for update;
  if viewer is null or not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.campaign_requests r where r.request_id = set_dice_settings.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> viewer or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result;
  end if;
  if new_dice_mode is null or new_dice_mode not in ('physical', 'app', 'player')
      or new_roll_visibility is null or new_roll_visibility not in ('table', 'roller', 'roller_dm') then
    raise exception 'Invalid settings' using errcode = '22023'; end if;
  result := jsonb_build_object('dice_mode', new_dice_mode, 'roll_visibility', new_roll_visibility);
  if c.dice_mode is distinct from new_dice_mode or c.roll_visibility is distinct from new_roll_visibility then
    update public.campaigns set dice_mode = new_dice_mode, roll_visibility = new_roll_visibility
      where id = target_campaign;
    insert into public.campaign_events(campaign_id, actor_id, kind, before_value, after_value)
      values (target_campaign, viewer, 'dice_settings',
        jsonb_build_object('dice_mode', c.dice_mode, 'roll_visibility', c.roll_visibility), result);
  end if;
  -- Readers refetch: the set of rolls they may read changed.
  if c.roll_visibility is distinct from new_roll_visibility then
    insert into public.campaign_roll_signals as s (campaign_id, revision, updated_at)
      values (target_campaign, 1, now())
      on conflict (campaign_id) do update set revision = s.revision + 1, updated_at = now();
  end if;
  insert into private.campaign_requests(request_id, campaign_id, actor_id, payload, result)
    values (request_id, target_campaign, viewer, payload, result);
  return result;
end;
$fn$;
revoke all on function public.set_dice_settings(uuid, text, text, uuid) from public, anon;
grant execute on function public.set_dice_settings(uuid, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Level-up
-- ---------------------------------------------------------------------------------------------
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
  if current.character_id is null or (not dm and ch.archived_at is not null) then
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

-- ---------------------------------------------------------------------------------------------
-- Rolls
-- ---------------------------------------------------------------------------------------------
create or replace function public.log_roll(target_campaign uuid, target_character uuid, roll_label text,
  roll_expression text, roll_kind text, roll_source text, recorded_dice smallint[],
  recorded_total integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; mode text; shown text; ch public.characters;
  prior public.campaign_rolls; saved public.campaign_rolls; cleaned text := btrim(coalesce(roll_label, ''));
  rolled smallint[]; outcome integer;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  dm := private.is_campaign_dm(target_campaign);
  -- One user's rolls are serialized: replay and rate limit are exact.
  perform private.quota_lock('rolls_per_minute', viewer);
  select * into prior from public.campaign_rolls r where r.id = log_roll.request_id;
  if prior.id is not null then
    if prior.roller_id <> viewer or prior.campaign_id <> target_campaign
        or prior.character_id is distinct from target_character or prior.label <> cleaned
        or prior.expression is distinct from roll_expression or prior.kind is distinct from roll_kind
        or prior.source is distinct from roll_source
        or (roll_source = 'recorded' and (prior.dice <> coalesce(recorded_dice, '{}')
          or prior.total is distinct from recorded_total))
        or (roll_source = 'app' and (recorded_dice is not null or recorded_total is not null)) then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return to_jsonb(prior);
  end if;
  if roll_kind is null or roll_kind not in ('ability', 'skill', 'save', 'attack', 'damage',
      'initiative', 'death_save', 'hit_die', 'custom')
      or roll_source is null or roll_source not in ('app', 'recorded')
      or char_length(cleaned) > 80 or cleaned ~ '[[:cntrl:]]' then
    raise exception 'Invalid roll' using errcode = '22023'; end if;
  if target_character is null then
    if not dm then raise exception 'Character unavailable' using errcode = '42501'; end if;
  else
    select * into ch from public.characters c where c.campaign_id = target_campaign and c.id = target_character;
    if ch.id is null or (not dm and (ch.user_id is distinct from viewer or ch.archived_at is not null
        or ch.absent)) then
      raise exception 'Character unavailable' using errcode = '42501'; end if;
  end if;
  select c.dice_mode, c.roll_visibility into mode, shown from public.campaigns c where c.id = target_campaign;
  if roll_source = 'app' then
    if not dm and mode = 'physical' then raise exception 'Dice mode' using errcode = 'P0001'; end if;
    if recorded_dice is not null or recorded_total is not null then
      raise exception 'Invalid roll' using errcode = '22023'; end if;
    select e.dice, e.total into rolled, outcome from private.roll_eval(roll_expression, null) e;
  elsif recorded_dice is null or cardinality(recorded_dice) = 0 then
    -- A physical total alone: the expression must still be valid.
    select e.total into outcome from private.roll_eval(roll_expression, null) e;
    if outcome is not null then outcome := recorded_total; rolled := '{}'; end if;
  else
    select e.dice, e.total into rolled, outcome from private.roll_eval(roll_expression, recorded_dice) e;
    if outcome is distinct from recorded_total then outcome := null; end if;
  end if;
  if outcome is null or outcome not between -999 and 9999 then
    raise exception 'Invalid roll' using errcode = '22023'; end if;
  if (select count(*) from public.campaign_rolls r
      where r.roller_id = viewer and r.created_at > now() - interval '1 minute')
      >= private.quota_limit('rolls_per_minute') then
    raise exception 'Roll limit' using errcode = 'P0001'; end if;
  insert into public.campaign_rolls(id, campaign_id, character_id, roller_id, label, expression, dice,
      total, kind, source, visibility)
    values (request_id, target_campaign, target_character, viewer, cleaned, roll_expression, rolled,
      outcome, roll_kind, roll_source, shown)
    returning * into saved;
  delete from public.campaign_rolls x where x.campaign_id = target_campaign and x.id in (
    select r.id from public.campaign_rolls r where r.campaign_id = target_campaign
     order by r.created_at desc, r.id desc offset private.quota_limit('rolls_per_campaign'));
  insert into public.campaign_roll_signals as s (campaign_id, revision, updated_at)
    values (target_campaign, 1, now())
    on conflict (campaign_id) do update set revision = s.revision + 1, updated_at = now();
  return to_jsonb(saved);
end;
$fn$;
revoke all on function public.log_roll(uuid, uuid, text, text, text, text, smallint[], integer, uuid)
  from public, anon;
grant execute on function public.log_roll(uuid, uuid, text, text, text, text, smallint[], integer, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Sheet save (20261030200000) with the RYT-130 level rule; export (20261125120000) with rolls
-- ---------------------------------------------------------------------------------------------
create or replace function public.save_character_sheet(target_campaign uuid, target_character uuid,
  expected_revision bigint, new_level integer, new_max_hp integer, new_armor_class integer,
  new_build jsonb, mark_complete boolean, request_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare current public.character_sheets; prior private.sheet_requests;
  payload jsonb := jsonb_build_array('sheet', target_campaign, target_character, expected_revision,
    new_level, new_max_hp, new_armor_class, new_build, mark_complete);
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.sheet_requests r where r.request_id = save_character_sheet.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result_revision;
  end if;
  select * into current from public.character_sheets
    where campaign_id = target_campaign and character_id = target_character for update;
  if current.character_id is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
  if current.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  -- RYT-130: a complete sheet changes level only through apply_level_up, unless the DM edits it.
  if not private.is_campaign_dm(target_campaign) and current.status = 'complete'
      and new_level is distinct from current.level then
    raise exception 'Use level up' using errcode = 'P0001'; end if;
  update public.character_sheets set level = new_level, max_hp = new_max_hp,
    armor_class = new_armor_class, build = new_build,
    status = case when mark_complete or status = 'complete' then 'complete' else 'draft' end,
    revision = revision + 1, updated_at = now()
    where campaign_id = target_campaign and character_id = target_character;
  -- Completing a draft starts at full health; later edits only clamp play state.
  update public.character_vitals set
    current_hp = case when current.status = 'draft' and mark_complete then new_max_hp
      else least(current_hp, new_max_hp) end,
    hit_dice_spent = least(hit_dice_spent, new_level), revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character
      and (current_hp > new_max_hp or hit_dice_spent > new_level
        or (current.status = 'draft' and mark_complete));
  insert into private.sheet_requests values (request_id, auth.uid(), target_character, payload, current.revision + 1);
  return current.revision + 1;
end;
$fn$;

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
              'conditions', v.conditions, 'slots_used', v.slots_used, 'tracker_uses', v.tracker_uses)
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

-- ---------------------------------------------------------------------------------------------
-- Projections members already load
-- ---------------------------------------------------------------------------------------------
drop function if exists public.list_my_campaigns_with_modules();
create function public.list_my_campaigns_with_modules()
returns table(id uuid, name text, description text, created_at timestamptz, role text,
  player_modules text[], party_level integer, dice_mode text, roll_visibility text)
language sql stable security definer set search_path = '' as $fn$
  select c.id, c.name, c.description, c.created_at, m.role, c.player_modules, c.party_level,
      c.dice_mode, c.roll_visibility
    from public.campaigns c
    join public.campaign_members m on m.campaign_id = c.id
    where m.user_id = (select auth.uid()) and m.active
    order by c.created_at desc, c.id;
$fn$;
revoke all on function public.list_my_campaigns_with_modules() from public, anon;
grant execute on function public.list_my_campaigns_with_modules() to authenticated;

-- 20261117120000 plus below_party_level on the same rows.
drop function if exists public.get_party_overview(uuid);
create function public.get_party_overview(target_campaign uuid)
returns table(id uuid, name text, is_own boolean, is_assigned boolean, shares_live boolean, sheet_status text,
  class_key text, class_label text, level integer, current_hp integer, max_hp integer,
  temp_hp integer, armor_class integer, exhaustion integer, conditions text[], below_party_level boolean)
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
      coalesce(s.status = 'complete' and s.level < party, false)
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

-- ---------------------------------------------------------------------------------------------
-- Retention (20261128120000 plus the new tables)
-- ---------------------------------------------------------------------------------------------
create or replace function private.prune_stale_rows() returns jsonb
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  cutoff timestamptz := now() - interval '30 days';
  log_cap constant integer := 60;
  roll_cap integer := coalesce((select q.max_count from private.quota_limits q
    where q.quota = 'rolls_per_campaign'), 200);
  event_cap integer := coalesce((select q.max_count from private.quota_limits q
    where q.quota = 'campaign_events_per_campaign'), 500);
  n bigint;
  result jsonb := '{}'::jsonb;
begin
  delete from private.resource_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('resource_requests', n);
  delete from private.sheet_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('sheet_requests', n);
  delete from private.inventory_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('inventory_requests', n);
  delete from private.combat_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('combat_requests', n);
  delete from private.tabletop_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('tabletop_requests', n);
  delete from private.character_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('character_requests', n);
  delete from private.content_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('content_requests', n);
  delete from private.campaign_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('campaign_requests', n);
  delete from private.account_deletion_requests r where r.created_at < now() - interval '7 days';
  get diagnostics n = row_count; result := result || jsonb_build_object('account_deletion_requests', n);

  -- Rolls: nothing older than 30 days and the newest roll_cap per campaign.
  delete from public.campaign_rolls r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('campaign_rolls_expired', n);
  delete from public.campaign_rolls x
   using (select v.id, row_number() over (partition by v.campaign_id
            order by v.created_at desc, v.id desc) rank
          from public.campaign_rolls v) k
   where x.id = k.id and k.rank > roll_cap;
  get diagnostics n = row_count; result := result || jsonb_build_object('campaign_rolls_trimmed', n);
  delete from public.campaign_events x
   using (select v.id, row_number() over (partition by v.campaign_id
            order by v.created_at desc, v.id desc) rank
          from public.campaign_events v) k
   where x.id = k.id and k.rank > event_cap;
  get diagnostics n = row_count; result := result || jsonb_build_object('campaign_events_trimmed', n);

  -- get_combat_state shows the newest 60 events (DM) or the newest 60 visible events (Players and
  -- the table screen); older rows of an ended encounter are read by nothing, except invisible
  -- 'leave' events, which mark a combatant removed while hidden.
  delete from public.encounter_events x
   using (select v.id, v.visible,
            row_number() over (partition by v.encounter_id order by v.created_at desc, v.id desc) all_rank,
            row_number() over (partition by v.encounter_id, v.visible order by v.created_at desc, v.id desc) kind_rank
          from public.encounter_events v
          join public.encounters e on e.id = v.encounter_id
         where e.status = 'ended' and coalesce(e.ended_at, e.updated_at) < cutoff) k
   where x.id = k.id and k.all_rank > log_cap and (not k.visible or k.kind_rank > log_cap)
     and not (x.kind = 'leave' and not x.visible);
  get diagnostics n = row_count; result := result || jsonb_build_object('encounter_events_deleted', n);
  update public.encounter_events x set before_state = null, after_state = null
    from public.encounters e
   where e.id = x.encounter_id and e.status = 'ended' and coalesce(e.ended_at, e.updated_at) < cutoff
     and (x.before_state is not null or x.after_state is not null);
  get diagnostics n = row_count; result := result || jsonb_build_object('encounter_events_snapshots_cleared', n);
  return result;
end;
$fn$;
revoke all on function private.prune_stale_rows() from public, anon, authenticated;
comment on function private.prune_stale_rows() is
  'RYT-114 retention: idempotency rows older than 30 days, account deletion requests older than 7 days; snapshots and unread log rows of encounters ended over 30 days ago (invisible leave events kept); rolls older than 30 days or beyond the newest rolls_per_campaign, campaign events beyond campaign_events_per_campaign. Owner or scheduler only.';
$ddl$;
begin
  execute ddl;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function private.prune_stale_rows() from service_role';
  end if;
  if to_regprocedure('pre_admin.remap(text)') is not null
      and to_regclass('pre.campaigns') is not null
      and to_regclass('pre_private.quota_limits') is not null
      and to_regclass('pre_private.account_deletion_requests') is not null
      and to_regprocedure('pre_private.prune_stale_rows()') is not null
      and to_regprocedure('pre_private.my_campaign_ids()') is not null
      and to_regprocedure('pre_private.quota_lock(text,uuid)') is not null
      and to_regprocedure('pre_private.character_in_live_encounter(uuid,uuid)') is not null
      and to_regprocedure('pre.get_party_overview(uuid)') is not null
      and to_regprocedure('pre.export_my_data()') is not null
      and to_regprocedure('pre.save_character_sheet(uuid,uuid,bigint,integer,integer,integer,jsonb,boolean,uuid)') is not null then
    execute pre_admin.remap(ddl);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'revoke all on function pre_private.prune_stale_rows() from service_role';
    end if;
  end if;
end;
$m$;

-- ---------------------------------------------------------------------------------------------
-- Realtime: the roll signal, never the roll rows (both environments).
-- ---------------------------------------------------------------------------------------------
do $$
declare env text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach env in array array['public', 'pre'] loop
    if to_regclass(format('%I.campaign_roll_signals', env)) is not null and not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime'
          and schemaname = env and tablename = 'campaign_roll_signals') then
      execute format('alter publication supabase_realtime add table %I.campaign_roll_signals', env);
    end if;
  end loop;
end;
$$;
