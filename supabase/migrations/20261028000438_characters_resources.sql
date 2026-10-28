-- RYT-003 actor matrix: anon/outsider none; Player reads own; active campaign DM
-- creates, explicitly unlinks, invites and edits. Campaign locks serialize with revocation.
alter table public.characters alter column user_id drop not null;
alter table public.characters add constraint characters_one_player unique (campaign_id, user_id);
alter table public.character_resources rename column copper to gold;
-- Existing copper balances convert exactly to gold; no rounding or data loss.
-- Refuse migration when conversion is not whole gold; operator must resolve first.
do $$ begin
  if exists (select 1 from public.character_resources where gold % 100 <> 0) then
    raise exception 'Existing balances require explicit whole-gold conversion';
  end if;
end $$;
update public.character_resources set gold = gold / 100;
alter table public.character_resources add constraint resources_safe check (
  gold <= 9007199254740991 and revision <= 9007199254740991 and exhaustion <= 2147483647);
revoke insert, update, delete on public.characters, public.character_resources from authenticated;

alter table public.campaign_invitations add column character_id uuid;
alter table public.campaign_invitations add constraint invitation_character_campaign
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id);
create unique index invitation_character_pending on public.campaign_invitations(character_id)
  where status = 'pending' and character_id is not null;

create table public.character_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  character_id uuid not null,
  actor_id uuid references auth.users(id),
  kind text not null,
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id)
);
alter table public.character_events enable row level security;
revoke all on public.character_events from public, anon, authenticated;
grant select on public.character_events to authenticated;
create policy events_dm_read on public.character_events for select to authenticated
  using (private.is_campaign_dm(campaign_id));
create index character_events_campaign on public.character_events(campaign_id, character_id, created_at);

create function private.audit_character_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.character_events(campaign_id, character_id, actor_id, kind, before_value, after_value)
    values (new.campaign_id, coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'character_id')::uuid,
      auth.uid(), tg_table_name || ':' || tg_op,
      case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  return new;
end;
$$;
revoke all on function private.audit_character_change() from public, anon, authenticated;
create trigger characters_audit after insert or update on public.characters
  for each row execute function private.audit_character_change();
create trigger resources_audit after insert or update on public.character_resources
  for each row execute function private.audit_character_change();

create table private.resource_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  character_id uuid not null references public.characters(id),
  payload jsonb not null,
  result_revision bigint not null
);
revoke all on private.resource_requests from public, anon, authenticated;
alter table private.resource_requests enable row level security;

create function public.create_character(target_campaign uuid, character_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  insert into public.characters(campaign_id, name) values (target_campaign, trim(character_name)) returning id into result;
  insert into public.character_resources(campaign_id, character_id) values (target_campaign, result);
  return result;
end;
$$;

-- Explicit release, with expected owner to prevent stale reassignment. Never deletes resources.
create function public.unassign_character(target_campaign uuid, target_character uuid, expected_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  update public.characters set user_id = null where campaign_id = target_campaign and id = target_character
    and user_id = expected_user;
  if not found then raise exception 'Assignment changed' using errcode = 'P0001'; end if;
  update public.campaign_invitations set status = 'revoked'
    where character_id = target_character and status = 'pending';
end;
$$;

-- Old untargeted invites remain readable but cannot be accepted. DM reissues with a character.
update public.campaign_invitations set status = 'revoked' where status = 'pending';
revoke execute on function public.invite_campaign_member(uuid, text) from authenticated;
create function public.invite_character_player(target_campaign uuid, target_character uuid, invite_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; normalized text := lower(trim(invite_email)); recipient uuid;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.characters where id = target_character and campaign_id = target_campaign and user_id is null)
    then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
  select id into recipient from auth.users where lower(email) = normalized;
  if exists (select 1 from public.characters where campaign_id = target_campaign and user_id = recipient)
    or exists (select 1 from public.campaign_members where campaign_id = target_campaign and user_id = recipient and active and role = 'dm')
    then raise exception 'Already assigned or DM' using errcode = 'P0001'; end if;
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
    or invite.status <> 'pending' or invite.expires_at <= now() or invite.character_id is null
    then raise exception 'Invitation unavailable' using errcode = '42501'; end if;
  if accept_invitation then
    if exists (select 1 from public.characters where campaign_id = target and user_id = auth.uid())
      or exists (select 1 from public.campaign_members where campaign_id = target and user_id = auth.uid() and active and role = 'dm')
      then raise exception 'Already assigned or DM' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.characters where id = invite.character_id and campaign_id = target and user_id is null)
      then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
    insert into public.campaign_members(campaign_id, user_id, role, active)
      values (target, auth.uid(), 'player', true)
      on conflict (campaign_id, user_id) do update set role = 'player', active = true;
    update public.characters set user_id = auth.uid() where id = invite.character_id and campaign_id = target;
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
    from public.campaign_invitations i join public.campaigns c on c.id = i.campaign_id
    join public.characters ch on ch.id = i.character_id and ch.campaign_id = i.campaign_id
    where i.email = private.verified_email() and i.status = 'pending' and i.expires_at > now();
$$;

create function public.set_character_resources(target_campaign uuid, target_character uuid,
  expected_revision bigint, new_gold bigint, new_water integer, new_rations integer, new_exhaustion integer, request_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; payload jsonb := jsonb_build_array(target_campaign, target_character,
  expected_revision, new_gold, new_water, new_rations, new_exhaustion); prior private.resource_requests;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.resource_requests r where r.request_id = set_character_resources.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result_revision;
  end if;
  select revision into current_revision from public.character_resources
    where campaign_id = target_campaign and character_id = target_character for update;
  if current_revision is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
  if current_revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  update public.character_resources set gold = new_gold, water_units = new_water,
    rations = new_rations, exhaustion = new_exhaustion, revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character;
  insert into private.resource_requests values (request_id, auth.uid(), target_character, payload, current_revision + 1);
  return current_revision + 1;
end;
$$;
revoke all on function public.create_character(uuid, text), public.unassign_character(uuid, uuid, uuid),
  public.invite_character_player(uuid, uuid, text), public.list_my_invitations(),
  public.set_character_resources(uuid, uuid, bigint, bigint, integer, integer, integer, uuid) from public, anon;
grant execute on function public.create_character(uuid, text), public.unassign_character(uuid, uuid, uuid),
  public.invite_character_player(uuid, uuid, text), public.list_my_invitations(),
  public.set_character_resources(uuid, uuid, bigint, bigint, integer, integer, integer, uuid) to authenticated;

comment on column public.character_resources.water_units is 'Whole water rations; homebrew units.';
comment on column public.character_resources.rations is 'Whole food rations; homebrew units.';
comment on column public.character_resources.exhaustion is 'Homebrew manual nonnegative counter; no edition effects or gameplay cap.';
comment on column public.character_resources.revision is 'Compare-and-swap revision; RPC writes only.';
