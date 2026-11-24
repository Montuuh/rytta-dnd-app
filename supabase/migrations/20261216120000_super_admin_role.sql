-- RYT-153: super admin role.
--
-- What. A platform super admin role held in private.super_admins and granted per environment by
-- the project owner (never from the repository or the browser). A super admin:
-- 1. sees an admin panel: every campaign in a searchable directory with favourites, a campaign
--    summary, the content library, the aggregate usage report (RYT-147), the admin audit log and
--    an account lookup by exact email or username;
-- 2. enters a campaign as its DM only through admin_enter_campaign, which opens a two-hour access
--    row (private.admin_campaign_access) that admin_exit_campaign or the clock ends. While it is
--    open the access helpers treat the super admin as that campaign's DM;
-- 3. holds every content editor right (private.is_content_editor).
-- A super admin is never written to campaign_members: member lists, the party, seats and member
-- counts never include them. In character history (the only player-visible log that labels
-- actors) a super admin's change shows as the DM's and carries no name; campaign events (party
-- level, dice settings, hit dice resets) taken through admin access are stored without an actor,
-- because campaign_events.actor_id must be a member; their idempotency rows now reference the
-- account instead of the membership. Dice rolls stay members' only
-- (campaign_rolls.roller_id references campaign_members), so a super admin does not roll inside a
-- campaign.
--
-- Access helpers. One private function, private.admin_access_campaign_ids(), returns the campaigns
-- the caller holds an open, unexpired access row for, and only while the caller is still a super
-- admin. private.is_campaign_member, private.is_campaign_dm, private.my_dm_campaign_ids,
-- private.my_module_campaign_ids and private.my_roll_scopes add those campaigns as DM, and
-- list_my_campaigns_with_modules lists them with role 'dm' (one row per campaign, DM wins).
-- Membership management stays with members. The functions that change roles or invite
-- (change_campaign_member, invite_campaign_member, invite_character_player) authorize with
-- private.is_campaign_dm, so the trigger guard private.admin_membership_guard refuses any insert,
-- update or delete of campaign_members, and any new campaign_invitations row, made by a caller who
-- holds admin access to that campaign and is not one of its active DMs. Without it a super admin
-- could invite themself, accept and promote themself to a permanent DM. Revoking an invitation is
-- still allowed. A super admin who is already a member of a campaign cannot open admin access to
-- it (admin_enter_campaign refuses), so their own seat and their admin access never mix.
--
-- Audit. private.admin_audit records enter, exit, favourite, unfavourite and account_lookup with
-- the actor and time; enter and exit carry the expiry and the time spent; an account lookup keeps
-- the id it found. The campaign directory searches campaign names, or the exact email of a DM;
-- an email search is logged as an account lookup. Opening the summary or the usage report changes
-- nothing and is not logged. Withdrawing the role (deleting the super_admins row) closes every
-- open access of that account.
--
-- Security. Every new table has RLS on and no grant to anon or authenticated: they are read and
-- written only through security definer functions with search_path '' that check
-- private.is_super_admin() server side and raise 42501 'Forbidden' otherwise. admin_status() is
-- open to authenticated callers and only tells whether the caller is a super admin and which
-- accesses they hold. No service-role key is involved. Deleting a campaign removes its access
-- rows and favourites; audit rows keep the campaign id without a foreign key. Deleting an account
-- removes its role, accesses and favourites and keeps its audit rows with actor_id null.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists. A PRE
-- refresh copies private.super_admins with the rest of private, so PRE has the same super admins
-- as production; auth is shared, so the PRE account lookup reads the same accounts.
--
-- Not included: impersonating a Player, deleting campaigns or accounts, any change to member
-- management or invitations through admin access.
do $migration$
declare ddl text := $ddl$
create table if not exists private.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table private.super_admins enable row level security;
revoke all on private.super_admins from public, anon, authenticated;

create table if not exists private.admin_campaign_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  constraint admin_access_expires_after_start check (expires_at > started_at),
  constraint admin_access_ends_after_start check (ended_at is null or ended_at >= started_at)
);
create unique index if not exists admin_campaign_access_open
  on private.admin_campaign_access (user_id, campaign_id) where ended_at is null;
create index if not exists admin_campaign_access_campaign on private.admin_campaign_access (campaign_id);
create index if not exists admin_campaign_access_user on private.admin_campaign_access (user_id);
alter table private.admin_campaign_access enable row level security;
revoke all on private.admin_campaign_access from public, anon, authenticated;

create table if not exists private.admin_favourites (
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, campaign_id)
);
create index if not exists admin_favourites_campaign on private.admin_favourites (campaign_id);
create index if not exists admin_favourites_user on private.admin_favourites (user_id);
alter table private.admin_favourites enable row level security;
revoke all on private.admin_favourites from public, anon, authenticated;

create table if not exists private.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('enter', 'exit', 'favourite', 'unfavourite', 'account_lookup')),
  campaign_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created on private.admin_audit (created_at desc, id desc);
create index if not exists admin_audit_actor on private.admin_audit (actor_id);
alter table private.admin_audit enable row level security;
revoke all on private.admin_audit from public, anon, authenticated;

create or replace function private.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select (select auth.uid()) is not null
    and exists (select 1 from private.super_admins s where s.user_id = (select auth.uid()));
$fn$;

create or replace function private.admin_access_campaign_ids() returns setof uuid
language sql stable security definer set search_path = '' as $fn$
  select a.campaign_id from private.admin_campaign_access a
    join private.super_admins s on s.user_id = a.user_id
   where a.user_id = (select auth.uid()) and a.ended_at is null and a.expires_at > now();
$fn$;

create or replace function private.admin_require() returns void
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not private.is_super_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
end;
$fn$;

/** A change made by a super admin through admin access, in a campaign they are not a member of. */
create or replace function private.admin_actor(target_campaign uuid, actor uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select actor is not null
    and exists (select 1 from private.admin_campaign_access a
      where a.campaign_id = target_campaign and a.user_id = actor)
    and not exists (select 1 from public.campaign_members m
      where m.campaign_id = target_campaign and m.user_id = actor);
$fn$;

revoke all on function private.is_super_admin(), private.admin_access_campaign_ids(),
  private.admin_require(), private.admin_actor(uuid, uuid) from public, anon, authenticated;

create or replace function private.is_campaign_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.campaign_members m
      where m.campaign_id = target and m.user_id = (select auth.uid()) and m.active)
    or target in (select private.admin_access_campaign_ids());
$fn$;

create or replace function private.is_campaign_dm(target uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.campaign_members m
      where m.campaign_id = target and m.user_id = (select auth.uid()) and m.active and m.role = 'dm')
    or target in (select private.admin_access_campaign_ids());
$fn$;

create or replace function private.my_dm_campaign_ids() returns setof uuid
language sql stable security definer set search_path = '' as $fn$
  select m.campaign_id from public.campaign_members m
   where m.user_id = (select auth.uid()) and m.active and m.role = 'dm'
  union
  select private.admin_access_campaign_ids();
$fn$;

create or replace function private.my_module_campaign_ids(module_name text) returns setof uuid
language sql stable security definer set search_path = '' as $fn$
  select m.campaign_id from public.campaign_members m
    join public.campaigns c on c.id = m.campaign_id
   where m.user_id = (select auth.uid()) and m.active
     and (m.role = 'dm' or module_name = any(c.player_modules))
  union
  select private.admin_access_campaign_ids();
$fn$;

create or replace function private.my_roll_scopes() returns table(campaign_id uuid, visibility text)
language sql stable security definer set search_path = '' as $fn$
  select m.campaign_id, s.v
    from (select x.campaign_id, x.role from public.campaign_members x
            where x.user_id = (select auth.uid()) and x.active
          union all
          select a, 'dm' from private.admin_access_campaign_ids() a) m
    join public.campaigns c on c.id = m.campaign_id
    cross join (values ('table', 2), ('roller_dm', 1), ('roller', 0)) s(v, r)
   where least(s.r, case c.roll_visibility when 'table' then 2 when 'roller_dm' then 1 else 0 end)
       >= case when m.role = 'dm' then 1 else 2 end;
$fn$;

create or replace function public.list_my_campaigns_with_modules()
returns table(id uuid, name text, description text, created_at timestamptz, role text,
  player_modules text[], party_level integer, dice_mode text, roll_visibility text)
language sql stable security definer set search_path = '' as $fn$
  select x.id, x.name, x.description, x.created_at, x.role, x.player_modules, x.party_level,
      x.dice_mode, x.roll_visibility
    from (
      select distinct on (c.id) c.id, c.name, c.description, c.created_at, m.role,
          c.player_modules, c.party_level, c.dice_mode, c.roll_visibility
        from public.campaigns c
        join (select y.campaign_id, y.role from public.campaign_members y
                where y.user_id = (select auth.uid()) and y.active
              union all
              select a, 'dm' from private.admin_access_campaign_ids() a) m on m.campaign_id = c.id
        order by c.id, (m.role = 'dm') desc) x
    order by x.created_at desc, x.id;
$fn$;

-- plpgsql, not sql: a PRE refresh recreates functions in name order, and is_content_editor comes
-- before is_super_admin.
create or replace function private.is_content_editor() returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return auth.uid() is not null
    and (exists (select 1 from private.content_editors e where e.user_id = auth.uid())
      or private.is_super_admin());
end;
$fn$;

create or replace function public.get_character_history(target_campaign uuid, target_character uuid,
  before_at timestamptz, page_size integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean;
  size integer := least(greatest(coalesce(page_size, 30), 1), 50);
begin
  if viewer is null or not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', h.id, 'at', h.created_at, 'kind', h.kind,
      'actor', case when h.actor_id is null then 'system' when h.actor_id = viewer then 'self'
        when exists (select 1 from public.campaign_members m where m.campaign_id = target_campaign
          and m.user_id = h.actor_id and m.role = 'dm') then 'dm'
        when private.admin_actor(target_campaign, h.actor_id) then 'dm' else 'player' end,
      'actor_name', case when dm and h.actor_id is not null
          and not private.admin_actor(target_campaign, h.actor_id)
        then private.member_name(h.actor_id) end,
      'changes', h.changes) order by h.created_at desc, h.id desc)
    from (
      select x.id, x.created_at, x.kind, x.actor_id,
          private.history_changes(x.kind, x.before_value, x.after_value) changes
        from public.character_events x
        where x.campaign_id = target_campaign and x.character_id = target_character
          and x.kind in ('characters:INSERT', 'characters:UPDATE', 'character_sheets:UPDATE',
            'character_vitals:UPDATE', 'character_resources:UPDATE', 'level_up')
          and (before_at is null or x.created_at < before_at)
          and (x.kind = 'characters:INSERT'
            or jsonb_array_length(private.history_changes(x.kind, x.before_value, x.after_value)) > 0)
        order by x.created_at desc, x.id desc
        limit size) h), '[]'::jsonb);
end;
$fn$;

-- The idempotency rows of campaign-level requests (party level, dice settings, hit dice reset)
-- pointed at the caller's membership; they now point at the caller's account, so a request made
-- through admin access is accepted and replayed like a DM's. Rows still go with the account and
-- the nightly retention keeps removing old ones.
alter table private.campaign_requests drop constraint if exists campaign_requests_actor_fkey;
alter table private.campaign_requests drop constraint if exists campaign_requests_actor_user_fkey;
alter table private.campaign_requests add constraint campaign_requests_actor_user_fkey
  foreign key (actor_id) references auth.users(id) on delete cascade;
alter table private.campaign_requests drop constraint if exists campaign_requests_campaign_fkey;
alter table private.campaign_requests add constraint campaign_requests_campaign_fkey
  foreign key (campaign_id) references public.campaigns(id) on delete cascade;
create index if not exists campaign_requests_actor on private.campaign_requests (actor_id);
create index if not exists campaign_requests_campaign on private.campaign_requests (campaign_id);

-- campaign_events.actor_id references the campaign's members. A DM action taken through admin
-- access is recorded without an actor, as the system's: it keeps working and names nobody.
create or replace function private.campaign_event_admin_actor() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if private.admin_actor(new.campaign_id, new.actor_id) then
    new.actor_id := null;
  end if;
  return new;
end;
$fn$;
revoke all on function private.campaign_event_admin_actor() from public, anon, authenticated;
drop trigger if exists campaign_events_admin_actor on public.campaign_events;
create trigger campaign_events_admin_actor before insert on public.campaign_events
  for each row execute function private.campaign_event_admin_actor();

-- Admin access is a DM's play rights, never membership management.
create or replace function private.admin_membership_guard() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare target uuid := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
begin
  if (select auth.uid()) is not null
      and target in (select private.admin_access_campaign_ids())
      and not exists (select 1 from public.campaign_members m
        where m.campaign_id = target and m.user_id = (select auth.uid())
          and m.active and m.role = 'dm') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$fn$;
revoke all on function private.admin_membership_guard() from public, anon, authenticated;
drop trigger if exists campaign_members_admin_guard on public.campaign_members;
create trigger campaign_members_admin_guard before insert or update or delete on public.campaign_members
  for each row execute function private.admin_membership_guard();
drop trigger if exists campaign_invitations_admin_guard on public.campaign_invitations;
create trigger campaign_invitations_admin_guard before insert on public.campaign_invitations
  for each row execute function private.admin_membership_guard();

-- Withdrawing the role ends the account's open accesses, so a later grant does not revive them.
create or replace function private.admin_role_withdrawn() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  update private.admin_campaign_access set ended_at = least(now(), expires_at)
   where user_id = old.user_id and ended_at is null;
  return old;
end;
$fn$;
revoke all on function private.admin_role_withdrawn() from public, anon, authenticated;
drop trigger if exists super_admins_withdrawn on private.super_admins;
create trigger super_admins_withdrawn after delete on private.super_admins
  for each row execute function private.admin_role_withdrawn();

-- Admin RPCs ---------------------------------------------------------------------------------

/** Whether the caller is a super admin, and the campaigns they are inside as DM right now. */
create or replace function public.admin_status() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'super_admin', private.is_super_admin(),
    'access', case when private.is_super_admin() then coalesce((
      select jsonb_agg(jsonb_build_object('campaign_id', a.campaign_id, 'expires_at', a.expires_at)
          order by a.expires_at)
        from private.admin_campaign_access a
       where a.user_id = (select auth.uid()) and a.ended_at is null and a.expires_at > now()), '[]'::jsonb)
      else '[]'::jsonb end);
$fn$;

/** Latest sign of life of a campaign, from the tables that record activity. */
create or replace function private.admin_last_activity(target uuid) returns timestamptz
language sql stable security definer set search_path = '' as $fn$
  select greatest(
    (select c.created_at from public.campaigns c where c.id = target),
    (select max(e.created_at) from public.campaign_events e where e.campaign_id = target),
    (select max(e.created_at) from public.character_events e where e.campaign_id = target),
    (select max(e.created_at) from public.inventory_events e where e.campaign_id = target),
    (select max(e.updated_at) from public.encounters e where e.campaign_id = target),
    (select max(m.joined_at) from public.campaign_members m where m.campaign_id = target));
$fn$;
revoke all on function private.admin_last_activity(uuid) from public, anon, authenticated;

create or replace function private.admin_campaign_row(c public.campaigns) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return jsonb_build_object(
    'id', c.id, 'name', c.name, 'created_at', c.created_at,
    'members', (select count(*) from public.campaign_members m where m.campaign_id = c.id and m.active),
    'dms', coalesce((select jsonb_agg(private.member_name(m.user_id) order by m.joined_at)
        from public.campaign_members m where m.campaign_id = c.id and m.active and m.role = 'dm'), '[]'::jsonb),
    'last_activity', private.admin_last_activity(c.id),
    'favourite', exists (select 1 from private.admin_favourites f
        where f.user_id = (select auth.uid()) and f.campaign_id = c.id),
    'access_expires_at', (select max(a.expires_at) from private.admin_campaign_access a
        where a.user_id = (select auth.uid()) and a.campaign_id = c.id and a.ended_at is null
          and a.expires_at > now()));
end;
$fn$;
revoke all on function private.admin_campaign_row(public.campaigns) from public, anon, authenticated;

/** Every campaign, favourites first, filtered by name or a DM's name or email. */
create or replace function public.admin_list_campaigns(search text default null) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare q text := nullif(trim(coalesce(search, '')), ''); by_email boolean; result jsonb;
begin
  perform private.admin_require();
  if q is not null and char_length(q) > 100 then raise exception 'Invalid search' using errcode = '22023'; end if;
  by_email := q is not null and strpos(q, '@') > 0;
  result := coalesce((
    select jsonb_agg(r.row order by r.favourite desc, r.created_at desc, r.id)
      from (select c.id, c.created_at,
              exists (select 1 from private.admin_favourites f
                where f.user_id = (select auth.uid()) and f.campaign_id = c.id) favourite,
              private.admin_campaign_row(c) row
            from public.campaigns c
           where q is null
              or c.name ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
              or (by_email and exists (select 1 from public.campaign_members m
                  join auth.users u on u.id = m.user_id
                 where m.campaign_id = c.id and m.role = 'dm' and m.active
                   and lower(u.email) = lower(q)))
           order by favourite desc, c.created_at desc, c.id
           limit 200) r), '[]'::jsonb);
  if by_email then
    insert into private.admin_audit (actor_id, action, detail)
      values (auth.uid(), 'account_lookup', jsonb_build_object('found', jsonb_array_length(result) > 0,
        'via', 'campaigns'));
  end if;
  return result;
end;
$fn$;

/** One campaign for the panel: who runs it, how many play, how alive it is. Changes nothing. */
create or replace function public.admin_campaign_summary(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare c public.campaigns;
begin
  perform private.admin_require();
  select * into c from public.campaigns where id = target_campaign;
  if not found then raise exception 'Campaign not found' using errcode = 'P0002'; end if;
  return private.admin_campaign_row(c) || jsonb_build_object(
    'description', c.description,
    'players', (select count(*) from public.campaign_members m
        where m.campaign_id = c.id and m.active and m.role = 'player'),
    'characters', (select count(*) from public.characters x where x.campaign_id = c.id),
    'encounters', (select count(*) from public.encounters e where e.campaign_id = c.id),
    'viewer_role', (select m.role from public.campaign_members m
        where m.campaign_id = c.id and m.user_id = (select auth.uid()) and m.active),
    'dm_emails', coalesce((select jsonb_agg(u.email order by m.joined_at)
        from public.campaign_members m join auth.users u on u.id = m.user_id
       where m.campaign_id = c.id and m.active and m.role = 'dm'), '[]'::jsonb));
end;
$fn$;

/** Opens two hours of DM access to a campaign (a new access replaces an open one). Audited. */
create or replace function public.admin_enter_campaign(target_campaign uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); expires timestamptz := now() + interval '2 hours';
begin
  perform private.admin_require();
  if not exists (select 1 from public.campaigns where id = target_campaign) then
    raise exception 'Campaign not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.campaign_members m
      where m.campaign_id = target_campaign and m.user_id = viewer and m.active) then
    raise exception 'Invalid request: already a member' using errcode = '22023'; end if;
  update private.admin_campaign_access set ended_at = now()
   where user_id = viewer and campaign_id = target_campaign and ended_at is null;
  insert into private.admin_campaign_access (user_id, campaign_id, expires_at)
    values (viewer, target_campaign, expires);
  insert into private.admin_audit (actor_id, action, campaign_id, detail)
    values (viewer, 'enter', target_campaign, jsonb_build_object('expires_at', expires));
  return jsonb_build_object('campaign_id', target_campaign, 'expires_at', expires);
end;
$fn$;

/** Ends the caller's access to a campaign now. Audited with the time spent; idempotent. */
create or replace function public.admin_exit_campaign(target_campaign uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); spent integer;
begin
  perform private.admin_require();
  with closed as (
    update private.admin_campaign_access set ended_at = least(now(), expires_at)
     where user_id = viewer and campaign_id = target_campaign and ended_at is null
    returning extract(epoch from (ended_at - started_at))::integer seconds)
  select sum(seconds)::integer into spent from closed;
  if spent is not null then
    insert into private.admin_audit (actor_id, action, campaign_id, detail)
      values (viewer, 'exit', target_campaign, jsonb_build_object('seconds', spent));
  end if;
  return jsonb_build_object('campaign_id', target_campaign, 'ended', spent is not null);
end;
$fn$;

create or replace function public.admin_set_favourite(target_campaign uuid, favourite boolean)
returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); changed integer;
begin
  perform private.admin_require();
  if favourite is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  if not exists (select 1 from public.campaigns where id = target_campaign) then
    raise exception 'Campaign not found' using errcode = 'P0002'; end if;
  if favourite then
    insert into private.admin_favourites (user_id, campaign_id) values (viewer, target_campaign)
      on conflict do nothing;
  else
    delete from private.admin_favourites where user_id = viewer and campaign_id = target_campaign;
  end if;
  get diagnostics changed = row_count;
  if changed > 0 then
    insert into private.admin_audit (actor_id, action, campaign_id)
      values (viewer, case when favourite then 'favourite' else 'unfavourite' end, target_campaign);
  end if;
  return favourite;
end;
$fn$;

/** The caller's favourite campaigns, for "Supervised" in My campaigns. */
create or replace function public.admin_favourite_campaigns() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.admin_require();
  return coalesce((select jsonb_agg(private.admin_campaign_row(c) order by c.name, c.id)
      from private.admin_favourites f join public.campaigns c on c.id = f.campaign_id
     where f.user_id = (select auth.uid())), '[]'::jsonb);
end;
$fn$;

create or replace function public.admin_audit_log(before_at timestamptz default null,
  page_size integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare size integer := least(greatest(coalesce(page_size, 50), 1), 100);
begin
  perform private.admin_require();
  return coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'at', a.created_at, 'action', a.action,
        'actor', case when a.actor_id is null then null else private.member_name(a.actor_id) end,
        'campaign_id', a.campaign_id,
        'campaign', (select c.name from public.campaigns c where c.id = a.campaign_id),
        'detail', a.detail) order by a.created_at desc, a.id desc)
      from (select * from private.admin_audit x
             where before_at is null or x.created_at < before_at
             order by x.created_at desc, x.id desc limit size) a), '[]'::jsonb);
end;
$fn$;

/** RYT-147 activation and return by weekly cohort, the same definitions as
 * scripts/reports/activation-return.sql, evaluated now. Counts only. */
create or replace function public.admin_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.admin_require();
  return coalesce((
    with params as (
      select now() as at, timestamptz '2026-11-18T00:00:00Z' as launch,
        interval '14 days' as activation_window, interval '28 days' as return_window
    ),
    excluded as (
      select u.id from auth.users u
       where coalesce(u.raw_app_meta_data ->> 'rytta_internal', '') = 'true'
          or coalesce(u.raw_user_meta_data ->> 'rytta_test_account', '') = 'true'
          or u.id in (select s.user_id from private.super_admins s)
    ),
    cohort as (
      select c.id, c.created_at from public.campaigns c, params p
       where c.created_at >= p.launch and c.created_at <= p.at
         and (c.owner_id is null or c.owner_id not in (select id from excluded))
         and not exists (select 1 from public.campaign_members m
           where m.campaign_id = c.id and m.role = 'dm' and m.user_id in (select id from excluded))
    ),
    second_member as (
      select r.campaign_id, r.joined_at from (
        select m.campaign_id, m.joined_at,
            row_number() over (partition by m.campaign_id order by m.joined_at, m.user_id) as position
          from public.campaign_members m join cohort c on c.id = m.campaign_id) r
       where r.position = 2
    ),
    started as (
      select e.campaign_id, e.started_at from public.encounters e
        join cohort c on c.id = e.campaign_id, params p
       where e.started_at is not null and e.started_at < c.created_at + p.activation_window
         and e.started_at <= p.at
    ),
    activated as (
      select s.campaign_id, min(s.started_at) as at from started s
        join second_member m on m.campaign_id = s.campaign_id and s.started_at >= m.joined_at
       group by s.campaign_id
    ),
    solo as (select distinct s.campaign_id from started s
              where s.campaign_id not in (select campaign_id from activated)),
    dm_activity as (
      select a.campaign_id, a.at from (
        select campaign_id, actor_id as who, created_at as at from public.campaign_events
        union all select campaign_id, actor_id, created_at from public.character_events
        union all select campaign_id, actor_id, created_at from public.inventory_events
        union all select campaign_id, actor_id, created_at from public.encounter_events
        union all select campaign_id, created_by, created_at from public.encounters
        union all select campaign_id, created_by, started_at from public.encounters where started_at is not null
        union all select campaign_id, created_by, created_at from public.item_definitions
        union all select campaign_id, created_by, created_at from public.tabletop_scenes
        union all select campaign_id, created_by, created_at from public.campaign_invitations
        union all select campaign_id, created_by, created_at from public.glossary_entries
      ) a join public.campaign_members m on m.campaign_id = a.campaign_id and m.user_id = a.who and m.role = 'dm'
    ),
    returned as (
      select x.campaign_id from activated x join dm_activity d on d.campaign_id = x.campaign_id, params p
       where d.at > x.at and d.at <= p.at and d.at < x.at + p.return_window
         and (d.at at time zone 'UTC')::date <> (x.at at time zone 'UTC')::date
       group by x.campaign_id
    ),
    rows as (
      select date_trunc('week', c.created_at at time zone 'UTC')::date as cohort_week,
          c.created_at + p.activation_window <= p.at as activation_settled,
          x.campaign_id is not null as activated, o.campaign_id is not null as solo_only,
          x.at is not null and x.at + p.return_window <= p.at as return_settled,
          r.campaign_id is not null as returned
        from cohort c cross join params p
        left join activated x on x.campaign_id = c.id
        left join solo o on o.campaign_id = c.id
        left join returned r on r.campaign_id = c.id
    ),
    report as (
      select case when grouping(cohort_week) = 1 then 'total' else cohort_week::text end as cohort_week,
          grouping(cohort_week) as is_total,
          count(*) as campaigns,
          count(*) filter (where activation_settled) as activation_denominator,
          count(*) filter (where activated and activation_settled) as activated_settled,
          count(*) filter (where solo_only) as solo_preparation,
          count(*) filter (where return_settled) as return_denominator,
          count(*) filter (where returned and return_settled) as returned_settled,
          count(*) filter (where returned) as returned_so_far
        from rows group by grouping sets ((cohort_week), ())
    )
    select jsonb_agg(to_jsonb(report) - 'is_total' order by report.is_total, report.cohort_week)
      from report), '[]'::jsonb);
end;
$fn$;

/** Looks up one account by its exact email or username. Audited, with whether it was found. */
create or replace function public.admin_find_account(query text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare q text := lower(trim(coalesce(query, ''))); found_id uuid; result jsonb;
begin
  perform private.admin_require();
  if char_length(q) < 3 or char_length(q) > 254 then
    raise exception 'Invalid search' using errcode = '22023'; end if;
  select u.id into found_id from auth.users u
    left join public.profiles p on p.user_id = u.id
   where lower(u.email) = q or lower(p.username) = q
   order by (lower(u.email) = q) desc
   limit 1;
  insert into private.admin_audit (actor_id, action, detail)
    values (auth.uid(), 'account_lookup',
      jsonb_build_object('found', found_id is not null, 'account_id', found_id));
  if found_id is null then return null; end if;
  select jsonb_build_object(
      'email', u.email,
      'username', (select p.username from public.profiles p where p.user_id = u.id),
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
      'campaigns', coalesce((select jsonb_agg(jsonb_build_object(
            'id', c.id, 'name', c.name, 'role', m.role) order by c.name, c.id)
          from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
         where m.user_id = u.id and m.active), '[]'::jsonb))
    into result
    from auth.users u where u.id = found_id;
  return result;
end;
$fn$;

revoke all on function public.admin_status(), public.admin_list_campaigns(text),
  public.admin_campaign_summary(uuid), public.admin_enter_campaign(uuid),
  public.admin_exit_campaign(uuid), public.admin_set_favourite(uuid, boolean),
  public.admin_favourite_campaigns(), public.admin_audit_log(timestamptz, integer),
  public.admin_usage(), public.admin_find_account(text) from public, anon;
grant execute on function public.admin_status(), public.admin_list_campaigns(text),
  public.admin_campaign_summary(uuid), public.admin_enter_campaign(uuid),
  public.admin_exit_campaign(uuid), public.admin_set_favourite(uuid, boolean),
  public.admin_favourite_campaigns(), public.admin_audit_log(timestamptz, integer),
  public.admin_usage(), public.admin_find_account(text) to authenticated;
$ddl$;
begin
  if to_regclass('pre.campaign_events') is not null
      and to_regclass('pre_private.campaign_requests') is not null
      and to_regclass('pre_private.content_editors') is not null
      and to_regprocedure('pre_private.member_name(uuid)') is not null
      and to_regprocedure('pre_private.can_play_character(uuid,uuid)') is not null
      and to_regprocedure('pre_private.history_changes(text,jsonb,jsonb)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;
