-- RYT-129: the combat summary credits damage dealt only between opposing sides.
-- Before, damage was credited to whoever held the turn, so the DM downing a Player on another
-- Player's turn counted as that Player's damage (audit finding J4-14). Now damage is credited
-- to the turn holder only when the target is on the other side (party and allies against
-- enemies); damage to an ally or to oneself, healing and temporary hit points never count.
-- Security: replaces one private security-definer helper with the same signature; execute stays
-- revoked from public, anon and authenticated. No table, policy or grant changes; summaries of
-- encounters that already ended are left as they were (no data rewrite).
do $migration$
declare ddl text := $ddl$
create or replace function private.combat_summary(target_encounter uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
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
          join public.encounter_combatants t on t.id = x.target_combatant
          where x.encounter_id = e.id and x.source_combatant = c.id and x.kind = 'damage'
            and x.undone_by is null and t.id <> c.id
            and (t.side = 'enemy') <> (c.side = 'enemy')), 0),
        'healing', coalesce((select sum(x.amount) from public.encounter_events x
          where x.encounter_id = e.id and x.target_combatant = c.id and x.kind = 'heal'
            and x.undone_by is null), 0),
        'downed', exists (select 1 from public.encounter_events x
          where x.encounter_id = e.id and x.target_combatant = c.id and x.undone_by is null
            and x.kind = 'damage' and (x.after_state ->> 'hp')::integer = 0))
      order by c.side, c.name, c.id)
      from public.encounter_combatants c where c.encounter_id = e.id), '[]'::jsonb))
  from public.encounters e where e.id = target_encounter;
$fn$;
revoke all on function private.combat_summary(uuid) from public, anon, authenticated;
$ddl$;
begin
  if to_regnamespace('pre') is not null then execute pre_admin.remap(ddl); end if;
  execute ddl;
end;
$migration$;
