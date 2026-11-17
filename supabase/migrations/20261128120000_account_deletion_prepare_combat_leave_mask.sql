-- RYT-115 and RYT-118 follow-up: closes the non-blocking review findings of 20261125120000 and
-- 20261126120000. Additive: no row or stored object is removed or rewritten at apply time. Two
-- columns are added to private.account_deletion_requests (result becomes nullable) and functions
-- are replaced with the same signatures, plus one new RPC.
--
-- 1. public.prepare_account_deletion(request_id) runs before the browser removes Storage objects.
--    Under the same per-user advisory lock and campaign row locks as delete_my_account it returns
--    one snapshot: blockers (as account_deletion_blockers), campaigns (the solo campaigns the
--    deletion will delete), storage_paths (as account_storage_paths, at most 5000) and
--    revoked_invitations. When there are no blockers it revokes every pending invitation of those
--    solo campaigns (status 'revoked', as revoke_campaign_invitation does) so nobody can join
--    between the Storage cleanup and the deletion, and records the campaign set under the request
--    id. With blockers it changes nothing. delete_my_account now requires a prepared request
--    ('Account deletion not prepared' otherwise) and, before any write, raises 'Account deletion
--    blocked' when its current solo set differs from the prepared one (a prepared campaign that
--    still has the caller but is no longer solo, or a new solo campaign whose Storage was not
--    cleared). A replay of a completed request still returns the stored result.
-- 2. private.prune_stale_rows() also deletes account_deletion_requests rows older than 7 days
--    (they hold an md5 digest of the user id and campaign ids). It keeps everything else it did,
--    and keeps the invisible 'leave' events of ended encounters (see 6). No execute for API roles.
-- 3. private.storage_quota_ok: a campaign without owner (owner_id null after a direct Auth
--    deletion) explicitly gets the per-campaign byte limit only; before, a null comparison skipped
--    the owner total by accident. Accepted: after delete_my_account hands a campaign to another
--    DM, the new owner can exceed campaigns_per_owner (the quota is only checked on create) and
--    their media_mb_per_owner total then includes the handed-over campaign, so new uploads may be
--    refused until media is removed.
-- 4. Checked, unchanged: release_member_characters and delete_my_account set
--    is_active = (archived_at is null and not absent); change_campaign_member (latest definition
--    20261105130000) sets is_active = (archived_at is null). characters.absent is a character
--    flag, not a membership state, and private.characters_absence_rules forces is_active = false
--    on an absent row (constraint characters_absent_inactive), so both produce the same rows.
-- 5. delete_my_account reports deleted = true only when nothing of the account remains in the
--    environment: auth_user 'deleted' or 'absent' (production) or 'shared' (PRE, by design).
--    With 'disabled' or 'kept' the application data is gone but deleted = false;
--    data_deleted = true is reported in every case. Field names are unchanged.
-- 6. Combat log for Players and the table (get_combat_state, same signature and grants):
--    private.combat_log records hidden_at_leave = true in the detail of the 'leave' event of a
--    combatant removed while hidden (that event is invisible, as before). Events of a removed
--    combatant whose leave event is invisible or carries hidden_at_leave stay out of the Players'
--    log, so earlier visible events no longer reappear with the real name. The alias lookup of a
--    removed combatant reads visible events only, so an alias set while hidden is never shown.
--    Events written before this migration are not rewritten: removals whose invisible leave event
--    still exists are covered (combat_log has always made events of a hidden target invisible);
--    leave events already deleted by an earlier prune are not.
-- 7. class_key: the owning Player (off the table screen) now receives it for their own aliased
--    character, as every other own field. The table screen still masks it.
--
-- Actor matrix (changed objects):
--   anon: no execute on prepare_account_deletion, delete_my_account or get_combat_state.
--   outsider / DM of another campaign: prepare and delete only touch rows tied to auth.uid();
--          get_combat_state raises Forbidden through the membership check.
--   Player: prepare returns their own blockers (none for Players) and never revokes invitations
--          of campaigns they do not run alone; reads the masked combat projection.
--   own DM: prepare revokes pending invitations only of campaigns where they are the only member.
-- Every function is security definer with search_path ''; private.prune_stale_rows and
-- private.combat_log keep no execute for public, anon, authenticated (and service_role).
--
-- Environments: production runs the DDL on public / private. A PRE that has the RYT-115 objects
-- (pre.delete_my_account, pre_private.account_deletion_requests), pre_private.prune_stale_rows and
-- the aliased combat projection receives the same DDL through pre_admin.remap; it is idempotent.
-- storage_quota_ok is global and stays outside the remapped DDL, as in 20261124120000.

do $m$
declare ddl text := $ddl$
alter table private.account_deletion_requests alter column result drop not null;
alter table private.account_deletion_requests add column if not exists prepared_campaigns uuid[];
create index if not exists account_deletion_requests_created_at
  on private.account_deletion_requests(created_at);
comment on table private.account_deletion_requests is
  'RYT-115: prepared snapshots and replay results of delete_my_account. actor_digest is md5 of the user id, never the id. Pruned after 7 days.';

create or replace function public.prepare_account_deletion(request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); digest text; prior private.account_deletion_requests;
  blockers jsonb; solo uuid[]; revoked integer := 0; paths jsonb;
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  digest := md5(viewer::text);
  perform pg_advisory_xact_lock(hashtextextended('delete_my_account:' || viewer::text, 115));
  select * into prior from private.account_deletion_requests r
    where r.request_id = prepare_account_deletion.request_id;
  if prior.request_id is not null and prior.actor_digest <> digest then
    raise exception 'Request mismatch' using errcode = '22023'; end if;
  if prior.result is not null then
    return jsonb_build_object('blockers', '[]'::jsonb, 'campaigns', '[]'::jsonb,
      'storage_paths', '[]'::jsonb, 'revoked_invitations', 0);
  end if;

  -- Same locks as delete_my_account and every membership change (accepting an invitation too).
  perform 1 from public.campaigns c where c.id in (select m.campaign_id from public.campaign_members m
    where m.user_id = viewer) or c.owner_id = viewer order by c.id for update;
  select coalesce(jsonb_agg(jsonb_build_object('campaign_id', b.campaign_id,
      'campaign_name', b.campaign_name, 'other_members', b.other_members)), '[]'::jsonb)
    into blockers from private.account_blockers(viewer) b;
  if jsonb_array_length(blockers) > 0 then
    return jsonb_build_object('blockers', blockers, 'campaigns', '[]'::jsonb,
      'storage_paths', '[]'::jsonb, 'revoked_invitations', 0);
  end if;

  solo := array(select private.account_solo_campaigns(viewer));
  if cardinality(solo) > 0 then
    update public.campaign_invitations set status = 'revoked'
      where campaign_id = any(solo) and status = 'pending';
    get diagnostics revoked = row_count;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket_id', p.bucket_id, 'object_path', p.object_path,
      'campaign_id', p.campaign_id) order by p.bucket_id, p.object_path), '[]'::jsonb)
    into paths from public.account_storage_paths() p;
  -- The advisory lock serializes this caller's requests, so a plain insert or update suffices.
  if prior.request_id is null then
    insert into private.account_deletion_requests(request_id, actor_digest, result, prepared_campaigns)
      values (prepare_account_deletion.request_id, digest, null, solo);
  else
    update private.account_deletion_requests r set prepared_campaigns = solo
      where r.request_id = prepare_account_deletion.request_id;
  end if;
  return jsonb_build_object('blockers', blockers, 'campaigns', to_jsonb(solo),
    'storage_paths', paths, 'revoked_invitations', revoked);
end;
$fn$;

create or replace function public.delete_my_account(confirmation text, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); env constant text := split_part('public.campaigns', '.', 1);
  digest text; prior private.account_deletion_requests; my_email text := private.verified_email();
  solo uuid[]; kept uuid[]; owned record; auth_state text := 'shared'; outcome jsonb;
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  if confirmation is distinct from 'DELETE' then
    raise exception 'Confirmation required' using errcode = '22023'; end if;
  digest := md5(viewer::text);
  perform pg_advisory_xact_lock(hashtextextended('delete_my_account:' || viewer::text, 115));
  select * into prior from private.account_deletion_requests r
    where r.request_id = delete_my_account.request_id;
  if prior.request_id is not null and prior.actor_digest <> digest then
    raise exception 'Request mismatch' using errcode = '22023'; end if;
  if prior.result is not null then return prior.result; end if;

  perform 1 from public.campaigns c where c.id in (select m.campaign_id from public.campaign_members m
    where m.user_id = viewer) or c.owner_id = viewer order by c.id for update;
  if exists (select 1 from private.account_blockers(viewer)) then
    raise exception 'Account deletion blocked' using errcode = 'P0001',
      hint = 'Hand over or remove the members of the campaigns listed by account_deletion_blockers.';
  end if;
  if prior.request_id is null then
    raise exception 'Account deletion not prepared' using errcode = '22023',
      hint = 'Call prepare_account_deletion with this request id first.';
  end if;
  solo := array(select private.account_solo_campaigns(viewer));
  -- The Storage objects removed after prepare_account_deletion belong to the prepared set: a
  -- campaign that stopped being solo, or became solo since, refuses the whole deletion.
  if exists (select 1 from unnest(coalesce(prior.prepared_campaigns, '{}')) p(id)
        where not (p.id = any(solo)) and exists (select 1 from public.campaign_members m
          where m.campaign_id = p.id and m.user_id = viewer and m.active))
      or exists (select 1 from unnest(solo) s(id)
        where not (s.id = any(coalesce(prior.prepared_campaigns, '{}')))) then
    raise exception 'Account deletion blocked' using errcode = 'P0001',
      hint = 'Campaign membership changed since prepare_account_deletion; prepare again.';
  end if;

  -- From here on the writes are system writes (no JWT subject) for triggers and audit rows.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  -- Campaigns where the caller is alone: delete with their data. Rows whose foreign keys do not
  -- cascade from the campaign go first.
  if cardinality(solo) > 0 then
    delete from public.character_events where campaign_id = any(solo);
    delete from public.inventory_events where campaign_id = any(solo);
    delete from private.resource_requests r using public.characters ch
      where ch.id = r.character_id and ch.campaign_id = any(solo);
    delete from public.campaign_invitations where campaign_id = any(solo);
    delete from public.shop_orders where campaign_id = any(solo);
    delete from public.item_proposals where campaign_id = any(solo);
    delete from public.inventory_items where campaign_id = any(solo);
    delete from public.shops where campaign_id = any(solo);
    delete from public.campaigns where id = any(solo);
  end if;

  -- Other campaigns: hand over ownership, return characters to the pool, remove the membership.
  -- The new owner is not checked against campaigns_per_owner (accepted: the quota guards creation).
  kept := array(select m.campaign_id from public.campaign_members m where m.user_id = viewer
    order by m.campaign_id);
  for owned in select c.id from public.campaigns c where c.owner_id = viewer loop
    update public.campaigns set owner_id = (select m.user_id from public.campaign_members m
        where m.campaign_id = owned.id and m.active and m.role = 'dm' and m.user_id <> viewer
        order by m.joined_at, m.user_id limit 1)
      where id = owned.id;
  end loop;
  update public.characters set user_id = null, is_active = (archived_at is null and not absent)
    where user_id = viewer;
  if my_email is not null then
    delete from public.campaign_invitations where campaign_invitations.email = my_email;
  end if;
  update public.campaign_invitations set created_by = null where created_by = viewer;
  update public.campaign_invitations set responded_by = null where responded_by = viewer;
  delete from public.campaign_members where user_id = viewer;

  -- Authored and acted rows stay, without the user reference.
  update public.character_events set actor_id = null where actor_id = viewer;
  update public.character_events set
      before_value = case when before_value ->> 'user_id' = viewer::text
        then jsonb_set(before_value, '{user_id}', 'null'::jsonb) else before_value end,
      after_value = case when after_value ->> 'user_id' = viewer::text
        then jsonb_set(after_value, '{user_id}', 'null'::jsonb) else after_value end
    where kind like 'characters:%'
      and (before_value ->> 'user_id' = viewer::text or after_value ->> 'user_id' = viewer::text);
  update public.inventory_events set actor_id = null where actor_id = viewer;
  update public.shop_orders set actor_id = null where actor_id = viewer;
  update public.shop_orders set closed_by = null where closed_by = viewer;
  update public.trades set created_by = null where created_by = viewer;
  update public.trades set closed_by = null where closed_by = viewer;
  update public.encounters set created_by = null where created_by = viewer;
  update public.encounter_effects set created_by = null where created_by = viewer;
  update public.encounter_events set actor_id = null where actor_id = viewer;
  update public.item_definitions set created_by = null where created_by = viewer;
  update public.item_proposals set proposed_by = null where proposed_by = viewer;
  update public.item_proposals set resolved_by = null where resolved_by = viewer;
  update public.glossary_entries set created_by = null where created_by = viewer;
  update public.glossary_entries set updated_by = null where updated_by = viewer;
  update public.tabletop_scenes set created_by = null where created_by = viewer;
  update public.content_packs set owner_id = null where owner_id = viewer;
  update public.content_entries set updated_by = null where updated_by = viewer;
  update public.rest_requests set requested_by = null where requested_by = viewer;
  update public.rest_requests set resolved_by = null where resolved_by = viewer;
  update private.rest_votes set voted_by = null where voted_by = viewer;

  -- Personal rows.
  delete from private.character_requests where actor_id = viewer;
  delete from private.combat_requests where actor_id = viewer;
  delete from private.content_requests where actor_id = viewer;
  delete from private.inventory_requests where actor_id = viewer;
  delete from private.resource_requests where actor_id = viewer;
  delete from private.sheet_requests where actor_id = viewer;
  delete from private.tabletop_requests where actor_id = viewer;
  delete from private.content_editors where user_id = viewer;
  delete from public.profiles where user_id = viewer;

  -- The Auth user is shared by both environments: only production removes it.
  if env = 'public' and to_regclass('auth.users') is not null then
    begin
      delete from auth.users where id = viewer;
      auth_state := case when found then 'deleted' else 'absent' end;
    exception when foreign_key_violation or insufficient_privilege or restrict_violation then
      auth_state := 'kept';
      begin
        if exists (select 1 from pg_attribute a where a.attrelid = to_regclass('auth.users')
            and a.attname = 'banned_until' and a.attnum > 0 and not a.attisdropped) then
          execute 'update auth.users set banned_until = now() + interval ''100 years'' where id = $1'
            using viewer;
          auth_state := 'disabled';
        end if;
        if to_regclass('auth.sessions') is not null then
          execute 'delete from auth.sessions where user_id = $1' using viewer;
        end if;
      exception when insufficient_privilege then null;
      end;
    end;
  end if;

  -- deleted: nothing of the account is left in this environment ('disabled' and 'kept' keep the
  -- Auth user). data_deleted: the application data is gone, always true here.
  outcome := jsonb_build_object('deleted', auth_state in ('deleted', 'absent', 'shared'),
    'data_deleted', true, 'environment', env, 'auth_user', auth_state,
    'campaigns_deleted', to_jsonb(solo), 'campaigns_left', to_jsonb(kept));
  update private.account_deletion_requests r set result = outcome
    where r.request_id = delete_my_account.request_id;
  return outcome;
end;
$fn$;

comment on function public.prepare_account_deletion(uuid) is
  'RYT-115: blockers, solo campaigns and their Storage paths in one snapshot; revokes pending invitations of those campaigns when nothing blocks.';
comment on function public.delete_my_account(text, uuid) is
  'RYT-115: deletes the caller''s account data after prepare_account_deletion (confirmation ''DELETE'', idempotent request id); production also removes the Auth user when permitted.';
revoke all on function public.prepare_account_deletion(uuid), public.delete_my_account(text, uuid)
  from public, anon;
grant execute on function public.prepare_account_deletion(uuid), public.delete_my_account(text, uuid)
  to authenticated;

-- Retention (20261123120000), plus the account deletion requests after 7 days. Invisible 'leave'
-- events of ended encounters are kept: they keep a combatant removed while hidden out of the log.
create or replace function private.prune_stale_rows() returns jsonb
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  cutoff timestamptz := now() - interval '30 days';
  log_cap constant integer := 60;
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
  delete from private.account_deletion_requests r where r.created_at < now() - interval '7 days';
  get diagnostics n = row_count; result := result || jsonb_build_object('account_deletion_requests', n);

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
  'RYT-114 retention: idempotency rows older than 30 days, account deletion requests older than 7 days; snapshots and unread log rows of encounters ended over 30 days ago (invisible leave events kept). Owner or scheduler only.';

create or replace function private.combat_log(e public.encounters, event_kind text,
  target public.encounter_combatants, event_amount integer, event_detail jsonb, before_snapshot jsonb,
  after_snapshot jsonb, is_visible boolean) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare new_id uuid;
begin
  insert into public.encounter_events(campaign_id, encounter_id, round, kind, actor_id, source_combatant,
    target_combatant, target_name, amount, detail, before_state, after_state, visible)
  values (e.campaign_id, e.id, e.round, event_kind, auth.uid(), e.active_combatant, target.id, target.name,
    event_amount, coalesce(event_detail, '{}'::jsonb)
      -- RYT-118: the alias outlives the combatant, so a removed one never shows its real name.
      || case when target.public_name is not null
        then jsonb_build_object('target_alias', target.public_name) else '{}'::jsonb end
      -- A combatant removed while hidden stays out of the Players' log after it is gone.
      || case when event_kind = 'leave' and coalesce(target.hidden, false)
        then jsonb_build_object('hidden_at_leave', true) else '{}'::jsonb end,
    before_snapshot, after_snapshot, is_visible and not coalesce(target.hidden, false))
  returning id into new_id;
  return new_id;
end;
$fn$;
revoke all on function private.combat_log(public.encounters, text, public.encounter_combatants, integer,
  jsonb, jsonb, jsonb, boolean) from public, anon, authenticated;

create or replace function public.get_combat_state(target_campaign uuid, target_encounter uuid, as_table boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
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
        -- ADR 028: Players and the table read the alias of a creature that still has one.
        else e.summary || jsonb_build_object('combatants', coalesce((select jsonb_agg(s.value
            || case when c.public_name is not null then jsonb_build_object('name', c.public_name)
              else '{}'::jsonb end)
          from jsonb_array_elements(e.summary -> 'combatants') s
          join public.encounter_combatants c on c.id = (s.value ->> 'combatant_id')::uuid and not c.hidden),
          '[]'::jsonb)) end),
    'combatants', coalesce((select jsonb_agg(row_json order by pos) from (
      select array_position(all_order, c.id) pos,
        jsonb_strip_nulls(jsonb_build_object(
          'id', c.id, 'kind', c.kind, 'side', c.side,
          'name', case when full_view then c.name else coalesce(c.public_name, c.name) end,
          'public_name', case when full_view then c.public_name end,
          'srd_id', case when full_view then c.srd_id end,
          'template_id', case when full_view then c.template_id end,
          'trackers', case when full_view and jsonb_array_length(c.trackers) > 0 then c.trackers end,
          'initiative', c.initiative,
          'initiative_bonus', case when full_view or own then c.initiative_bonus end,
          'in_turn_order', c.id = any(turn_order),
          'is_active', coalesce(c.id = e.active_combatant, false),
          'is_own', own,
          'can_act', own or full_view,
          'defeated', c.defeated,
          'character_id', case when full_view or own then c.character_id end,
          -- RYT-118: the SRD class of a character, for the token's emblem. Players and the table get
          -- it only while the character shows its real name; its own Player (off the table screen)
          -- always gets it, like every other own field.
          'class_key', case when c.kind = 'character' and (full_view or own or c.public_name is null)
            and c.sheet_class in ('barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin',
              'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard') then c.sheet_class end,
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
          -- RYT-043: five named bands; the table shows them for creatures instead of numbers.
          'hp_band', case when c.kind = 'lair' then null
            when c.kind = 'character' and not (full_view or own or shared) then 'unknown'
            when c.defeated and c.kind <> 'character' then 'down'
            when coalesce(hp_cur, 0) <= 0 then 'down'
            when hp_cur >= hp_max then 'unhurt'
            when hp_cur * 2 > hp_max then 'wounded'
            when hp_cur * 4 > hp_max then 'bloodied'
            else 'critical' end,
          -- ADR 028: a creature under an alias shows no image to Players (it would give it away).
          'image_path', case when c.kind = 'character' and (full_view or own or c.public_name is null)
              then c.portrait_path
            when c.kind = 'npc' and (full_view or c.public_name is null) then c.template_image end,
          'armor_class', case when full_view or own or shared then ac end,
          'conditions', case when c.kind = 'lair' then null
            when c.kind <> 'character' or full_view or own or shared then to_jsonb(conds) end,
          'concentration', case when c.kind <> 'character' or full_view or own or shared then c.concentration end,
          'death_saves', case when c.kind = 'character' and (full_view or own or shared)
            then jsonb_build_object('successes', ds, 'failures', df) end,
          'exhaustion', case when c.kind = 'character' and (full_view or own or shared) then exh end,
          -- RYT-045: death save outcomes are table knowledge, also where vitals are not shared.
          'death_state', c.death_state
        )) row_json
      from (
        select x.*, ch.user_id,
          coalesce(x.kind = 'character' and ch.user_id = viewer and not coalesce(as_table, false), false) own,
          -- RYT-118: under an alias a character shares nothing with Players or the table.
          (x.kind = 'character' and ch.user_id is not null and ch.shares_live
            and (full_view or x.public_name is null)) shared,
          case when x.kind = 'character' then v.current_hp else x.current_hp end hp_cur,
          case when x.kind = 'character' then s.max_hp else x.max_hp end hp_max,
          case when x.kind = 'character' then v.temp_hp else x.temp_hp end hp_tmp,
          case when x.kind = 'character' then s.armor_class else x.armor_class end ac,
          case when x.kind = 'character' then v.conditions else x.conditions end conds,
          v.death_successes ds, v.death_failures df, r.exhaustion::integer exh,
          case when x.kind <> 'character' or x.defeated then null
            when coalesce(v.current_hp, 0) <= 0 and v.death_successes >= 3 then 'stable'
            when coalesce(v.current_hp, 0) > 0 and e.status = 'active' and (select d.detail ->> 'result'
                from public.encounter_events d
                where d.encounter_id = e.id and d.target_combatant = x.id and d.kind = 'death_save'
                  and d.round = e.round and d.undone_by is null
                order by d.created_at desc, d.id desc limit 1) = 'up' then 'revived' end death_state,
          s.portrait_path, tp.image_path template_image, s.build ->> 'classKey' sheet_class
        from public.encounter_combatants x
        left join public.combatant_templates tp on tp.id = x.template_id
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
        'can_remove', full_view or coalesce(not coalesce(as_table, false) and ch.user_id = viewer, false))
        order by f.created_at, f.id)
      from public.encounter_effects f
      join public.encounter_combatants t on t.id = f.target_combatant
      left join public.encounter_combatants src on src.id = f.source_combatant
      left join public.characters ch on ch.id = t.character_id
      where f.encounter_id = e.id and (full_view or (f.visible and not t.hidden))), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(ev.j order by ev.created_at desc) from (
      select x.created_at, jsonb_strip_nulls(jsonb_build_object('id', x.id, 'kind', x.kind, 'round', x.round,
          'target_combatant', x.target_combatant,
          'target_name', case when full_view then x.target_name
            when tc.id is not null then coalesce(tc.public_name, x.target_name)
            -- RYT-118: a removed combatant keeps the alias it left with (visible events only).
            when x.target_combatant is not null then coalesce((select y.detail ->> 'target_alias'
                from public.encounter_events y
                where y.encounter_id = e.id and y.target_combatant = x.target_combatant
                  and y.visible and y.detail ? 'target_alias'
                order by y.created_at desc, y.id desc limit 1), x.target_name)
            else x.target_name end,
          'amount', x.amount,
          'source_name', case when full_view then src.name
            when not coalesce(src.hidden, false) then coalesce(src.public_name, src.name) end,
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
      -- RYT-118: nothing about a combatant that is hidden now, or that was hidden when it left.
      where x.encounter_id = e.id and (full_view or (x.visible and not coalesce(tc.hidden, false)
        and not (tc.id is null and x.target_combatant is not null and exists (
          select 1 from public.encounter_events l
           where l.encounter_id = e.id and l.target_combatant = x.target_combatant and l.kind = 'leave'
             and (not l.visible or l.detail @> '{"hidden_at_leave": true}'::jsonb)))))
      order by x.created_at desc, x.id desc limit 60) ev), '[]'::jsonb));
end;
$fn$;

revoke all on function public.get_combat_state(uuid, uuid, boolean) from public, anon;
grant execute on function public.get_combat_state(uuid, uuid, boolean) to authenticated;
$ddl$;
begin
  execute ddl;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function private.prune_stale_rows() from service_role';
  end if;
  if to_regprocedure('pre.delete_my_account(text,uuid)') is not null
      and to_regclass('pre_private.account_deletion_requests') is not null
      and to_regprocedure('pre_private.prune_stale_rows()') is not null
      and to_regprocedure('pre.get_combat_state(uuid,uuid,boolean)') is not null
      and to_regprocedure('pre_private.combat_log(pre.encounters,text,pre.encounter_combatants,integer,jsonb,jsonb,jsonb,boolean)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'encounter_combatants' and column_name = 'public_name') then
    execute pre_admin.remap(ddl);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute 'revoke all on function pre_private.prune_stale_rows() from service_role';
    end if;
  end if;
end;
$m$;

-- ---------------------------------------------------------------------------------------------
-- GLOBAL STORAGE (outside PRE remapping, as in 20261124120000): a campaign without owner gets the
-- per-campaign byte limit only.
-- ---------------------------------------------------------------------------------------------
create or replace function private.storage_quota_ok(bucket text, object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
declare env text := split_part(object_name, '/', 1); helper text; campaign uuid; prefix text;
  media_limit integer; audio_limit integer; campaign_mb integer; owner_mb integer;
  total bigint; audio bigint; stored bigint; owner_stored bigint; prefixes text[];
  sized boolean; owner uuid;
  buckets constant text := '(''character-portraits'', ''item-images'', ''creature-images'', ''tabletop-media'', ''shop-images'')';
  -- metadata.size is written by the Storage service; anything else counts as zero.
  size_of constant text := 'case when o.metadata->>''size'' ~ ''^[0-9]{1,15}$'' then (o.metadata->>''size'')::bigint else 0 end';
begin
  if bucket is null or object_name is null or env not in ('public', 'pre') then return false; end if;
  begin
    campaign := split_part(object_name, '/', 2)::uuid;
  exception when invalid_text_representation then return false; end;
  if to_regclass('storage.objects') is null then return false; end if;
  helper := case env when 'pre' then 'pre_private' else 'private' end;
  if to_regclass(format('%I.quota_limits', helper)) is null then helper := 'private'; end if;
  execute format('select
      coalesce((select q.max_count from %1$I.quota_limits q where q.quota = $1),
        (select q.max_count from private.quota_limits q where q.quota = $1)),
      coalesce((select q.max_count from %1$I.quota_limits q where q.quota = $2),
        (select q.max_count from private.quota_limits q where q.quota = $2)),
      coalesce((select q.max_count from %1$I.quota_limits q where q.quota = $3),
        (select q.max_count from private.quota_limits q where q.quota = $3)),
      coalesce((select q.max_count from %1$I.quota_limits q where q.quota = $4),
        (select q.max_count from private.quota_limits q where q.quota = $4))', helper)
    into media_limit, audio_limit, campaign_mb, owner_mb
    using 'media_per_campaign', 'audio_per_campaign', 'media_mb_per_campaign', 'media_mb_per_owner';
  if media_limit is null or audio_limit is null then return false; end if;
  sized := exists (select 1 from pg_attribute a where a.attrelid = to_regclass('storage.objects')
    and a.attname = 'metadata' and a.attnum > 0 and not a.attisdropped);
  prefix := env || '/' || campaign::text || '/';
  execute format('select count(*), count(*) filter (where o.bucket_id = ''tabletop-media''
        and split_part(o.name, ''/'', 3) = ''audio''), %s
      from storage.objects o where o.bucket_id in %s and o.name like $1',
      case when sized then 'coalesce(sum(' || size_of || '), 0)' else '0::bigint' end, buckets)
    into total, audio, stored using prefix || '%';
  if total >= media_limit then return false; end if;
  if bucket = 'tabletop-media' and split_part(object_name, '/', 3) = 'audio' and audio >= audio_limit then
    return false; end if;
  if not sized then return true; end if;
  if campaign_mb is not null and stored >= campaign_mb::bigint * 1048576 then return false; end if;
  if owner_mb is not null and to_regclass(format('%I.campaigns', env)) is not null then
    execute format('select c.owner_id from %I.campaigns c where c.id = $1', env) into owner using campaign;
    -- A campaign without owner (its owner's Auth user was deleted directly) has no owner total:
    -- only the per-campaign limits above apply.
    if owner is null then return true; end if;
    execute format('select coalesce(array_agg($2 || ''/'' || c.id::text || ''/%%''), ''{}'')
        from %1$I.campaigns c where c.owner_id = $1', env)
      into prefixes using owner, env;
    if cardinality(prefixes) > 0 then
      execute format('select coalesce(sum(%s), 0) from storage.objects o
          where o.bucket_id in %s and o.name like any($1)', size_of, buckets)
        into owner_stored using prefixes;
      if owner_stored >= owner_mb::bigint * 1048576 then return false; end if;
    end if;
  end if;
  return true;
end;
$fn$;
revoke all on function private.storage_quota_ok(text, text) from public, anon;
grant execute on function private.storage_quota_ok(text, text) to authenticated;
comment on function private.storage_quota_ok(text, text) is
  'RYT-113 storage quotas for INSERT policies: objects, audio and stored bytes per campaign, bytes per campaign owner (none for a campaign without owner). The new object is bounded by its bucket file_size_limit.';
