-- RYT-137 (backend): with dice in the app, one initiative roll per fight and one hit-dice roll per
-- rest become a server rule. Until now the limit was a presentation guard in the client, derived
-- from the Player's roll log by timestamps; the server rolls (log_roll, source 'app') but did not
-- know which fight or rest a roll belonged to.
--
-- What.
-- 1. Context. public.campaign_rolls gains encounter_id, rest_id (nullable, composite foreign keys
--    to encounters(campaign_id, id) and rest_requests(campaign_id, id), on delete set null of that
--    column only) and superseded_at (nullable). A unique index rest_requests(campaign_id, id) is
--    added so the composite key has a target. A check keeps encounter_id for source 'app' kind
--    'initiative' rolls and rest_id for source 'app' kind 'hit_die' rolls, both with a character.
--    Existing rows keep null in the three columns; nothing is rewritten.
-- 2. Linking (public.log_roll, latest definition 20261130120000, same signature and grants). The
--    context is derived on the server, never taken from the client: for source 'app' and kind
--    'initiative', the live encounter (status initiative or active; at most one per campaign) in
--    which the character is a combatant; for source 'app' and kind 'hit_die', the campaign's open
--    rest request (status open and not yet expired; at most one per campaign). A character in no
--    live encounter, a campaign with no open rest, a roll without a character, any other kind and
--    every 'recorded' roll stay unlinked and unrestricted, as before.
-- 3. One roll. Two partial unique indexes on campaign_rolls, (campaign_id, character_id,
--    encounter_id) for app initiative rolls and (campaign_id, character_id, rest_id) for app
--    hit-dice rolls, both only while superseded_at is null. The rule is the index alone: log_roll
--    inserts and turns the unique violation into 'Already rolled' (SQLSTATE P0001, the code of
--    every other rule refusal: 'Encounter locked', 'Dice mode', 'Roll limit'), so two concurrent
--    calls by different users (the Player and the DM) cannot both succeed and there is no
--    check-then-insert window. A refused call writes nothing (no roll, no trim, no signal). A
--    replay of the same request id is answered before any of this and returns the stored roll,
--    also after the DM superseded it. A unique violation on the roll id itself (another user's
--    request id) is reported as 'Request mismatch'. The DM is bound by the same rule through
--    log_roll and uses the reset RPC below to override it.
-- 4. Retention. A linked roll still in force (not superseded, its encounter still live or its
--    rest still open) is kept by the 200-roll trim in log_roll and by private.prune_stale_rows
--    (latest definition 20261130120000, otherwise unchanged), so a busy fight cannot push the
--    initiative roll out and reopen the slot. At most one such roll per character per kind is
--    kept beyond the cap.
-- 5. Read. public.get_roll_context(target_campaign) returns
--      {encounter_id, rest_id, spent: [{character_id, kind}], rolls: [roll]}
--    encounter_id: the live encounter or null; rest_id: the open, unexpired rest or null.
--    spent: the characters the caller controls (the DM: every character; a Player: their own)
--    whose one roll of that kind is used in that context; it carries no roll content.
--    rolls: the rolls in force in that context, as campaign_rolls rows, filtered by exactly the
--    rule of the campaign_rolls_read policy (own rolls always; others per the stored and current
--    roll_visibility through private.my_roll_scopes). The new columns are also readable in the
--    roll log through the existing select grant and policy.
-- 6. DM reset. public.reset_initiative_roll(target_campaign, target_character, reroll_expression,
--    request_id): the campaign DM only, campaign-locked and idempotent (private.combat_requests
--    through private.combat_begin, 'Request mismatch' on another payload). In the character's live
--    encounter it marks the roll in force superseded (the roll stays in the log), and then:
--      reroll_expression null: clears the combatant's initiative, so the Player rolls once again
--        and saves it with set_initiative (also once the fight is active: a late joiner);
--      reroll_expression set ('d20' with an optional modifier of up to two digits): the server
--        rolls it as the DM, stores the roll linked to the encounter and sets the initiative.
--    One 'initiative' encounter event records it (amount = the new total or null, detail.reset =
--    'clear' or 'reroll', detail.superseded_roll), visible like set_initiative's; the encounter
--    revision and the roll signal are bumped. 'Encounter closed' when the campaign has no live
--    encounter, 'Combatant unavailable' when the character is not in it, 'Invalid roll' for a
--    bad expression or a total outside -20..99. Returns the combat result plus superseded_roll
--    (uuid or null) and roll (the new roll or null).
-- 7. Saved totals come from the server roll. Without this a Player in app mode could skip the roll
--    by saving another number. Only when campaigns.dice_mode is 'app' and the caller is not a DM
--    of the campaign:
--      public.set_initiative (latest definition 20261106120000, same signature and grants): the
--        total must equal the total of the character's linked initiative roll in force (not
--        superseded) in that encounter. Re-saving the total the combatant already has is still
--        accepted, since it invents nothing (a total the DM set, or a reopened entry). Otherwise
--        'Roll required' (P0001) and nothing is written.
--      public.vote_rest (latest definition 20261114120000, same signature and grants): a short-rest
--        "yes" that spends hit dice stores dice_spent and dice_roll (the sum of the hit dice,
--        without the Constitution bonus, which rest_effect adds). Both must match the character's
--        linked hit-dice roll of that rest: dice_spent = its number of dice, dice_roll = the sum of
--        its dice, and its expression is exactly that many dice of the sheet's hit die
--        (N d die, optional flat modifier). Otherwise 'Roll required' (P0001) and nothing is
--        written. A "no", a long rest and zero dice need no roll.
--    The DM is never restricted (the console sets creatures' initiatives and may overwrite a
--    Player's; the DM votes for unassigned characters).
--    Limit, stated plainly: in 'physical' mode and in 'player' mode (each Player chooses physical
--    or app dice on their device) nothing changes. That choice is local to the device and the
--    server cannot know it, so it does not guess; a total is accepted as before. In app mode the
--    modifier in the roll expression (the initiative bonus, the Constitution bonus) is still the
--    client's: the server knows neither, as before; the dice themselves are the server's.
--
-- Why this design (rollout). The frontend in production calls log_roll by name with its nine
-- arguments and reads campaign_rolls with an explicit column list; both keep working, since the
-- signature does not change (create or replace, no overload) and the returned roll only gains
-- keys its schema ignores. A second app roll it attempts in the same fight or rest is now refused
-- with 'Already rolled', which it maps to its generic failure ('unavailable'): the initiative
-- entry shows "The initiative could not be rolled. No roll was saved; try again.", the rest panel
-- the same for hit dice, and a sheet tap the generic roll error; a retry fails the same way and
-- nothing loops. Its own guard already hides the second roll in the normal path.
-- In app mode that frontend saves exactly what the server rolled: the initiative entry is
-- read-only and sends the roll's total (d20 plus the bonus, as the expression d20+N, so the total
-- already includes the modifier) to set_initiative; the rest panel sends spent = the roll's number
-- of dice and roll = the sum of its dice (the expression is N d die plus N times the Constitution
-- modifier). Both pass the new checks. It would be refused ('Roll required', shown as its generic
-- failure) only where it relies on an unlinked roll: an initiative rolled after the initiative
-- phase opened but before the character was added to the encounter, or a hit-dice roll the DM
-- made for the Player's character (its guard reads only the Player's own rolls).
--
-- Security. Every function is security definer with search_path '' (private.prune_stale_rows
-- too). log_roll, set_initiative, vote_rest and prune_stale_rows keep their grants (create or
-- replace, restated for the public ones); the two new
-- functions revoke all from public and anon and grant execute to authenticated. No table grant or
-- policy changes. The client sends no identity or context: auth.uid(), the membership helpers and
-- the derived encounter or rest decide.
--
-- Actor matrix: anon has no execute. Outsiders, inactive members and DMs of another campaign raise
-- Forbidden on log_roll, get_roll_context and reset_initiative_roll. A Player rolls for their own
-- present character only (unchanged), reads the context of their campaign under the visibility
-- rule, and raises Forbidden on reset_initiative_roll. The campaign DM does all three.
--
-- Environments: production runs the DDL on public / private. A PRE that has every object this file
-- uses receives the same DDL through pre_admin.remap; where PRE does not exist (staging, PGlite
-- before an ETL) or lacks one of those objects, only production changes and a notice names every
-- missing PRE object. The DDL is re-runnable (add column if not exists, drop constraint if exists
-- before add, create index if not exists, create or replace). The file is printable ASCII with no
-- escapes.
--
-- Rollout: apply this migration before the new frontend; check that the nine-argument log_roll
-- call still answers and returns a roll; then publish the frontend that reads get_roll_context and
-- offers the DM reset. Rolling back the frontend needs nothing.

do $oneroll$
declare ddl text := $ddl$
-- ---------------------------------------------------------------------------------------------
-- Context columns and the one-roll indexes
-- ---------------------------------------------------------------------------------------------
alter table public.campaign_rolls add column if not exists encounter_id uuid;
alter table public.campaign_rolls add column if not exists rest_id uuid;
alter table public.campaign_rolls add column if not exists superseded_at timestamptz;
comment on column public.campaign_rolls.encounter_id is
  'RYT-137: live encounter an app initiative roll belongs to (derived by log_roll). One in force per character.';
comment on column public.campaign_rolls.rest_id is
  'RYT-137: open rest an app hit-dice roll belongs to (derived by log_roll). One in force per character.';
comment on column public.campaign_rolls.superseded_at is
  'RYT-137: when the DM cleared or re-rolled this roll; it stays in the log and no longer counts.';

create unique index if not exists rest_requests_campaign_id_id on public.rest_requests(campaign_id, id);

alter table public.campaign_rolls drop constraint if exists campaign_rolls_encounter_fkey;
alter table public.campaign_rolls add constraint campaign_rolls_encounter_fkey
  foreign key (campaign_id, encounter_id) references public.encounters(campaign_id, id)
  on delete set null (encounter_id);
alter table public.campaign_rolls drop constraint if exists campaign_rolls_rest_fkey;
alter table public.campaign_rolls add constraint campaign_rolls_rest_fkey
  foreign key (campaign_id, rest_id) references public.rest_requests(campaign_id, id)
  on delete set null (rest_id);
alter table public.campaign_rolls drop constraint if exists campaign_rolls_context_check;
alter table public.campaign_rolls add constraint campaign_rolls_context_check check (
  (encounter_id is null or (kind = 'initiative' and source = 'app' and character_id is not null))
  and (rest_id is null or (kind = 'hit_die' and source = 'app' and character_id is not null)));
create index if not exists campaign_rolls_encounter_id_fk on public.campaign_rolls(campaign_id, encounter_id);
create index if not exists campaign_rolls_rest_id_fk on public.campaign_rolls(campaign_id, rest_id);
create unique index if not exists campaign_rolls_one_initiative
  on public.campaign_rolls(campaign_id, character_id, encounter_id)
  where source = 'app' and kind = 'initiative' and encounter_id is not null and superseded_at is null;
create unique index if not exists campaign_rolls_one_hit_die
  on public.campaign_rolls(campaign_id, character_id, rest_id)
  where source = 'app' and kind = 'hit_die' and rest_id is not null and superseded_at is null;

-- ---------------------------------------------------------------------------------------------
-- 20261130120000 plus the derived context, the one-roll refusal and the protected trim.
-- ---------------------------------------------------------------------------------------------
create or replace function public.log_roll(target_campaign uuid, target_character uuid, roll_label text,
  roll_expression text, roll_kind text, roll_source text, recorded_dice smallint[],
  recorded_total integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; mode text; shown text; ch public.characters;
  prior public.campaign_rolls; saved public.campaign_rolls; cleaned text := btrim(coalesce(roll_label, ''));
  rolled smallint[]; outcome integer; in_fight uuid; in_rest uuid;
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
  -- RYT-137: the fight or rest of a server roll, derived here; the client sends no context.
  if roll_source = 'app' and target_character is not null then
    if roll_kind = 'initiative' then
      select e.id into in_fight from public.encounters e
        join public.encounter_combatants k on k.campaign_id = e.campaign_id and k.encounter_id = e.id
        where e.campaign_id = target_campaign and e.status in ('initiative', 'active')
          and k.character_id = target_character;
    elsif roll_kind = 'hit_die' then
      select q.id into in_rest from public.rest_requests q
        where q.campaign_id = target_campaign and q.status = 'open' and q.expires_at > now();
    end if;
  end if;
  -- The partial unique indexes are the rule: no check-then-insert window between two users.
  begin
    insert into public.campaign_rolls(id, campaign_id, character_id, roller_id, label, expression, dice,
        total, kind, source, visibility, encounter_id, rest_id)
      values (request_id, target_campaign, target_character, viewer, cleaned, roll_expression, rolled,
        outcome, roll_kind, roll_source, shown, in_fight, in_rest)
      returning * into saved;
  exception when unique_violation then
    if exists (select 1 from public.campaign_rolls r where r.id = log_roll.request_id) then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    raise exception 'Already rolled' using errcode = 'P0001';
  end;
  -- The newest rolls_per_campaign rolls, plus any linked roll still in force.
  delete from public.campaign_rolls x where x.campaign_id = target_campaign and x.id in (
    select r.id from public.campaign_rolls r where r.campaign_id = target_campaign
     order by r.created_at desc, r.id desc offset private.quota_limit('rolls_per_campaign'))
    and not (x.superseded_at is null and (
      (x.encounter_id is not null and exists (select 1 from public.encounters e
        where e.campaign_id = x.campaign_id and e.id = x.encounter_id and e.status in ('initiative', 'active')))
      or (x.rest_id is not null and exists (select 1 from public.rest_requests q
        where q.campaign_id = x.campaign_id and q.id = x.rest_id and q.status = 'open'))));
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
-- The one-roll state of the current fight and rest
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_roll_context(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; in_fight uuid; in_rest uuid;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  select e.id into in_fight from public.encounters e
    where e.campaign_id = target_campaign and e.status in ('initiative', 'active');
  select q.id into in_rest from public.rest_requests q
    where q.campaign_id = target_campaign and q.status = 'open' and q.expires_at > now();
  return jsonb_build_object('encounter_id', in_fight, 'rest_id', in_rest,
    -- Whose one roll is used, for the characters the caller controls; no roll content.
    'spent', coalesce((select jsonb_agg(jsonb_build_object('character_id', r.character_id, 'kind', r.kind)
        order by r.created_at, r.id)
      from public.campaign_rolls r join public.characters c on c.campaign_id = r.campaign_id and c.id = r.character_id
      where r.campaign_id = target_campaign and r.source = 'app' and r.superseded_at is null
        and ((r.kind = 'initiative' and r.encounter_id = in_fight) or (r.kind = 'hit_die' and r.rest_id = in_rest))
        and (dm or c.user_id = viewer)), '[]'::jsonb),
    -- The rolls in force, under exactly the campaign_rolls_read rule.
    'rolls', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at, r.id)
      from public.campaign_rolls r
      where r.campaign_id = target_campaign and r.source = 'app' and r.superseded_at is null
        and ((r.kind = 'initiative' and r.encounter_id = in_fight) or (r.kind = 'hit_die' and r.rest_id = in_rest))
        and ((r.campaign_id, r.visibility) in (select k.campaign_id, k.visibility from private.my_roll_scopes() k)
          or r.roller_id = viewer)), '[]'::jsonb));
end;
$fn$;
revoke all on function public.get_roll_context(uuid) from public, anon;
grant execute on function public.get_roll_context(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The DM clears or re-rolls a character's initiative roll in the live encounter
-- ---------------------------------------------------------------------------------------------
create or replace function public.reset_initiative_roll(target_campaign uuid, target_character uuid,
  reroll_expression text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid();
  payload jsonb := jsonb_build_array('reset_initiative_roll', target_campaign, target_character,
    reroll_expression);
  replay jsonb; e public.encounters; c public.encounter_combatants; old_roll uuid;
  saved public.campaign_rolls; rolled smallint[]; outcome integer; shown text;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  select * into e from public.encounters x
    where x.campaign_id = target_campaign and x.status in ('initiative', 'active') for update;
  if e.id is null then raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  select * into c from public.encounter_combatants k
    where k.campaign_id = target_campaign and k.encounter_id = e.id and k.character_id = target_character
    for update;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  if reroll_expression is not null then
    if reroll_expression !~ '^1?d20([+-][0-9]{1,2})?$' then
      raise exception 'Invalid roll' using errcode = '22023'; end if;
    select r.dice, r.total into rolled, outcome from private.roll_eval(reroll_expression, null) r;
    if outcome is null or outcome not between -20 and 99 then
      raise exception 'Invalid roll' using errcode = '22023'; end if;
  end if;
  update public.campaign_rolls r set superseded_at = now()
    where r.campaign_id = target_campaign and r.character_id = target_character and r.encounter_id = e.id
      and r.kind = 'initiative' and r.source = 'app' and r.superseded_at is null
    returning r.id into old_roll;
  if reroll_expression is not null then
    select x.roll_visibility into shown from public.campaigns x where x.id = target_campaign;
    insert into public.campaign_rolls(id, campaign_id, character_id, roller_id, label, expression, dice,
        total, kind, source, visibility, encounter_id)
      values (gen_random_uuid(), target_campaign, target_character, viewer, 'initiative', reroll_expression,
        rolled, outcome, 'initiative', 'app', shown, e.id)
      returning * into saved;
    delete from public.campaign_rolls x where x.campaign_id = target_campaign and x.id in (
      select r.id from public.campaign_rolls r where r.campaign_id = target_campaign
       order by r.created_at desc, r.id desc offset private.quota_limit('rolls_per_campaign'))
      and not (x.superseded_at is null and (
        (x.encounter_id is not null and exists (select 1 from public.encounters y
          where y.campaign_id = x.campaign_id and y.id = x.encounter_id and y.status in ('initiative', 'active')))
        or (x.rest_id is not null and exists (select 1 from public.rest_requests q
          where q.campaign_id = x.campaign_id and q.id = x.rest_id and q.status = 'open'))));
  end if;
  -- Cleared: no total, so the Player may roll and save once again. Re-rolled: the server's total.
  update public.encounter_combatants set initiative = outcome, revision = revision + 1 where id = c.id;
  perform private.combat_log(e, 'initiative', c, outcome,
    jsonb_build_object('reset', case when reroll_expression is null then 'clear' else 'reroll' end,
      'superseded_roll', old_roll), null, null, true);
  perform private.combat_bump(e.id);
  if old_roll is not null or saved.id is not null then
    insert into public.campaign_roll_signals as s (campaign_id, revision, updated_at)
      values (target_campaign, 1, now())
      on conflict (campaign_id) do update set revision = s.revision + 1, updated_at = now();
  end if;
  return private.combat_finish(request_id, payload, private.combat_result(e.id)
    || jsonb_build_object('superseded_roll', old_roll,
      'roll', case when saved.id is not null then to_jsonb(saved) end));
end;
$fn$;
revoke all on function public.reset_initiative_roll(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.reset_initiative_roll(uuid, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 20261106120000 plus: in app mode a Player saves the total of the server roll.
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_initiative(target_campaign uuid, target_combatant uuid, initiative_total integer,
  tiebreak_bonus integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('initiative', target_campaign, target_combatant, initiative_total,
    tiebreak_bonus);
  replay jsonb; e public.encounters; c public.encounter_combatants; dm boolean; mode text;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into c from public.encounter_combatants where campaign_id = target_campaign and id = target_combatant;
  if c.id is null then raise exception 'Combatant unavailable' using errcode = '42501'; end if;
  e := private.combat_encounter(target_campaign, c.encounter_id);
  c := private.combat_combatant(e, c.id);
  perform private.combat_require_act(c);
  dm := private.is_campaign_dm(target_campaign);
  if e.status = 'ended' or (e.status = 'draft' and not dm) then
    raise exception 'Encounter closed' using errcode = 'P0001'; end if;
  if not dm and e.status = 'active' and c.initiative is not null then
    raise exception 'Initiative closed' using errcode = 'P0001'; end if;
  if initiative_total is null or initiative_total not between -20 and 99
      or (tiebreak_bonus is not null and tiebreak_bonus not between -20 and 30) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  -- RYT-137: with dice in the app a Player saves the server's roll (or keeps the saved total).
  select x.dice_mode into mode from public.campaigns x where x.id = target_campaign;
  if not dm and mode = 'app' and initiative_total is distinct from c.initiative and not exists (
      select 1 from public.campaign_rolls r
       where r.campaign_id = target_campaign and r.character_id = c.character_id and r.encounter_id = e.id
         and r.kind = 'initiative' and r.source = 'app' and r.superseded_at is null
         and r.total = initiative_total) then
    raise exception 'Roll required' using errcode = 'P0001'; end if;
  update public.encounter_combatants set initiative = initiative_total,
      initiative_bonus = coalesce(tiebreak_bonus, initiative_bonus), revision = revision + 1
    where encounter_id = e.id and (id = c.id or (c.group_key is not null and group_key = c.group_key));
  perform private.combat_log(e, 'initiative', c, initiative_total, '{}'::jsonb, null, null, true);
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id, payload, private.combat_result(e.id));
end;
$fn$;
revoke all on function public.set_initiative(uuid, uuid, integer, integer, uuid) from public, anon;
grant execute on function public.set_initiative(uuid, uuid, integer, integer, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 20261114120000 plus: in app mode a Player's spent hit dice are the server roll of this rest.
-- ---------------------------------------------------------------------------------------------
create or replace function public.vote_rest(target_campaign uuid, target_request uuid, target_character uuid,
  vote_value text, spent integer, roll integer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; req public.rest_requests; ch public.characters;
  s public.character_sheets; x public.character_vitals; die integer; mode text;
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
    -- RYT-137: with dice in the app a Player's dice are the server's roll of this rest.
    select c.dice_mode into mode from public.campaigns c where c.id = target_campaign;
    if spent > 0 and not dm and mode = 'app' and not exists (
        select 1 from public.campaign_rolls r
         where r.campaign_id = target_campaign and r.character_id = ch.id and r.rest_id = req.id
           and r.kind = 'hit_die' and r.source = 'app' and r.superseded_at is null
           and cardinality(r.dice) = spent
           and (select sum(d)::integer from unnest(r.dice) d) = roll
           and r.expression ~ ('^' || case when spent = 1 then '1?' else spent::text end || 'd' || die::text
             || '([+-][0-9]{1,3})?$')) then
      raise exception 'Roll required' using errcode = 'P0001'; end if;
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
revoke all on function public.vote_rest(uuid, uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.vote_rest(uuid, uuid, uuid, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Retention (20261130120000 plus: linked rolls in force are kept)
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

  -- Rolls: nothing older than 30 days and the newest roll_cap per campaign, except a linked roll
  -- still in force (RYT-137: not superseded, its encounter live or its rest open).
  delete from public.campaign_rolls r where r.created_at < cutoff
    and not (r.superseded_at is null and (
      (r.encounter_id is not null and exists (select 1 from public.encounters e
        where e.campaign_id = r.campaign_id and e.id = r.encounter_id and e.status in ('initiative', 'active')))
      or (r.rest_id is not null and exists (select 1 from public.rest_requests q
        where q.campaign_id = r.campaign_id and q.id = r.rest_id and q.status = 'open'))));
  get diagnostics n = row_count; result := result || jsonb_build_object('campaign_rolls_expired', n);
  delete from public.campaign_rolls x
   using (select v.id, row_number() over (partition by v.campaign_id
            order by v.created_at desc, v.id desc) rank
          from public.campaign_rolls v) k
   where x.id = k.id and k.rank > roll_cap
     and not (x.superseded_at is null and (
       (x.encounter_id is not null and exists (select 1 from public.encounters e
         where e.campaign_id = x.campaign_id and e.id = x.encounter_id and e.status in ('initiative', 'active')))
       or (x.rest_id is not null and exists (select 1 from public.rest_requests q
         where q.campaign_id = x.campaign_id and q.id = x.rest_id and q.status = 'open'))));
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
  'RYT-114 retention: idempotency rows older than 30 days, account deletion requests older than 7 days; snapshots and unread log rows of encounters ended over 30 days ago (invisible leave events kept); rolls older than 30 days or beyond the newest rolls_per_campaign, campaign events beyond campaign_events_per_campaign. Linked rolls still in force are kept (RYT-137). Owner or scheduler only.';
$ddl$;
  missing text[];
begin
  execute ddl;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function private.prune_stale_rows() from service_role';
  end if;
  select coalesce(array_agg(x.name order by x.ord), '{}') into missing
    from (values
      (1, 'pre_admin.remap(text)', to_regprocedure('pre_admin.remap(text)') is not null),
      (2, 'pre.campaign_rolls', to_regclass('pre.campaign_rolls') is not null),
      (3, 'pre.campaign_roll_signals', to_regclass('pre.campaign_roll_signals') is not null),
      (4, 'pre.campaigns', to_regclass('pre.campaigns') is not null),
      (5, 'pre.characters', to_regclass('pre.characters') is not null),
      (6, 'pre.encounters', to_regclass('pre.encounters') is not null),
      (7, 'pre.encounter_combatants', to_regclass('pre.encounter_combatants') is not null),
      (8, 'pre.rest_requests', to_regclass('pre.rest_requests') is not null),
      (9, 'pre.campaign_events', to_regclass('pre.campaign_events') is not null),
      (10, 'pre_private.quota_limits', to_regclass('pre_private.quota_limits') is not null),
      (11, 'pre_private.campaign_requests', to_regclass('pre_private.campaign_requests') is not null),
      (12, 'pre_private.account_deletion_requests',
        to_regclass('pre_private.account_deletion_requests') is not null),
      (13, 'pre_private.quota_lock(text,uuid)', to_regprocedure('pre_private.quota_lock(text,uuid)') is not null),
      (14, 'pre_private.quota_limit(text)', to_regprocedure('pre_private.quota_limit(text)') is not null),
      (15, 'pre_private.roll_eval(text,smallint[])',
        to_regprocedure('pre_private.roll_eval(text,smallint[])') is not null),
      (16, 'pre_private.my_roll_scopes()', to_regprocedure('pre_private.my_roll_scopes()') is not null),
      (17, 'pre_private.is_campaign_member(uuid)',
        to_regprocedure('pre_private.is_campaign_member(uuid)') is not null),
      (18, 'pre_private.is_campaign_dm(uuid)', to_regprocedure('pre_private.is_campaign_dm(uuid)') is not null),
      (19, 'pre_private.combat_begin(uuid,uuid,jsonb)',
        to_regprocedure('pre_private.combat_begin(uuid,uuid,jsonb)') is not null),
      (20, 'pre_private.combat_finish(uuid,jsonb,jsonb)',
        to_regprocedure('pre_private.combat_finish(uuid,jsonb,jsonb)') is not null),
      (21, 'pre_private.combat_require_dm(uuid)',
        to_regprocedure('pre_private.combat_require_dm(uuid)') is not null),
      (22, 'pre_private.combat_log(pre.encounters,text,pre.encounter_combatants,integer,jsonb,jsonb,jsonb,boolean)',
        -- The argument types live in pre: resolve them only when they exist.
        case when to_regclass('pre.encounters') is not null and to_regclass('pre.encounter_combatants') is not null
          then to_regprocedure('pre_private.combat_log(pre.encounters,text,pre.encounter_combatants,integer,jsonb,jsonb,jsonb,boolean)') is not null
          else false end),
      (23, 'pre_private.combat_bump(uuid)', to_regprocedure('pre_private.combat_bump(uuid)') is not null),
      (24, 'pre_private.combat_result(uuid)', to_regprocedure('pre_private.combat_result(uuid)') is not null),
      (25, 'pre_private.prune_stale_rows()', to_regprocedure('pre_private.prune_stale_rows()') is not null),
      (26, 'pre.log_roll(uuid,uuid,text,text,text,text,smallint[],integer,uuid)',
        to_regprocedure('pre.log_roll(uuid,uuid,text,text,text,text,smallint[],integer,uuid)') is not null),
      (27, 'pre.set_initiative(uuid,uuid,integer,integer,uuid)',
        to_regprocedure('pre.set_initiative(uuid,uuid,integer,integer,uuid)') is not null),
      (28, 'pre.vote_rest(uuid,uuid,uuid,text,integer,integer)',
        to_regprocedure('pre.vote_rest(uuid,uuid,uuid,text,integer,integer)') is not null),
      (29, 'pre_private.combat_encounter(uuid,uuid)',
        to_regprocedure('pre_private.combat_encounter(uuid,uuid)') is not null),
      (30, 'pre_private.combat_combatant(pre.encounters,uuid)',
        case when to_regclass('pre.encounters') is not null
          then to_regprocedure('pre_private.combat_combatant(pre.encounters,uuid)') is not null
          else false end),
      (31, 'pre_private.combat_require_act(pre.encounter_combatants)',
        case when to_regclass('pre.encounter_combatants') is not null
          then to_regprocedure('pre_private.combat_require_act(pre.encounter_combatants)') is not null
          else false end),
      (32, 'pre_private.rest_votes', to_regclass('pre_private.rest_votes') is not null),
      (33, 'pre_private.rest_expire(uuid)', to_regprocedure('pre_private.rest_expire(uuid)') is not null),
      (34, 'pre_private.rest_settle(uuid)', to_regprocedure('pre_private.rest_settle(uuid)') is not null),
      (35, 'pre_private.rest_state(uuid,uuid)', to_regprocedure('pre_private.rest_state(uuid,uuid)') is not null),
      (36, 'pre_private.rest_int(jsonb,integer)',
        to_regprocedure('pre_private.rest_int(jsonb,integer)') is not null),
      (37, 'pre.character_sheets', to_regclass('pre.character_sheets') is not null),
      (38, 'pre.character_vitals', to_regclass('pre.character_vitals') is not null)
    ) x(ord, name, present)
    where not x.present;
  if cardinality(missing) = 0 then
    execute pre_admin.remap(ddl);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'revoke all on function pre_private.prune_stale_rows() from service_role';
    end if;
  else
    raise notice '20261204120000: PRE not updated, missing %', array_to_string(missing, ', ');
  end if;
end;
$oneroll$;
