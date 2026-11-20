-- RYT-145: full referencing indexes for session preparation and continuity.
-- Cover composite FK lookups during a campaign, encounter or scene deletion in both
-- environments. The role grants, tables and previously applied migration stay intact.
do $migration$
declare ddl text := $ddl$
create index encounter_plans_encounter_fk on private.encounter_plans(campaign_id,encounter_id);
create index encounter_plans_scene_fk on private.encounter_plans(campaign_id,scene_id);
create index session_handoffs_encounter_fk on private.session_handoffs(campaign_id,encounter_id);
$ddl$;
begin
  if to_regnamespace('pre') is not null then execute pre_admin.remap(ddl); end if;
  execute ddl;
end;
$migration$;
