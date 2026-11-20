-- RYT-145: encounter preparation and the handoff between sessions.
-- Anonymous callers have no access. Outsiders, inactive members and DMs of other
-- campaigns cannot read or write. Members may read only the explicitly published
-- recap. All other reads and writes require the campaign DM. The underlying rows
-- stay outside the exposed schemas; no realtime payload or Player projection changes.
do $migration$
declare ddl text := $ddl$
-- A copy may create at most as many combatants as one existing add_combatants call
-- (30 entries of up to 20 creatures). Existing oversized drafts remain editable.
insert into private.quota_limits(quota,max_count) values ('combatants_per_draft_copy',600);
create table private.encounter_plans (
  campaign_id uuid not null,
  encounter_id uuid primary key,
  scene_id uuid,
  reward text not null default '' check (char_length(reward) <= 2000),
  attendance_set boolean not null default false,
  foreign key (campaign_id, encounter_id) references public.encounters(campaign_id,id) on delete cascade,
  foreign key (campaign_id, scene_id) references public.tabletop_scenes(campaign_id,id) on delete set null (scene_id)
);
create index encounter_plans_scene on private.encounter_plans(campaign_id,scene_id) where scene_id is not null;
create table private.session_handoffs (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  encounter_id uuid,
  private_note text not null check (char_length(private_note) <= 2000),
  next_scene text not null check (char_length(next_scene) <= 2000),
  pending_reward text not null check (char_length(pending_reward) <= 2000),
  revision bigint not null check (revision > 0),
  foreign key (campaign_id, encounter_id) references public.encounters(campaign_id,id) on delete set null (encounter_id)
);
create table private.session_publications (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  recap text not null check (char_length(recap) between 1 and 2000)
);
alter table private.encounter_plans enable row level security;
alter table private.session_handoffs enable row level security;
alter table private.session_publications enable row level security;
revoke all on private.encounter_plans,private.session_handoffs,private.session_publications from public,anon,authenticated;

create function public.get_encounter_plan(target_campaign uuid, target_encounter uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare plan private.encounter_plans;
begin
  perform private.combat_require_dm(target_campaign);
  if not exists (select from public.encounters where campaign_id=target_campaign and id=target_encounter) then
    raise exception 'Encounter unavailable' using errcode='42501';
  end if;
  select * into plan from private.encounter_plans where encounter_id=target_encounter and campaign_id=target_campaign;
  return jsonb_build_object('sceneId',plan.scene_id,'reward',coalesce(plan.reward,''),
    'attendanceSet',coalesce(plan.attendance_set,false),'scenes',coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name,s.id)
      from public.tabletop_scenes s where s.campaign_id=target_campaign),'[]'::jsonb));
end;
$fn$;

create function public.save_encounter_plan(target_campaign uuid,target_encounter uuid,expected_revision bigint,
  target_scene uuid,planned_reward text,attendees uuid[],request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare payload jsonb := jsonb_build_array('encounter_plan',target_campaign,target_encounter,expected_revision,target_scene,
    private.content_digest(to_jsonb(planned_reward)),attendees);
  replay jsonb; e public.encounters; entries jsonb; departing uuid; reward_text text;
begin
  perform private.combat_require_dm(target_campaign);
  replay := private.combat_begin(target_campaign,request_id,payload);
  if replay is not null then return replay; end if;
  e := private.combat_encounter(target_campaign,target_encounter);
  if e.status <> 'draft' then raise exception 'Encounter closed' using errcode='P0001'; end if;
  if e.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode='P0001'; end if;
  reward_text := private.check_text(planned_reward,2000,true);
  if target_scene is not null and not exists(select from public.tabletop_scenes where campaign_id=target_campaign and id=target_scene) then
    raise exception 'Scene unavailable' using errcode='42501'; end if;
  if attendees is not null then
    if cardinality(attendees)>private.quota_limit('characters_per_campaign') or exists
      (select from unnest(attendees) a(id) left join public.characters c
      on c.campaign_id=target_campaign and c.id=a.id and c.archived_at is null and c.is_active and not c.absent where c.id is null)
      or cardinality(attendees) <> (select count(distinct id) from unnest(attendees) a(id)) then
      raise exception 'Invalid request' using errcode='22023'; end if;
    for departing in select c.id from public.encounter_combatants c where c.encounter_id=e.id and c.kind='character'
      and not(c.character_id=any(attendees)) loop
      perform public.remove_combatant(target_campaign,departing,gen_random_uuid());
    end loop;
    for entries in select jsonb_agg(jsonb_build_object('kind','character','character_id',batch.id) order by batch.position)
      from (select a.id,row_number() over(order by a.id) as position from unnest(attendees) a(id)
        where not exists(select from public.encounter_combatants c where c.encounter_id=e.id and c.character_id=a.id)) batch
      group by (batch.position-1)/30 loop
      perform public.add_combatants(target_campaign,e.id,entries,gen_random_uuid());
    end loop;
  end if;
  insert into private.encounter_plans as p(campaign_id,encounter_id,scene_id,reward,attendance_set)
    values(target_campaign,e.id,target_scene,reward_text,attendees is not null)
    on conflict(encounter_id) do update set scene_id=excluded.scene_id,reward=excluded.reward,
      attendance_set=p.attendance_set or excluded.attendance_set;
  perform private.combat_bump(e.id);
  return private.combat_finish(request_id,payload,private.combat_result(e.id));
end;
$fn$;

create function public.duplicate_encounter_plan(target_campaign uuid,target_encounter uuid,encounter_name text,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare payload jsonb := jsonb_build_array('duplicate_encounter_plan',target_campaign,target_encounter,encounter_name);
  replay jsonb; e public.encounters; new_id uuid;
begin
  perform private.combat_require_dm(target_campaign);
  replay := private.combat_begin(target_campaign,request_id,payload);
  if replay is not null then return replay; end if;
  e := private.combat_encounter(target_campaign,target_encounter);
  if e.status <> 'draft' then raise exception 'Encounter closed' using errcode='P0001'; end if;
  if exists(select from public.encounter_combatants c where c.encounter_id=e.id
    offset private.quota_limit('combatants_per_draft_copy') limit 1) then
    raise exception 'Draft copy limit' using errcode='22023'; end if;
  new_id := (public.create_encounter(target_campaign,encounter_name,gen_random_uuid())->>'encounter_id')::uuid;
  insert into private.encounter_plans(campaign_id,encounter_id,scene_id,reward,attendance_set)
    select target_campaign,new_id,scene_id,reward,attendance_set from private.encounter_plans where encounter_id=e.id;
  insert into public.encounter_combatants(campaign_id,encounter_id,kind,character_id,side,name,initiative,initiative_bonus,
    order_key,group_key,max_hp,current_hp,armor_class,hidden,hp_revealed,legendary_max,dm_notes,template_id,public_name,srd_id,trackers)
    select target_campaign,new_id,c.kind,c.character_id,c.side,c.name,case when c.kind='lair' then 20 end,c.initiative_bonus,
      c.order_key,c.group_key,c.max_hp,c.max_hp,c.armor_class,c.hidden,c.hp_revealed,c.legendary_max,c.dm_notes,
      c.template_id,c.public_name,c.srd_id,private.bestiary_trackers(c.trackers)
    from public.encounter_combatants c where c.encounter_id=e.id and (c.character_id is null or exists(
      select from public.characters ch where ch.campaign_id=target_campaign and ch.id=c.character_id
      and ch.archived_at is null and ch.is_active and not ch.absent));
  return private.combat_finish(request_id,payload,private.combat_result(new_id));
end;
$fn$;

create function public.get_shared_session_recap(target_campaign uuid)
returns text language plpgsql stable security definer set search_path='' as $fn$
begin
  if auth.uid() is null or not private.is_campaign_member(target_campaign) then raise exception 'Forbidden' using errcode='42501'; end if;
  return coalesce((select recap from private.session_publications where campaign_id=target_campaign),'');
end;
$fn$;

create function public.get_session_continuity(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare h private.session_handoffs; recent public.encounters; scene_name text; reward_text text;
begin
  perform private.combat_require_dm(target_campaign);
  select * into h from private.session_handoffs where campaign_id=target_campaign;
  if h.campaign_id is null then
    select * into recent from public.encounters where campaign_id=target_campaign and status='ended' order by ended_at desc nulls last,id limit 1;
    select p.reward into reward_text from private.encounter_plans p where p.encounter_id=recent.id;
    select s.name into scene_name from public.encounters e join private.encounter_plans p on p.encounter_id=e.id
      join public.tabletop_scenes s on s.campaign_id=e.campaign_id and s.id=p.scene_id
      where e.campaign_id=target_campaign and e.status='draft' order by e.updated_at desc,e.id limit 1;
  else
    select * into recent from public.encounters where id=h.encounter_id and campaign_id=target_campaign;
  end if;
  return jsonb_build_object('lastEncounter',case when recent.id is not null then jsonb_build_object('id',recent.id,'name',recent.name) end,
    'privateNote',coalesce(h.private_note,''),'nextScene',coalesce(h.next_scene,scene_name,''),'pendingReward',coalesce(h.pending_reward,reward_text,''),
    'sharedRecap',public.get_shared_session_recap(target_campaign),'revision',coalesce(h.revision,0));
end;
$fn$;

create function public.save_session_continuity(target_campaign uuid,expected_revision bigint,target_encounter uuid,use_latest boolean,
  private_note text,next_scene text,pending_reward text,shared_recap text,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare payload jsonb := jsonb_build_array('session_continuity',target_campaign,expected_revision,target_encounter,use_latest,
    private.content_digest(jsonb_build_array(private_note,next_scene,pending_reward,shared_recap)));
  replay jsonb; current_revision bigint; encounter uuid := target_encounter; publish text;
begin
  perform private.combat_require_dm(target_campaign);
  replay := private.combat_begin(target_campaign,request_id,payload);
  if replay is not null then return replay; end if;
  select h.revision into current_revision from private.session_handoffs h where h.campaign_id=target_campaign;
  if coalesce(current_revision,0) is distinct from expected_revision then raise exception 'Stale revision' using errcode='P0001'; end if;
  if use_latest then
    select e.id into encounter from public.encounters e where e.campaign_id=target_campaign and e.status='ended' order by e.ended_at desc nulls last,e.id limit 1;
  elsif encounter is not null and not exists(select from public.encounters where id=encounter and campaign_id=target_campaign) then
    raise exception 'Encounter unavailable' using errcode='42501'; end if;
  insert into private.session_handoffs(campaign_id,encounter_id,private_note,next_scene,pending_reward,revision)
    values(target_campaign,encounter,private.check_text(private_note,2000,true),private.check_text(next_scene,2000,true),
      private.check_text(pending_reward,2000,true),expected_revision+1)
    on conflict(campaign_id) do update set encounter_id=excluded.encounter_id,private_note=excluded.private_note,
      next_scene=excluded.next_scene,pending_reward=excluded.pending_reward,revision=excluded.revision;
  publish := private.check_text(shared_recap,2000,true);
  if publish='' then delete from private.session_publications where campaign_id=target_campaign;
  else insert into private.session_publications(campaign_id,recap) values(target_campaign,publish)
    on conflict(campaign_id) do update set recap=excluded.recap;
  end if;
  return private.combat_finish(request_id,payload,jsonb_build_object('revision',expected_revision+1));
end;
$fn$;

revoke all on function public.get_encounter_plan(uuid,uuid),public.save_encounter_plan(uuid,uuid,bigint,uuid,text,uuid[],uuid),
  public.duplicate_encounter_plan(uuid,uuid,text,uuid),public.get_session_continuity(uuid),public.get_shared_session_recap(uuid),
  public.save_session_continuity(uuid,bigint,uuid,boolean,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.get_encounter_plan(uuid,uuid),public.save_encounter_plan(uuid,uuid,bigint,uuid,text,uuid[],uuid),
  public.duplicate_encounter_plan(uuid,uuid,text,uuid),public.get_session_continuity(uuid),public.get_shared_session_recap(uuid),
  public.save_session_continuity(uuid,bigint,uuid,boolean,text,text,text,text,uuid) to authenticated;
$ddl$;
begin
  if to_regnamespace('pre') is not null then execute pre_admin.remap(ddl); end if;
  execute ddl;
end;
$migration$;
