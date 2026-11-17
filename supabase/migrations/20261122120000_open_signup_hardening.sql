-- RYT-113: security hardening for open sign-up. Additive; no user data is removed or rewritten.
--
-- 1. Encounters stop leaking combat secrets to Players. public.encounters.summary keeps every
--    combatant (hidden ones, true names behind aliases, damage) and active_combatant names hidden
--    turns; only get_combat_state masks them. The encounters table is now DM-only (policy
--    encounters_read), and members follow public.encounter_signals instead: one secret-free row per
--    encounter (status, revision, updated_at) kept by a trigger, with the former member policy
--    (DM, or a member once the encounter leaves draft). encounter_signals replaces encounters in the
--    supabase_realtime publication, so no realtime payload carries a summary or an active turn.
-- 2. set_shop_modifier refuses a shop or character outside target_campaign before writing, and the
--    delete and the upsert are keyed on the campaign: a DM of campaign A can no longer delete or
--    change a modifier of campaign B through a shop id of B.
-- 3. Quotas, tunable in one table (private.quota_limits, read through private.quota_limit), checked
--    when a row is created, never against rows that already exist:
--      campaigns_per_owner 20        'Campaign limit'      campaigns insert
--      members_per_campaign 30       'Member limit'        active members + pending invitations,
--                                                          checked when an invitation is created
--      scenes_per_campaign 60        'Scene limit'         tabletop_scenes insert
--      characters_per_user 10        'Character limit'     characters insert for a user (archived
--                                                          included; the 4-in-roster rule stays)
--      characters_per_campaign 300   'Character limit'     characters insert (DM pool included)
--      media_per_campaign 200        storage refused       objects under {env}/{campaign}/ in the
--      audio_per_campaign 30         storage refused       five app buckets / tabletop-media audio
--    Errors use errcode P0001 like the existing 'Character limit'. Storage refusals surface as the
--    usual Storage RLS rejection. Each check takes a transaction advisory lock on its scope, so
--    concurrent creations cannot overshoot (storage counts are best-effort: policies cannot lock).
-- 4. Invitations: per inviter at most invitations_per_hour (20, rolling hour) and
--    pending_invitations_per_inviter (100) -> 'Too many invitations'. A declined invitation blocks
--    a new one for the same campaign and email for decline_cooldown_days (7) -> 'Invitation
--    declined'; campaign_invitations gains responded_at (set by trigger on accept or decline).
--    list_my_invitations returns at most invitations_listed (50), newest first.
-- 5. Low findings: portrait uploads must match {env}/{campaign}/{character}/{uuid}.{webp|png|jpg}
--    (insert policy only, so existing objects stay deletable).
--
-- Actor matrix (changed objects):
--   anon: no grant on encounters, encounter_signals or any function here; storage refused.
--   outsider / inactive member / DM of another campaign: no encounters or encounter_signals rows;
--           set_shop_modifier Forbidden on a foreign campaign and Shop/Character unavailable for
--           foreign ids through their own campaign; quotas apply to their own creations.
--   Player: encounter_signals of non-draft encounters of their campaign; no encounters rows.
--   campaign DM: encounters and every signal of the campaign; modifiers of own shops only.
-- New tables have RLS on and explicit grants (encounter_signals: SELECT to authenticated;
-- private.quota_limits: none). Every function is security definer with search_path '' and no
-- execute for public or anon; only storage_quota_ok (storage policy helper) is granted to
-- authenticated, like the other storage routers.
--
-- Environments: production runs the DDL on public / private. A PRE copied before this file
-- (pre.encounters present, pre.encounter_signals absent) receives the same DDL through
-- pre_admin.remap, with its own pre_private.quota_limits. The storage helper and the storage
-- policies are global and stay outside the remapped DDL; they dispatch by object prefix.

do $m$
declare ddl text := $ddl$
-- ---------------------------------------------------------------------------------------------
-- Quotas
-- ---------------------------------------------------------------------------------------------
create table private.quota_limits (
  quota text primary key check (quota ~ '^[a-z_]{1,60}$'),
  max_count integer not null check (max_count between 0 and 1000000),
  updated_at timestamptz not null default now()
);
alter table private.quota_limits enable row level security;
revoke all on private.quota_limits from public, anon, authenticated;
comment on table private.quota_limits is
  'RYT-113 tenant quotas. Tune max_count here; checks apply to new rows only. No client access.';
insert into private.quota_limits (quota, max_count) values
  ('campaigns_per_owner', 20), ('members_per_campaign', 30), ('scenes_per_campaign', 60),
  ('characters_per_user', 10), ('characters_per_campaign', 300), ('media_per_campaign', 200),
  ('audio_per_campaign', 30), ('invitations_per_hour', 20), ('pending_invitations_per_inviter', 100),
  ('invitations_listed', 50), ('decline_cooldown_days', 7)
  on conflict (quota) do nothing;

create function private.quota_limit(quota_key text) returns integer
language plpgsql stable security definer set search_path = '' as $fn$
declare result integer;
begin
  select q.max_count into result from private.quota_limits q where q.quota = quota_key;
  if result is null then raise exception 'Unknown quota' using errcode = '22023'; end if;
  return result;
end;
$fn$;

-- Serializes creations within one quota scope until the transaction ends.
create function private.quota_lock(quota_key text, scope uuid) returns void
language plpgsql volatile security definer set search_path = '' as $fn$
begin
  perform pg_advisory_xact_lock(hashtextextended(quota_key || ':' || coalesce(scope::text, ''), 113));
end;
$fn$;

create function private.quota_campaigns() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform private.quota_lock('campaigns_per_owner', new.owner_id);
  if (select count(*) from public.campaigns c where c.owner_id = new.owner_id)
      >= private.quota_limit('campaigns_per_owner') then
    raise exception 'Campaign limit' using errcode = 'P0001'; end if;
  return new;
end;
$fn$;
create trigger quota_campaigns before insert on public.campaigns
  for each row execute function private.quota_campaigns();

create function private.quota_scenes() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform private.quota_lock('scenes_per_campaign', new.campaign_id);
  if (select count(*) from public.tabletop_scenes s where s.campaign_id = new.campaign_id)
      >= private.quota_limit('scenes_per_campaign') then
    raise exception 'Scene limit' using errcode = 'P0001'; end if;
  return new;
end;
$fn$;
create trigger quota_scenes before insert on public.tabletop_scenes
  for each row execute function private.quota_scenes();

create function private.quota_characters() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform private.quota_lock('characters_per_campaign', new.campaign_id);
  if (select count(*) from public.characters c where c.campaign_id = new.campaign_id)
      >= private.quota_limit('characters_per_campaign') then
    raise exception 'Character limit' using errcode = 'P0001'; end if;
  if new.user_id is not null and (select count(*) from public.characters c
      where c.campaign_id = new.campaign_id and c.user_id = new.user_id)
      >= private.quota_limit('characters_per_user') then
    raise exception 'Character limit' using errcode = 'P0001'; end if;
  return new;
end;
$fn$;
create trigger quota_characters before insert on public.characters
  for each row execute function private.quota_characters();

-- ---------------------------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------------------------
alter table public.campaign_invitations add column responded_at timestamptz;
comment on column public.campaign_invitations.responded_at is
  'RYT-113: when the invitee accepted or declined (null for older rows). Trigger-maintained.';

create function private.invitation_responded() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if new.status is distinct from old.status and new.status in ('accepted', 'declined') then
    new.responded_at := now(); end if;
  return new;
end;
$fn$;
create trigger invitation_responded before update on public.campaign_invitations
  for each row execute function private.invitation_responded();

create function private.quota_invitations() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  member_email boolean;
begin
  perform private.quota_lock('invitations_per_inviter', new.created_by);
  if exists (select 1 from public.campaign_invitations i
      where i.campaign_id = new.campaign_id and i.email = new.email and i.status = 'declined'
        and i.responded_at > now() - make_interval(days => private.quota_limit('decline_cooldown_days'))) then
    raise exception 'Invitation declined' using errcode = 'P0001'; end if;
  if (select count(*) from public.campaign_invitations i
      where i.created_by = new.created_by and i.created_at > now() - interval '1 hour')
      >= private.quota_limit('invitations_per_hour')
    or (select count(*) from public.campaign_invitations i
      where i.created_by = new.created_by and i.status = 'pending' and i.expires_at > now())
      >= private.quota_limit('pending_invitations_per_inviter') then
    raise exception 'Too many invitations' using errcode = 'P0001'; end if;
  -- Seats: active members plus pending invitations of people who are not members yet. Inviting an
  -- existing member (a character claim) takes no new seat.
  select exists (select 1 from public.campaign_members m join auth.users u on u.id = m.user_id
      where m.campaign_id = new.campaign_id and m.active and lower(u.email) = new.email)
    into member_email;
  if not member_email and
      (select count(*) from public.campaign_members m where m.campaign_id = new.campaign_id and m.active)
      + (select count(distinct i.email) from public.campaign_invitations i
          where i.campaign_id = new.campaign_id and i.status = 'pending' and i.expires_at > now()
            and not exists (select 1 from public.campaign_members m join auth.users u on u.id = m.user_id
              where m.campaign_id = i.campaign_id and m.active and lower(u.email) = i.email))
      >= private.quota_limit('members_per_campaign') then
    raise exception 'Member limit' using errcode = 'P0001'; end if;
  return new;
end;
$fn$;
create trigger quota_invitations before insert on public.campaign_invitations
  for each row execute function private.quota_invitations();

create or replace function public.list_my_invitations()
returns table(id uuid, campaign_id uuid, campaign_name text, email text, expires_at timestamptz, character_id uuid, character_name text)
language sql stable security definer set search_path = '' as $fn$
  select i.id, i.campaign_id, c.name, i.email, i.expires_at, ch.id, ch.name
    from public.campaign_invitations i
    join public.campaigns c on c.id = i.campaign_id
    left join public.characters ch on ch.id = i.character_id and ch.campaign_id = i.campaign_id
    where i.email = private.verified_email() and i.status = 'pending' and i.expires_at > now()
    order by i.created_at desc, i.id
    limit private.quota_limit('invitations_listed');
$fn$;
revoke all on function public.list_my_invitations() from public, anon;
grant execute on function public.list_my_invitations() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Encounters: DM-only table, secret-free signal for members
-- ---------------------------------------------------------------------------------------------
create table public.encounter_signals (
  encounter_id uuid primary key,
  campaign_id uuid not null,
  status text not null check (status in ('draft', 'initiative', 'active', 'ended')),
  revision bigint not null check (revision between 0 and 9007199254740991),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, encounter_id) references public.encounters(campaign_id, id) on delete cascade
);
create index encounter_signals_campaign on public.encounter_signals(campaign_id);
alter table public.encounter_signals enable row level security;
revoke all on public.encounter_signals from public, anon, authenticated;
grant select on public.encounter_signals to authenticated;
create policy encounter_signals_read on public.encounter_signals for select to authenticated
  using (private.is_campaign_dm(campaign_id)
    or (status <> 'draft' and private.is_campaign_member(campaign_id)));
comment on table public.encounter_signals is
  'RYT-113 realtime signal per encounter: status and revision only. Trigger writes only.';

insert into public.encounter_signals (encounter_id, campaign_id, status, revision, updated_at)
  select e.id, e.campaign_id, e.status, e.revision, e.updated_at from public.encounters e
  on conflict (encounter_id) do nothing;

create function private.encounter_signal() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.encounter_signals (encounter_id, campaign_id, status, revision, updated_at)
    values (new.id, new.campaign_id, new.status, new.revision, now())
    on conflict (encounter_id) do update set status = excluded.status,
      revision = excluded.revision, updated_at = excluded.updated_at;
  return null;
end;
$fn$;
create trigger encounter_signal after insert or update on public.encounters
  for each row execute function private.encounter_signal();

drop policy encounters_read on public.encounters;
create policy encounters_read on public.encounters for select to authenticated
  using (private.is_campaign_dm(campaign_id));
comment on table public.encounters is
  'RYT-007 encounters: status, round, active turn and summary. DM-only reads (RYT-113); members follow encounter_signals. RPC writes only.';

-- ---------------------------------------------------------------------------------------------
-- Shops: the modifier write stays inside target_campaign
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_shop_modifier(target_campaign uuid, target_shop uuid,
  target_character uuid, new_percent integer) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  perform private.shop_lock(target_campaign, true, null);
  if new_percent is null or new_percent not between -100 and 100 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if not exists (select 1 from public.shops s where s.campaign_id = target_campaign and s.id = target_shop) then
    raise exception 'Shop unavailable' using errcode = '42501'; end if;
  if not exists (select 1 from public.characters c where c.campaign_id = target_campaign and c.id = target_character) then
    raise exception 'Character unavailable' using errcode = '42501'; end if;
  if new_percent = 0 then
    delete from public.shop_modifiers m
      where m.campaign_id = target_campaign and m.shop_id = target_shop and m.character_id = target_character;
  else
    insert into public.shop_modifiers (shop_id, campaign_id, character_id, percent)
      values (target_shop, target_campaign, target_character, new_percent)
      on conflict (shop_id, character_id) do update set percent = excluded.percent
        where public.shop_modifiers.campaign_id = excluded.campaign_id;
  end if;
end;
$fn$;
revoke all on function public.set_shop_modifier(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.set_shop_modifier(uuid, uuid, uuid, integer) to authenticated;

revoke all on function private.quota_limit(text), private.quota_lock(text, uuid),
  private.quota_campaigns(), private.quota_scenes(), private.quota_characters(),
  private.invitation_responded(), private.quota_invitations(), private.encounter_signal()
  from public, anon, authenticated;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.encounters') is not null and to_regclass('pre.encounter_signals') is null
      and to_regclass('pre.tabletop_scenes') is not null and to_regclass('pre.shop_modifiers') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$m$;

-- ---------------------------------------------------------------------------------------------
-- Realtime: the signal replaces the encounters row in the publication (both environments).
-- ---------------------------------------------------------------------------------------------
do $$
declare env text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach env in array array['public', 'pre'] loop
    if to_regclass(format('%I.encounter_signals', env)) is not null and not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime'
          and schemaname = env and tablename = 'encounter_signals') then
      execute format('alter publication supabase_realtime add table %I.encounter_signals', env);
    end if;
    if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = env and tablename = 'encounters') then
      execute format('alter publication supabase_realtime drop table %I.encounters', env);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- GLOBAL STORAGE: per-campaign object quota for every app bucket, outside PRE remapping. The
-- prefix selects the environment's quota table; dynamic SQL avoids a static storage dependency.
-- Insert policies only: deleting stays possible at the limit.
-- ---------------------------------------------------------------------------------------------
create function private.storage_quota_ok(bucket text, object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
declare env text := split_part(object_name, '/', 1); helper text; campaign uuid; prefix text;
  media_limit integer; audio_limit integer; total bigint; audio bigint;
begin
  if bucket is null or object_name is null or env not in ('public', 'pre') then return false; end if;
  begin
    campaign := split_part(object_name, '/', 2)::uuid;
  exception when invalid_text_representation then return false; end;
  if to_regclass('storage.objects') is null then return false; end if;
  helper := case env when 'pre' then 'pre_private' else 'private' end;
  if to_regprocedure(format('%I.quota_limit(text)', helper)) is null then helper := 'private'; end if;
  execute format('select %I.quota_limit($1), %I.quota_limit($2)', helper, helper)
    into media_limit, audio_limit using 'media_per_campaign', 'audio_per_campaign';
  prefix := env || '/' || campaign::text || '/';
  execute 'select count(*), count(*) filter (where o.bucket_id = ''tabletop-media''
        and split_part(o.name, ''/'', 3) = ''audio'')
      from storage.objects o
      where o.bucket_id in (''character-portraits'', ''item-images'', ''creature-images'',
          ''tabletop-media'', ''shop-images'')
        and o.name like $1'
    into total, audio using prefix || '%';
  if total >= media_limit then return false; end if;
  if bucket = 'tabletop-media' and split_part(object_name, '/', 3) = 'audio' and audio >= audio_limit then
    return false; end if;
  return true;
end;
$fn$;
revoke all on function private.storage_quota_ok(text, text) from public, anon;
grant execute on function private.storage_quota_ok(text, text) to authenticated;

do $storage$
begin
  if to_regclass('storage.objects') is null then return; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'portraits_insert') then
    execute $p$alter policy portraits_insert on storage.objects
      with check (bucket_id = 'character-portraits'
        and name ~ '^(public|pre)/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](webp|png|jpg)$'
        and private.can_access_portrait(name) and private.storage_quota_ok(bucket_id, name))$p$;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'item_images_insert') then
    execute $p$alter policy item_images_insert on storage.objects
      with check (bucket_id = 'item-images' and private.item_image_access(name, true)
        and private.storage_quota_ok(bucket_id, name))$p$;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'creature_images_insert') then
    execute $p$alter policy creature_images_insert on storage.objects
      with check (bucket_id = 'creature-images' and private.creature_image_access(name, true)
        and private.storage_quota_ok(bucket_id, name))$p$;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'tabletop_media_insert') then
    execute $p$alter policy tabletop_media_insert on storage.objects
      with check (bucket_id = 'tabletop-media' and private.tabletop_media_access(name, true)
        and private.storage_quota_ok(bucket_id, name))$p$;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'shop_images_insert') then
    execute $p$alter policy shop_images_insert on storage.objects
      with check (bucket_id = 'shop-images' and private.shop_image_access(name, true)
        and private.storage_quota_ok(bucket_id, name))$p$;
  end if;
end
$storage$;
