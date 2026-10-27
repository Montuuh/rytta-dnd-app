-- RYT-002: campaign-scoped roles, in-app email invitations and non-destructive revocation.
-- Actor/action matrix: anon none; outsider own invitations/create; player accept/decline/leave;
-- DM invite/revoke/manage roles in their campaign. Every membership change locks the campaign.
alter table public.campaign_members add column active boolean not null default true;

create or replace function private.is_campaign_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m
    where m.campaign_id = target and m.user_id = (select auth.uid()) and m.active);
$$;
create or replace function private.is_campaign_dm(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m
    where m.campaign_id = target and m.user_id = (select auth.uid()) and m.active and m.role = 'dm');
$$;
drop policy members_read on public.campaign_members;
create policy members_read on public.campaign_members for select to authenticated
  using (private.is_campaign_member(campaign_id) and (user_id = (select auth.uid()) or private.is_campaign_dm(campaign_id)));

create function private.verified_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null;
$$;
revoke all on function private.verified_email() from public, anon;
grant execute on function private.verified_email() to authenticated;

create table public.campaign_invitations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  responded_by uuid references auth.users(id),
  check (expires_at > created_at)
);
create unique index campaign_invitation_pending on public.campaign_invitations(campaign_id, email) where status = 'pending';
create index campaign_invitations_email on public.campaign_invitations(email);
alter table public.campaign_invitations enable row level security;
revoke all on public.campaign_invitations from public, anon, authenticated;
grant select on public.campaign_invitations to authenticated;
create policy invitations_read on public.campaign_invitations for select to authenticated
  using (private.is_campaign_dm(campaign_id) or (email = private.verified_email() and status = 'pending' and expires_at > now()));

create function public.list_my_campaigns()
returns table(id uuid, name text, description text, created_at timestamptz, role text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.description, c.created_at, m.role from public.campaigns c
  join public.campaign_members m on m.campaign_id = c.id
  where m.user_id = (select auth.uid()) and m.active order by c.created_at desc, c.id;
$$;
create function public.list_my_invitations()
returns table(id uuid, campaign_id uuid, campaign_name text, email text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.campaign_id, c.name, i.email, i.expires_at from public.campaign_invitations i
  join public.campaigns c on c.id = i.campaign_id
  where i.email = private.verified_email() and i.status = 'pending' and i.expires_at > now()
  order by i.created_at desc;
$$;
create function public.list_campaign_members(target_campaign uuid)
returns table(user_id uuid, role text, email text, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query select m.user_id, m.role, u.email::text,
    coalesce(nullif(left(u.raw_user_meta_data->>'full_name', 100), ''), u.email)::text
    from public.campaign_members m join auth.users u on u.id = m.user_id
    where m.campaign_id = target_campaign and m.active order by m.joined_at, m.user_id;
end;
$$;

create function public.invite_campaign_member(target_campaign uuid, invite_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; normalized text := lower(trim(invite_email));
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.campaign_members m join auth.users u on u.id = m.user_id
    where m.campaign_id = target_campaign and m.active and lower(u.email) = normalized)
    then raise exception 'Already a member' using errcode = 'P0001'; end if;
  -- Reissuing cancels the previous invitation; its identifier can never be replayed.
  update public.campaign_invitations set status = 'revoked'
    where campaign_id = target_campaign and email = normalized and status = 'pending';
  insert into public.campaign_invitations(campaign_id, email, created_by)
    values (target_campaign, normalized, auth.uid()) returning id into new_id;
  return new_id;
end;
$$;
create function public.respond_campaign_invitation(invitation_id uuid, accept_invitation boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare invite public.campaign_invitations; target uuid;
begin
  -- Lock order matches DM actions: campaign first, then invitation.
  select campaign_id into target from public.campaign_invitations where id = invitation_id;
  perform 1 from public.campaigns where id = target for update;
  select * into invite from public.campaign_invitations where id = invitation_id for update;
  if invite.id is null or invite.email is distinct from private.verified_email()
    or invite.status <> 'pending' or invite.expires_at <= now() or auth.uid() is null
    then raise exception 'Invitation unavailable' using errcode = '42501'; end if;
  if accept_invitation then
    -- An already-active DM is never demoted by accepting an older invitation.
    insert into public.campaign_members(campaign_id, user_id, role, active)
      values (invite.campaign_id, auth.uid(), 'player', true)
      on conflict (campaign_id, user_id) do update set role = 'player', active = true, joined_at = now()
      where not public.campaign_members.active;
  end if;
  update public.campaign_invitations set status = case when accept_invitation then 'accepted' else 'declined' end,
    responded_by = auth.uid() where id = invitation_id;
  return invite.campaign_id;
end;
$$;
create function public.revoke_campaign_invitation(invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select campaign_id into target from public.campaign_invitations where id = invitation_id;
  perform 1 from public.campaigns where id = target for update;
  if not private.is_campaign_dm(target) then raise exception 'Forbidden' using errcode = '42501'; end if;
  update public.campaign_invitations set status = 'revoked' where id = invitation_id and status = 'pending';
end;
$$;
create function public.change_campaign_member(target_campaign uuid, target_user uuid, new_role text) returns void
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
    -- A pending invite must not silently restore a deliberately revoked membership.
    update public.campaign_invitations set status = 'revoked' where campaign_id = target_campaign
      and email = (select lower(email) from auth.users where id = target_user) and status = 'pending';
  end if;
end;
$$;

revoke all on function public.list_my_campaigns(), public.list_my_invitations(), public.list_campaign_members(uuid),
  public.invite_campaign_member(uuid, text), public.respond_campaign_invitation(uuid, boolean),
  public.revoke_campaign_invitation(uuid), public.change_campaign_member(uuid, uuid, text) from public, anon;
grant execute on function public.list_my_campaigns(), public.list_my_invitations(), public.list_campaign_members(uuid),
  public.invite_campaign_member(uuid, text), public.respond_campaign_invitation(uuid, boolean),
  public.revoke_campaign_invitation(uuid), public.change_campaign_member(uuid, uuid, text) to authenticated;

comment on column public.campaigns.owner_id is 'Immutable creator attribution only; grants no privileges. Active campaign membership is authoritative.';
comment on column public.campaign_members.active is 'Revocation retains characters/resources and immediately denies subsequent authorized database access.';
