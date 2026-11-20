-- RYT-142: the initiative modifier of a Player's app roll is capped by the character sheet, and a
-- DM re-roll of a hidden combatant is kept between the roller and the DM.
--
-- What.
-- 1. private.initiative_cap(campaign, character), stable: the initiative bonus the sheet allows,
--    the same rule as the client (domain/rules.ts initiativeBreakdown): the Dexterity modifier of
--    baseAbilities.dex + bonuses.dex (capped at 30), plus the proficiency bonus of the sheet's
--    level when a feature is named Alert or Alerta. A missing sheet allows 0.
-- 2. public.log_roll (latest definition 20261204120000, same signature and grants): for a server
--    initiative roll of a character made by someone who is not the campaign DM, a flat modifier
--    above the cap (never below +0, so a plain d20 always rolls) is refused with 'Initiative
--    bonus' (22023) and nothing is written. A lower modifier is accepted as before. DM rolls, recorded
--    rolls and every other kind are unchanged.
-- 3. public.reset_initiative_roll (latest definition 20261204120000, same signature and grants):
--    a re-roll of a hidden combatant at a table that shows rolls to everyone ('table') is stored
--    with visibility 'roller_dm', so no Player reads it; a narrower setting is kept as it is. It
--    was already unlinked from the encounter. Earlier rows: none in production on 2026-11-20.
--
-- How. Both functions are patched in place: their current definition is read with
-- pg_get_functiondef, the exact expected text must appear once (else the migration fails and
-- nothing changes), it is replaced and the definition executed again. CREATE OR REPLACE keeps the
-- owner, SECURITY DEFINER, search_path and grants; execute grants are restated anyway. The PRE
-- copies (pre.log_roll, pre.reset_initiative_roll) are patched the same way and call
-- pre_private.initiative_cap.
--
-- Rollout. The frontend in production sends the sheet's bonus, which the cap allows, except that
-- it computes Alert at level 1 (+2): a smaller modifier is accepted, so it keeps working. The new
-- frontend computes Alert at the sheet's level and names the refusal.
--
-- Security. initiative_cap is security definer with search_path '' and no execute for public,
-- anon or authenticated; it reads only the sheet of the character given by its callers, which
-- already checked membership and ownership. No table, policy, grant or data change.
do $migration$
declare
  ddl text := $ddl$
create or replace function private.initiative_cap(target_campaign uuid, target_character uuid)
returns integer language plpgsql stable security definer set search_path = '' as $fn$
begin
  -- plpgsql: a PRE refresh may copy this before the rest helpers it calls.
  return coalesce((
    select floor((least(30, private.rest_int(s.b -> 'baseAbilities' -> 'dex', 10)
        + private.rest_int(s.b -> 'bonuses' -> 'dex', 0)) - 10) / 2.0)::integer
      + case when exists (select 1 from jsonb_array_elements(
            case when jsonb_typeof(s.b -> 'features') = 'array' then s.b -> 'features' else '[]'::jsonb end) f
          where lower(btrim(f ->> 'name')) in ('alert', 'alerta'))
        then 2 + (greatest(1, coalesce(s.level, 1)) - 1) / 4 else 0 end
    from (select x.level, case when jsonb_typeof(x.build) = 'object' then x.build else '{}'::jsonb end b
        from public.character_sheets x
        where x.campaign_id = target_campaign and x.character_id = target_character) s), 0);
end;
$fn$;
revoke all on function private.initiative_cap(uuid, uuid) from public, anon, authenticated;
$ddl$;
  roll_old text := $old$      raise exception 'Invalid roll' using errcode = '22023'; end if;
    if target_character is not null and roll_kind = 'hit_die' then$old$;
  roll_new text := $new$      raise exception 'Invalid roll' using errcode = '22023'; end if;
    -- RYT-142: a Player's initiative modifier never exceeds what the sheet allows.
    if target_character is not null and roll_kind = 'initiative' and not dm
        and coalesce(substring(roll_expression from '[+-][0-9]{1,2}$')::integer, 0)
          > greatest(0, private.initiative_cap(target_campaign, target_character)) then
      raise exception 'Initiative bonus' using errcode = '22023'; end if;
    if target_character is not null and roll_kind = 'hit_die' then$new$;
  reset_old text := $old$        rolled, outcome, 'initiative', 'app', shown, case when c.hidden then null else e.id end)$old$;
  reset_new text := $new$        rolled, outcome, 'initiative', 'app', case when c.hidden and shown = 'table' then 'roller_dm' else shown end,
        case when c.hidden then null else e.id end)$new$;
  item record;
  src text;
begin
  -- A PRE without the rest helpers (a partial copy) gets neither the helper nor the patches;
  -- refreshing PRE from production brings both.
  if to_regnamespace('pre') is not null
      and to_regprocedure('pre_private.rest_int(jsonb,integer)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
  roll_old := replace(roll_old, chr(13), '');
  roll_new := replace(roll_new, chr(13), '');
  reset_old := replace(reset_old, chr(13), '');
  reset_new := replace(reset_new, chr(13), '');
  for item in
    select * from (values
      ('public.log_roll(uuid,uuid,text,text,text,text,smallint[],integer,uuid)', roll_old, roll_new, 'private.'),
      ('pre.log_roll(uuid,uuid,text,text,text,text,smallint[],integer,uuid)', roll_old, roll_new, 'pre_private.'),
      ('public.reset_initiative_roll(uuid,uuid,text,uuid)', reset_old, reset_new, 'private.'),
      ('pre.reset_initiative_roll(uuid,uuid,text,uuid)', reset_old, reset_new, 'pre_private.')
    ) v(fn, old_text, new_text, helper)
  loop
    if to_regprocedure(item.fn) is null
        or to_regprocedure(item.helper || 'initiative_cap(uuid,uuid)') is null then
      continue;
    end if;
    src := replace(pg_get_functiondef(item.fn::regprocedure), chr(13), '');
    if (char_length(src) - char_length(replace(src, item.old_text, ''))) / char_length(item.old_text) <> 1 then
      raise exception 'Unexpected body of %; not patched', item.fn;
    end if;
    execute replace(src, item.old_text,
      replace(item.new_text, 'private.initiative_cap', item.helper || 'initiative_cap'));
    execute format('revoke all on function %s from public, anon', item.fn);
    execute format('grant execute on function %s to authenticated', item.fn);
  end loop;
end;
$migration$;
