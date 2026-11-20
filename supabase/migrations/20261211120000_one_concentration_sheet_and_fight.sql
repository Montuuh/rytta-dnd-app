-- RYT-139: one concentration for the sheet and the fight.
-- The sheet keeps character_vitals.concentration (RYT-134) and the fight keeps
-- encounter_combatants.concentration (RYT-007). Until now they were two separate marks and the
-- sheet told the Player that the DM keeps their own. Now, while the character's encounter is live
-- (status initiative or active), a change of either is written to the other in the same
-- transaction, so the DM's concentration reminder on damage follows a spell cast from the sheet,
-- and ending concentration on either side ends both.
--
-- What.
-- 1. private.concentration_sheet_to_fight(), after update of concentration on character_vitals:
--    sets the same mark on the character's combatant in its live encounter (cut to the fight's 80
--    characters), bumps the combatant revision and writes one 'concentration' event to the combat
--    log (detail.from = 'sheet'; not undoable from the log, the sheet keeps its own undo). The
--    event is visible to the table only where get_combat_state shows that character's
--    concentration (live sharing on and no alias); otherwise it is the DM's.
-- 2. private.concentration_fight_to_sheet(), after update of concentration on
--    encounter_combatants: sets the same mark on the character's vitals (revision + 1) while the
--    encounter is live and the combatant is not hidden. A fight mark the sheet's rules refuse (character_vitals check: invisible
--    or control code points) leaves the sheet as it was instead of failing the combat action.
--    Ending a fight clears the fight marks after the encounter is already 'ended', so it does not
--    end the sheet's concentration; dropping to 0 hit points in the fight does end it.
-- 3. private.concentration_join_fight(): when an encounter becomes live, and before a character
--    combatant is added to a live encounter, the fight takes the sheet's current mark, so a spell
--    cast before the fight is there for the DM.
--    Each trigger returns at once when it runs inside another trigger (pg_trigger_depth() > 1),
--    so the two directions never call each other back.
-- Outside a live encounter nothing changes: the sheet's mark behaves as in RYT-134 and a long rest
-- still clears it. Writes still go only through the authorised, idempotent RPCs
-- (set_character_vitals, set_concentration, apply_combat_hp, set_encounter_status,
-- add_combatants, undo): a replayed request id changes nothing twice because the RPC returns
-- before any update. No RPC signature, table, policy or grant changes.
--
-- Security. The three functions are security definer with search_path '' and no execute for
-- public, anon or authenticated; they only copy the mark between the rows of the same campaign and
-- character that the authorised RPC is already writing. The new log events follow the
-- projection's rule for concentration (see 1). Known and unchanged here: set_concentration and
-- apply_combat_hp already log the spell name with the fight's own visibility.
--
-- Environments: a PRE with these tables gets the same DDL through pre_admin.remap.
do $migration$
declare ddl text := $ddl$
create or replace function private.concentration_sheet_to_fight() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare k public.encounter_combatants; e public.encounters; shared boolean;
  mark text := rtrim(left(new.concentration, 80));
begin
  if pg_trigger_depth() > 1 then return null; end if;
  for k in
    update public.encounter_combatants c set concentration = mark, revision = c.revision + 1
      from public.encounters x
      where c.campaign_id = new.campaign_id and c.character_id = new.character_id
        and x.campaign_id = c.campaign_id and x.id = c.encounter_id
        and x.status in ('initiative', 'active') and c.concentration is distinct from mark
      returning c.*
  loop
    select * into e from public.encounters where id = k.encounter_id;
    -- Shown in the fight's log only where the projection shows this character's concentration:
    -- a teammate that does not share live state, or plays under an alias, keeps it to the DM.
    select ch.shares_live into shared from public.characters ch
      where ch.campaign_id = k.campaign_id and ch.id = k.character_id;
    perform private.combat_log(e, 'concentration', k, null,
      jsonb_build_object('spell', mark, 'from', 'sheet'), null, null,
      coalesce(shared, false) and k.public_name is null);
  end loop;
  return null;
end;
$fn$;
revoke all on function private.concentration_sheet_to_fight() from public, anon, authenticated;

create or replace function private.concentration_fight_to_sheet() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  -- A hidden combatant stays out of the Player's own sheet (nothing shows it is in the fight).
  if pg_trigger_depth() > 1 or new.character_id is null or new.hidden then return null; end if;
  if not exists (select 1 from public.encounters x where x.campaign_id = new.campaign_id
      and x.id = new.encounter_id and x.status in ('initiative', 'active')) then
    return null;
  end if;
  begin
    update public.character_vitals v set concentration = new.concentration, revision = v.revision + 1
      where v.campaign_id = new.campaign_id and v.character_id = new.character_id
        and v.concentration is distinct from new.concentration;
  exception when check_violation then
    null;
  end;
  return null;
end;
$fn$;
revoke all on function private.concentration_fight_to_sheet() from public, anon, authenticated;

create or replace function private.concentration_join_fight() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'INSERT' then new else null end;
  end if;
  if tg_table_name = 'encounters' then
    -- The sheet decides, also when it has none (a mark left from before a return to draft goes).
    update public.encounter_combatants c set concentration = rtrim(left(v.concentration, 80)),
        revision = c.revision + 1
      from public.character_vitals v
      where c.encounter_id = new.id and c.character_id is not null
        and v.campaign_id = c.campaign_id and v.character_id = c.character_id
        and c.concentration is distinct from rtrim(left(v.concentration, 80));
    return null;
  end if;
  if new.character_id is not null and new.concentration is null and exists (
      select 1 from public.encounters x where x.campaign_id = new.campaign_id
        and x.id = new.encounter_id and x.status in ('initiative', 'active')) then
    select rtrim(left(v.concentration, 80)) into new.concentration from public.character_vitals v
      where v.campaign_id = new.campaign_id and v.character_id = new.character_id;
  end if;
  return new;
end;
$fn$;
revoke all on function private.concentration_join_fight() from public, anon, authenticated;

drop trigger if exists vitals_concentration_fight on public.character_vitals;
create trigger vitals_concentration_fight after update of concentration on public.character_vitals
  for each row when (old.concentration is distinct from new.concentration)
  execute function private.concentration_sheet_to_fight();
drop trigger if exists combatants_concentration_sheet on public.encounter_combatants;
create trigger combatants_concentration_sheet after update of concentration on public.encounter_combatants
  for each row when (old.concentration is distinct from new.concentration)
  execute function private.concentration_fight_to_sheet();
drop trigger if exists encounters_concentration_join on public.encounters;
create trigger encounters_concentration_join after update of status on public.encounters
  for each row when (old.status not in ('initiative', 'active') and new.status in ('initiative', 'active'))
  execute function private.concentration_join_fight();
drop trigger if exists combatants_concentration_join on public.encounter_combatants;
create trigger combatants_concentration_join before insert on public.encounter_combatants
  for each row execute function private.concentration_join_fight();
$ddl$;
begin
  if to_regclass('pre.encounter_combatants') is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'character_vitals' and column_name = 'concentration')
      and to_regprocedure('pre_private.combat_log(pre.encounters,text,pre.encounter_combatants,integer,jsonb,jsonb,jsonb,boolean)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;
