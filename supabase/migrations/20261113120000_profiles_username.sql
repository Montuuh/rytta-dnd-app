-- RYT-078: one username per account (ADR 036).
--
-- profiles holds a single username per auth user, shared by every campaign the user belongs to.
-- 3–24 characters, letters, digits and underscore; unique without regard to case; a few names are
-- reserved because the interface uses them for roles or the system. Case is kept for display.
--
-- Access goes only through RPCs; the table has RLS enabled and no client grants:
--   get_my_username()            the caller's own username, or null.
--   username_available(name)     true when name is valid, not reserved and not held by someone else.
--   set_my_username(name)        creates or changes the caller's username; returns the stored value.
-- private.member_name(user) is the single display rule: username, else the Google full name, else
-- the email. list_campaign_members and get_character_history (both DM-only) now use it; their
-- signatures, grants and authorization are unchanged.
--
-- Actor matrix: anon cannot execute any RPC; any signed-in user reads and writes only their own
-- username; nobody reads another user's profile row directly. A username is visible to the DMs of
-- the campaigns the user is an active member of (members list, sheet history), as the name was.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has
-- membership and the sheet history and no profiles yet, the same DDL is executed again remapped
-- with pre_admin.remap.

do $profiles$
declare ddl text := $ddl$
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;

create function private.username_reserved(candidate text) returns boolean
language sql immutable set search_path = '' as $fn$
  select lower(candidate) = any (array['admin', 'administrator', 'dm', 'gm', 'master', 'player',
    'rytta', 'system', 'support', 'moderator', 'root', 'null', 'undefined', 'me', 'self', 'anonymous']);
$fn$;
revoke all on function private.username_reserved(text) from public, anon, authenticated;

create function private.member_name(target_user uuid) returns text
language sql stable security definer set search_path = '' as $fn$
  select coalesce(p.username, nullif(left(u.raw_user_meta_data ->> 'full_name', 100), ''), u.email)::text
    from auth.users u left join public.profiles p on p.user_id = u.id where u.id = target_user;
$fn$;
revoke all on function private.member_name(uuid) from public, anon, authenticated;

create function public.get_my_username() returns text
language sql stable security definer set search_path = '' as $fn$
  select p.username from public.profiles p where p.user_id = (select auth.uid());
$fn$;

create function public.username_available(candidate text) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
declare wanted text := trim(candidate);
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if wanted is null or wanted !~ '^[A-Za-z0-9_]{3,24}$' or private.username_reserved(wanted) then return false; end if;
  return not exists (select 1 from public.profiles p
    where lower(p.username) = lower(wanted) and p.user_id <> auth.uid());
end;
$fn$;

create function public.set_my_username(new_username text) returns text
language plpgsql security definer set search_path = '' as $fn$
declare wanted text := trim(new_username); viewer uuid := auth.uid();
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if wanted is null or wanted !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception 'Invalid username' using errcode = '22023'; end if;
  if private.username_reserved(wanted) then raise exception 'Username reserved' using errcode = 'P0001'; end if;
  begin
    insert into public.profiles(user_id, username) values (viewer, wanted)
      on conflict (user_id) do update set username = excluded.username, updated_at = now();
  exception when unique_violation then
    raise exception 'Username taken' using errcode = 'P0001';
  end;
  return wanted;
end;
$fn$;

revoke all on function public.get_my_username(), public.username_available(text),
  public.set_my_username(text) from public, anon;
grant execute on function public.get_my_username(), public.username_available(text),
  public.set_my_username(text) to authenticated;

create or replace function public.list_campaign_members(target_campaign uuid)
returns table(user_id uuid, role text, email text, display_name text)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query select m.user_id, m.role, u.email::text, private.member_name(m.user_id)
    from public.campaign_members m join auth.users u on u.id = m.user_id
    where m.campaign_id = target_campaign and m.active order by m.joined_at, m.user_id;
end;
$fn$;

create or replace function public.get_character_history(target_campaign uuid, target_character uuid,
  before_at timestamptz, page_size integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
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
          and m.user_id = h.actor_id and m.role = 'dm') then 'dm' else 'player' end,
      'actor_name', case when dm and h.actor_id is not null then private.member_name(h.actor_id) end,
      'changes', h.changes) order by h.created_at desc, h.id desc)
    from (
      select x.id, x.created_at, x.kind, x.actor_id,
          private.history_changes(x.kind, x.before_value, x.after_value) changes
        from public.character_events x
        where x.campaign_id = target_campaign and x.character_id = target_character
          and x.kind in ('characters:INSERT', 'characters:UPDATE', 'character_sheets:UPDATE',
            'character_vitals:UPDATE', 'character_resources:UPDATE')
          and (before_at is null or x.created_at < before_at)
          and (x.kind = 'characters:INSERT'
            or jsonb_array_length(private.history_changes(x.kind, x.before_value, x.after_value)) > 0)
        order by x.created_at desc, x.id desc
        limit size) h), '[]'::jsonb);
end;
$fn$;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.profiles') is null
      and to_regprocedure('pre.get_character_history(uuid,uuid,timestamptz,integer)') is not null
      and to_regprocedure('pre.list_campaign_members(uuid)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$profiles$;
