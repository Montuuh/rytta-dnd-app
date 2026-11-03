-- RYT-044 follow-up: archive and restore characters (ADR 026, user decision 2026-11-03).
-- Archiving is how a Player frees one of the four roster slots without deleting anything:
-- sheets, inventory, orders, trades and combat history stay attached to the character.
--
-- Rules (database-enforced):
--   * characters.archived_at: null while the character is in the roster.
--   * An archived character is never active (characters_archived_inactive); an unassigned
--     character is active unless it is archived (characters_unassigned_active, redefined).
--   * The four-character limit and the one-active rule count only non-archived characters
--     (characters_roster trigger, redefined and now also watching archived_at).
--   * The active character cannot be archived; another one must be activated first.
--   * Archiving is refused while the character has an open trade or fights in an encounter in
--     initiative or active status (same rule as switching).
--   * Restoring needs a free slot; the restored character becomes active only when its owner
--     has no active character (or always, for an unassigned DM character).
--
-- Actor matrix:
--   anon: cannot execute archive_character or restore_character.
--   outsider / inactive member / DM of another campaign / another Player of the campaign:
--           Forbidden or Character unavailable; RLS keeps hiding the rows.
--   owner (active member): archives and restores own characters.
--   active campaign DM: archives and restores any character of the campaign, assigned or not.
-- Both RPCs lock the campaign row and are idempotent: archiving an archived character or
-- restoring a restored one returns the current state without writing.
-- The other roster RPCs are redefined only to count and pick non-archived characters.
--
-- Environments: this file runs on production (public). When a PRE that already has the RYT-044
-- roster (pre.characters.is_active) predates this migration, the same DDL runs remapped with
-- pre_admin.remap. Apply to PRE first, validate, then to production.

do $archive$
declare ddl text := $ddl$
  alter table public.characters add column archived_at timestamptz;
  comment on column public.characters.archived_at is
    'RYT-044: set while the character is archived (out of the roster and every campaign list). RPC writes only.';

  alter table public.characters drop constraint characters_unassigned_active;
  alter table public.characters add constraint characters_unassigned_active
    check (user_id is not null or is_active or archived_at is not null);
  alter table public.characters add constraint characters_archived_inactive
    check (archived_at is null or not is_active);

  create or replace function private.check_character_roster() returns trigger
  language plpgsql security definer set search_path = '' as $$
  declare pair record; total integer; active_count integer;
  begin
    for pair in
      select distinct x.campaign_id, x.user_id from (values
        (case when tg_op <> 'INSERT' then old.campaign_id end, case when tg_op <> 'INSERT' then old.user_id end),
        (case when tg_op <> 'DELETE' then new.campaign_id end, case when tg_op <> 'DELETE' then new.user_id end)
      ) x(campaign_id, user_id) where x.user_id is not null
    loop
      select count(*) filter (where c.archived_at is null), count(*) filter (where c.is_active)
        into total, active_count
        from public.characters c where c.campaign_id = pair.campaign_id and c.user_id = pair.user_id;
      if total > 4 then raise exception 'Character limit' using errcode = 'P0001'; end if;
      if total > 0 and active_count <> 1 then
        raise exception 'Active character required' using errcode = 'P0001'; end if;
    end loop;
    return null;
  end;
  $$;
  drop trigger characters_roster on public.characters;
  create constraint trigger characters_roster
    after insert or delete or update of user_id, is_active, archived_at on public.characters
    deferrable initially deferred for each row execute function private.check_character_roster();

  -- Shared guard for archiving: the character must not be trading or fighting right now.
  create function private.character_busy(target_campaign uuid, target_character uuid) returns text
  language plpgsql stable security definer set search_path = '' as $$
  begin
    if private.trade_busy(target_campaign, target_character) then return 'Trade busy'; end if;
    if exists (select 1 from public.encounter_combatants x
        join public.encounters e on e.campaign_id = x.campaign_id and e.id = x.encounter_id
        where x.campaign_id = target_campaign and x.character_id = target_character
          and e.status in ('initiative', 'active')) then
      return 'Character in combat';
    end if;
    return null;
  end;
  $$;
  revoke all on function private.character_busy(uuid, uuid) from public, anon, authenticated;

  create function public.archive_character(target_campaign uuid, target_character uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $$
  declare viewer uuid := auth.uid(); target public.characters; busy text;
  begin
    if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_member(target_campaign) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    select * into target from public.characters c
      where c.campaign_id = target_campaign and c.id = target_character for update;
    if target.id is null or not (private.is_campaign_dm(target_campaign) or target.user_id = viewer) then
      raise exception 'Character unavailable' using errcode = '42501'; end if;
    if target.archived_at is not null then
      return jsonb_build_object('id', target.id, 'archived', true);
    end if;
    if target.user_id is not null and target.is_active then
      raise exception 'Active character' using errcode = 'P0001'; end if;
    busy := private.character_busy(target_campaign, target.id);
    if busy is not null then raise exception '%', busy using errcode = 'P0001'; end if;
    update public.characters set is_active = false, archived_at = now() where id = target.id;
    update public.campaign_invitations set status = 'revoked'
      where character_id = target.id and status = 'pending';
    return jsonb_build_object('id', target.id, 'archived', true);
  end;
  $$;

  create function public.restore_character(target_campaign uuid, target_character uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $$
  declare viewer uuid := auth.uid(); target public.characters;
  begin
    if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_member(target_campaign) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    select * into target from public.characters c
      where c.campaign_id = target_campaign and c.id = target_character for update;
    if target.id is null or not (private.is_campaign_dm(target_campaign) or target.user_id = viewer) then
      raise exception 'Character unavailable' using errcode = '42501'; end if;
    if target.archived_at is null then
      return jsonb_build_object('id', target.id, 'archived', false);
    end if;
    if target.user_id is null then
      update public.characters set archived_at = null, is_active = true where id = target.id;
    else
      if (select count(*) from public.characters c where c.campaign_id = target_campaign
          and c.user_id = target.user_id and c.archived_at is null) >= 4 then
        raise exception 'Character limit' using errcode = 'P0001'; end if;
      update public.characters set archived_at = null, is_active = not exists (
          select 1 from public.characters c where c.campaign_id = target_campaign
            and c.user_id = target.user_id and c.is_active)
        where id = target.id;
    end if;
    return jsonb_build_object('id', target.id, 'archived', false);
  end;
  $$;

  revoke all on function public.archive_character(uuid, uuid),
    public.restore_character(uuid, uuid) from public, anon;
  grant execute on function public.archive_character(uuid, uuid),
    public.restore_character(uuid, uuid) to authenticated;

  -- The roster RPCs below change only to count and pick non-archived characters.
  create or replace function public.create_own_character(target_campaign uuid, character_name text, request_id uuid)
  returns uuid language plpgsql security definer set search_path = '' as $$
  declare viewer uuid := auth.uid(); result uuid; prior private.character_requests;
    payload jsonb := jsonb_build_array('create_own', target_campaign, character_name);
  begin
    if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
    perform 1 from public.campaigns where id = target_campaign for update;
    if not exists (select 1 from public.campaign_members m where m.campaign_id = target_campaign
        and m.user_id = viewer and m.active and m.role = 'player') then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
    select * into prior from private.character_requests r
      where r.request_id = create_own_character.request_id;
    if prior.request_id is not null then
      if prior.actor_id <> viewer or prior.payload <> payload then
        raise exception 'Request mismatch' using errcode = '22023'; end if;
      return prior.character_id;
    end if;
    if character_name is null or char_length(trim(character_name)) not between 1 and 100 then
      raise exception 'Invalid name' using errcode = '22023'; end if;
    if (select count(*) from public.characters c
        where c.campaign_id = target_campaign and c.user_id = viewer and c.archived_at is null) >= 4 then
      raise exception 'Character limit' using errcode = 'P0001'; end if;
    insert into public.characters(campaign_id, user_id, name, is_active)
      values (target_campaign, viewer, trim(character_name), not exists (
        select 1 from public.characters c
         where c.campaign_id = target_campaign and c.user_id = viewer and c.is_active))
      returning id into result;
    insert into public.character_resources(campaign_id, character_id) values (target_campaign, result);
    insert into private.character_requests(request_id, actor_id, payload, character_id)
      values (create_own_character.request_id, viewer, payload, result);
    return result;
  end;
  $$;

  create or replace function public.set_active_character(target_campaign uuid, target_character uuid)
  returns uuid language plpgsql security definer set search_path = '' as $$
  declare viewer uuid := auth.uid(); target public.characters; current_active uuid; busy text;
  begin
    if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_member(target_campaign) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    select * into target from public.characters c
      where c.campaign_id = target_campaign and c.id = target_character and c.user_id = viewer
        and c.archived_at is null
      for update;
    if target.id is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
    if target.is_active then return target.id; end if;
    select c.id into current_active from public.characters c
      where c.campaign_id = target_campaign and c.user_id = viewer and c.is_active for update;
    if current_active is not null then
      busy := private.character_busy(target_campaign, current_active);
      if busy is not null then raise exception '%', busy using errcode = 'P0001'; end if;
      update public.characters set is_active = false where id = current_active;
    end if;
    update public.characters set is_active = true where id = target.id;
    return target.id;
  end;
  $$;

  create or replace function public.assign_character(target_campaign uuid, target_character uuid, target_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
  begin
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
    if not exists(select 1 from public.campaign_members where campaign_id=target_campaign and user_id=target_user and active and role='player') then
      raise exception 'Player unavailable' using errcode = '42501';
    end if;
    if (select count(*) from public.characters where campaign_id=target_campaign and user_id=target_user
        and archived_at is null) >= 4 then
      raise exception 'Character limit' using errcode = 'P0001';
    end if;
    update public.characters set user_id=target_user, is_active = not exists (
        select 1 from public.characters c
         where c.campaign_id = target_campaign and c.user_id = target_user and c.is_active)
      where campaign_id=target_campaign and id=target_character and user_id is null and archived_at is null;
    if not found then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
    update public.campaign_invitations set status='revoked' where character_id=target_character and status='pending';
  end;
  $$;

  create or replace function public.unassign_character(target_campaign uuid, target_character uuid, expected_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
  declare was_active boolean; was_archived boolean;
  begin
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
    select c.is_active, c.archived_at is not null into was_active, was_archived from public.characters c
      where c.campaign_id = target_campaign and c.id = target_character and c.user_id = expected_user for update;
    if not found then raise exception 'Assignment changed' using errcode = 'P0001'; end if;
    update public.characters set user_id = null, is_active = not was_archived
      where campaign_id = target_campaign and id = target_character;
    if was_active then
      update public.characters set is_active = true where id = (
        select c.id from public.characters c where c.campaign_id = target_campaign
          and c.user_id = expected_user and c.archived_at is null order by c.created_at, c.id limit 1);
    end if;
    update public.campaign_invitations set status = 'revoked'
      where character_id = target_character and status = 'pending';
  end;
  $$;

  create or replace function public.invite_character_player(target_campaign uuid, target_character uuid, invite_email text) returns uuid
  language plpgsql security definer set search_path = '' as $$
  declare result uuid; normalized text := lower(trim(invite_email)); recipient uuid;
  begin
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
    if not exists (select 1 from public.characters where id = target_character and campaign_id = target_campaign
        and user_id is null and archived_at is null)
      then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
    select id into recipient from auth.users where lower(email) = normalized;
    if exists (select 1 from public.campaign_members where campaign_id = target_campaign and user_id = recipient and active and role = 'dm')
      then raise exception 'Recipient is DM' using errcode = 'P0001'; end if;
    if (select count(*) from public.characters where campaign_id = target_campaign and user_id = recipient
        and archived_at is null) >= 4
      then raise exception 'Character limit' using errcode = 'P0001'; end if;
    update public.campaign_invitations set status = 'revoked' where campaign_id = target_campaign
      and (email = normalized or character_id = target_character) and status = 'pending';
    insert into public.campaign_invitations(campaign_id, character_id, email, created_by)
      values (target_campaign, target_character, normalized, auth.uid()) returning id into result;
    return result;
  end;
  $$;

  create or replace function public.respond_campaign_invitation(invitation_id uuid, accept_invitation boolean) returns uuid
  language plpgsql security definer set search_path = '' as $$
  declare invite public.campaign_invitations; target uuid;
  begin
    select campaign_id into target from public.campaign_invitations where id = invitation_id;
    perform 1 from public.campaigns where id = target for update;
    select * into invite from public.campaign_invitations where id = invitation_id for update;
    if invite.id is null or invite.email is distinct from private.verified_email() or auth.uid() is null
      or invite.status <> 'pending' or invite.expires_at <= now()
      then raise exception 'Invitation unavailable' using errcode = '42501'; end if;
    if accept_invitation then
      if invite.character_id is not null then
        if exists (select 1 from public.campaign_members where campaign_id = target and user_id = auth.uid() and active and role = 'dm')
          then raise exception 'Recipient is DM' using errcode = 'P0001'; end if;
        if (select count(*) from public.characters where campaign_id = target and user_id = auth.uid()
            and archived_at is null) >= 4
          then raise exception 'Character limit' using errcode = 'P0001'; end if;
        if not exists (select 1 from public.characters where id = invite.character_id and campaign_id = target
            and user_id is null and archived_at is null)
          then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
        insert into public.campaign_members(campaign_id, user_id, role, active)
          values (target, auth.uid(), 'player', true)
          on conflict (campaign_id, user_id) do update set role = 'player', active = true;
        update public.characters set user_id = auth.uid(), is_active = not exists (
            select 1 from public.characters c
             where c.campaign_id = target and c.user_id = auth.uid() and c.is_active)
          where id = invite.character_id and campaign_id = target;
      else
        insert into public.campaign_members(campaign_id, user_id, role, active)
          values (target, auth.uid(), 'player', true)
          on conflict (campaign_id, user_id) do update set role = 'player', active = true, joined_at = now()
          where not public.campaign_members.active;
      end if;
    end if;
    update public.campaign_invitations set status = case when accept_invitation then 'accepted' else 'declined' end,
      responded_by = auth.uid() where id = invitation_id;
    return target;
  end;
  $$;

  create or replace function public.change_campaign_member(target_campaign uuid, target_user uuid, new_role text) returns void
  language plpgsql security definer set search_path = '' as $$
  declare old_role text;
  begin
    perform 1 from public.campaigns where id = target_campaign for update;
    if new_role is not null and new_role not in ('dm', 'player') then raise exception 'Invalid role' using errcode = '22023'; end if;
    if not private.is_campaign_dm(target_campaign) and not
      (new_role is null and target_user = auth.uid() and private.is_campaign_member(target_campaign))
      then raise exception 'Forbidden' using errcode = '42501'; end if;
    select role into old_role from public.campaign_members
      where campaign_id = target_campaign and user_id = target_user and active;
    if old_role is null then raise exception 'Member unavailable' using errcode = '42501'; end if;
    if old_role = 'dm' and new_role is distinct from 'dm' and
      (select count(*) from public.campaign_members where campaign_id = target_campaign and active and role = 'dm') <= 1
      then raise exception 'Keep at least one DM' using errcode = 'P0001'; end if;
    update public.campaign_members set active = (new_role is not null), role = coalesce(new_role, role)
      where campaign_id = target_campaign and user_id = target_user;
    if new_role is null then
      -- Unlinked characters return to the DM; archived ones stay archived.
      update public.characters set user_id = null, is_active = (archived_at is null)
        where campaign_id = target_campaign and user_id = target_user;
      update public.campaign_invitations set status = 'revoked' where campaign_id = target_campaign
        and email = (select lower(email) from auth.users where id = target_user) and status = 'pending';
    end if;
  end;
  $$;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.characters') is not null and to_regprocedure('pre_admin.remap(text)') is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'characters' and column_name = 'is_active')
      and not exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'characters' and column_name = 'archived_at') then
    execute pre_admin.remap(ddl);
  end if;
end;
$archive$;
