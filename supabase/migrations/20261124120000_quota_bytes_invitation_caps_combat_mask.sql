-- RYT-113 follow-up: closes the non-blocking review findings of 20261122120000. Additive: no row
-- or stored object is removed or rewritten; existing data over a limit stays usable.
--
-- 1. Stored bytes. Besides 200 objects / 30 audio per campaign, an upload is refused once the
--    campaign prefix already stores media_mb_per_campaign (500 MB) or once all campaigns of the
--    campaign owner in that environment store media_mb_per_owner (2048 MB), across the five app
--    buckets. Supabase Storage checks the INSERT policy before the object exists in its final
--    form: the row it tests carries no size, and metadata is written by the Storage service
--    afterwards. The check therefore sums metadata.size of the objects already stored and relies
--    on each bucket's file_size_limit for the new object, so one upload can overshoot a cap by at
--    most that limit (1 MB images, 20 MB tabletop media). Overwrites (upsert) go through the
--    UPDATE policy and are bounded by the same per-object limit. Limits are kept in megabytes
--    because private.quota_limits.max_count is capped at 1000000. A bucket whose
--    file_size_limit is missing gets its documented default (never changed when present).
-- 2. Replaced images. The browser adapters now delete the previous portrait, item image or shop
--    image right after a successful replace or clear (only when no row of the campaign still
--    references it). The existing DELETE storage policies already admit exactly who may replace:
--    portraits can_play_character (as set_character_portrait), item and shop images the campaign
--    DM (as set_item_image / set_shop_image; shops not archived). No storage object is deleted
--    from SQL.
-- 3. characters_per_user is per campaign and user and counts non-archived characters only, so
--    archiving frees a slot. characters_per_campaign (archived included) remains the backstop.
-- 4. Seats: invitation creation also takes an advisory lock on the campaign, so co-DMs inviting
--    at the same time cannot exceed members_per_campaign. Lock order: inviter, campaign, email.
-- 5. pending_invitations_per_recipient (20): an email with that many pending, unexpired
--    invitations refuses new ones with 'Recipient invitation limit'. Trade-off: a flood can fill
--    a recipient's inbox until they decline (each decline also blocks that campaign 7 days) or
--    the invitations expire; it can no longer push legitimate ones out of list_my_invitations.
-- 6. private.combat_result (returned by every combat RPC, including set_initiative and
--    record_death_save that Players call) hides active_combatant when it is a hidden combatant
--    and the caller is not the campaign DM, as get_combat_state does.
--
-- Actor matrix (changed objects):
--   anon: no execute on any function here; storage refused as before.
--   outsider / DM of another campaign: storage and invitation rules unchanged (Forbidden / RLS);
--          quotas apply to their own campaigns only.
--   Player: combat RPC results never name a hidden active combatant; own characters count
--          against characters_per_user while not archived; may delete the portrait objects of
--          characters they may play.
--   campaign DM: unmasked combat results; deletes item and shop images of the campaign.
-- Every function is security definer with search_path '' and no execute for public or anon;
-- only private.storage_quota_ok stays granted to authenticated (storage policy helper).
--
-- Environments: production runs the DDL on public / private. A PRE that already has the RYT-113
-- quota table receives the same DDL through pre_admin.remap (idempotent: create or replace and
-- on conflict do nothing). storage_quota_ok and the bucket limits are global and stay outside the
-- remapped DDL; PRE objects read pre_private limits, falling back to private ones.

do $m$
declare ddl text := $ddl$
insert into private.quota_limits (quota, max_count) values
  ('media_mb_per_campaign', 500), ('media_mb_per_owner', 2048),
  ('pending_invitations_per_recipient', 20)
  on conflict (quota) do nothing;

create or replace function private.quota_characters() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform private.quota_lock('characters_per_campaign', new.campaign_id);
  if (select count(*) from public.characters c where c.campaign_id = new.campaign_id)
      >= private.quota_limit('characters_per_campaign') then
    raise exception 'Character limit' using errcode = 'P0001'; end if;
  if new.user_id is not null and (select count(*) from public.characters c
      where c.campaign_id = new.campaign_id and c.user_id = new.user_id and c.archived_at is null)
      >= private.quota_limit('characters_per_user') then
    raise exception 'Character limit' using errcode = 'P0001'; end if;
  return new;
end;
$fn$;
comment on function private.quota_characters() is
  'RYT-113 quotas: characters_per_campaign counts every character of the campaign; characters_per_user counts the non-archived characters of one user in one campaign.';

create or replace function private.quota_invitations() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  member_email boolean;
begin
  perform private.quota_lock('invitations_per_inviter', new.created_by);
  perform private.quota_lock('members_per_campaign', new.campaign_id);
  perform pg_advisory_xact_lock(hashtextextended('pending_invitations_per_recipient:' || coalesce(new.email, ''), 113));
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
  if (select count(*) from public.campaign_invitations i
      where i.email = new.email and i.status = 'pending' and i.expires_at > now())
      >= private.quota_limit('pending_invitations_per_recipient') then
    raise exception 'Recipient invitation limit' using errcode = 'P0001'; end if;
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

-- plpgsql, not sql: the PRE ETL recreates functions in name order and a sql body is validated
-- against helpers (is_campaign_dm) that may not exist yet at that point.
create or replace function private.combat_result(target_encounter uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select jsonb_build_object('encounter_id', e.id, 'status', e.status, 'round', e.round,
    'active_combatant', case when private.is_campaign_dm(e.campaign_id)
        or not exists (select 1 from public.encounter_combatants h
          where h.id = e.active_combatant and h.hidden) then e.active_combatant end,
    'revision', e.revision)
  from public.encounters e where e.id = target_encounter);
end;
$fn$;

revoke all on function private.quota_characters(), private.quota_invitations(),
  private.combat_result(uuid) from public, anon, authenticated;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre_private.quota_limits') is not null
      and to_regprocedure('pre_private.combat_result(uuid)') is not null
      and to_regprocedure('pre_private.quota_invitations()') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$m$;

-- ---------------------------------------------------------------------------------------------
-- GLOBAL STORAGE: object, audio and byte quotas for every app bucket, outside PRE remapping.
-- Insert policies only (unchanged): deleting stays possible at any limit.
-- ---------------------------------------------------------------------------------------------
create or replace function private.storage_quota_ok(bucket text, object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
declare env text := split_part(object_name, '/', 1); helper text; campaign uuid; prefix text;
  media_limit integer; audio_limit integer; campaign_mb integer; owner_mb integer;
  total bigint; audio bigint; stored bigint; owner_stored bigint; prefixes text[];
  sized boolean;
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
    execute format('select coalesce(array_agg($2 || ''/'' || c.id::text || ''/%%''), ''{}'')
        from %1$I.campaigns c where c.owner_id = (select x.owner_id from %1$I.campaigns x where x.id = $1)', env)
      into prefixes using campaign, env;
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
  'RYT-113 storage quotas for INSERT policies: objects, audio and stored bytes per campaign, bytes per campaign owner. The new object is bounded by its bucket file_size_limit.';

-- Every app bucket keeps a per-object size limit; set the documented default only where missing.
do $buckets$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  update storage.buckets b set file_size_limit = case b.id when 'tabletop-media' then 20971520 else 1048576 end
    where b.id in ('character-portraits', 'item-images', 'creature-images', 'tabletop-media', 'shop-images')
      and b.file_size_limit is null;
end
$buckets$;
