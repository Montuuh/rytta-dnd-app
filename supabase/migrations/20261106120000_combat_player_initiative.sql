-- RYT-042: Players enter their own initiative from the table view, only while it is collected.
--
-- set_initiative keeps its signature, grants, idempotency and campaign lock. One rule is added for
-- Players (callers that are not an active DM of the campaign): they set the total of their own
-- character (unchanged: private.combat_require_act, i.e. characters whose user_id is the caller)
-- while the encounter collects initiative, and once the fight is active only when that character
-- still has no total (a late joiner). Changing an existing total mid-fight reorders the turns, so
-- it stays a DM action ("change initiative" in the console). The refusal is 'Initiative closed'.
--
-- Actor matrix: anon cannot execute; outsiders and inactive members raise Forbidden; a DM of
-- another campaign raises Combatant unavailable through its own campaign id; Players raise
-- Forbidden for any combatant they do not play (teammates, NPCs) and Combatant unavailable for
-- hidden ones; drafts and ended encounters stay closed to Players. The DM is unchanged.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has
-- the combat RPCs, the same DDL is executed again remapped with pre_admin.remap.

do $initiative$
declare ddl text := $ddl$
create or replace function public.set_initiative(target_campaign uuid, target_combatant uuid, initiative_total integer,
  tiebreak_bonus integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('initiative', target_campaign, target_combatant, initiative_total,
    tiebreak_bonus);
  replay jsonb; e public.encounters; c public.encounter_combatants; dm boolean;
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
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre.set_initiative(uuid,uuid,integer,integer,uuid)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$initiative$;
