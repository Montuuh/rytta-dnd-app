-- Restore membership-only invitations, accept them without a character, and unlink
-- characters when membership is revoked or left.
grant execute on function public.invite_campaign_member(uuid, text) to authenticated;

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
      if exists (select 1 from public.characters where campaign_id = target and user_id = auth.uid())
        or exists (select 1 from public.campaign_members where campaign_id = target and user_id = auth.uid() and active and role = 'dm')
        then raise exception 'Already assigned or DM' using errcode = 'P0001'; end if;
      if not exists (select 1 from public.characters where id = invite.character_id and campaign_id = target and user_id is null)
        then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
      insert into public.campaign_members(campaign_id, user_id, role, active)
        values (target, auth.uid(), 'player', true)
        on conflict (campaign_id, user_id) do update set role = 'player', active = true;
      update public.characters set user_id = auth.uid() where id = invite.character_id and campaign_id = target;
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

drop function public.list_my_invitations();
create function public.list_my_invitations()
returns table(id uuid, campaign_id uuid, campaign_name text, email text, expires_at timestamptz, character_id uuid, character_name text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.campaign_id, c.name, i.email, i.expires_at, ch.id, ch.name
    from public.campaign_invitations i
    join public.campaigns c on c.id = i.campaign_id
    left join public.characters ch on ch.id = i.character_id and ch.campaign_id = i.campaign_id
    where i.email = private.verified_email() and i.status = 'pending' and i.expires_at > now()
    order by i.created_at desc;
$$;
revoke all on function public.list_my_invitations() from public, anon;
grant execute on function public.list_my_invitations() to authenticated;

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
    update public.characters set user_id = null
      where campaign_id = target_campaign and user_id = target_user;
    update public.campaign_invitations set status = 'revoked' where campaign_id = target_campaign
      and email = (select lower(email) from auth.users where id = target_user) and status = 'pending';
  end if;
end;
$$;

comment on function public.change_campaign_member(uuid, uuid, text) is
  'Promote, demote, remove or leave. Removal/leave unlinks campaign characters and keeps resources.';
