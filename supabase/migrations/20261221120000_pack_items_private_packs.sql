-- RYT-166 and RYT-163: items come from the campaign's content packs, and private packs are offered
-- only to the campaigns their owner adds (ADR 051, owner choices of block J).
--
-- What.
--   - public.content_pack_offers (pack, campaign): the campaigns a private pack is offered to.
--     private.content_offered(pack, campaign) is true for a published pack that is public, or
--     private and offered to that campaign. Every campaign content reader (Content section,
--     creatures, spells, class features, rules and items) takes the campaign into account: the
--     functions that called the one-argument check with a target_campaign argument are rewritten
--     in place to pass it.
--   - Removing a campaign from a private pack (owner choice P6 A) works as a pack made private:
--     the Content section still lists it while the campaign has it enabled, so its DM can turn it
--     off, and its entries, changes and newer versions stop being read at once. What the campaign
--     already copied (storeroom items, choices stored on characters) stays.
--   - get_content_pack_offers and set_content_pack_offer: the pack's owner (a content editor) or a
--     super admin lists and changes the campaigns of a private pack. The owner adds campaigns where
--     they are an active DM; a super admin adds any campaign (owner choice P5 A). Removing works
--     for every campaign in the list.
--   - get_campaign_item_packs and get_campaign_item_pack: the item packs of a campaign at their
--     pinned versions with their hidden keys, and one pack's items, for the campaign's DM (the
--     storeroom import and shop stocking). Each read is capped at 8 MB, checked before it is built.
--   - Publishing a version advances, in every campaign pinned at the previous version, the
--     categories that version does not change, so only real changes ask for review.
--   - The first published version with items of the public SRD pack (slug srd-5-2-1) or of the
--     public Rytta basics pack (slug rytta-basics) owned by the SRD's owner or a super admin, enables
--     its items in every campaign; new campaigns start with the items of both (owner choice P1 A).
--   - The one-argument private.content_offered(pack) is dropped once no reader uses it, and account
--     deletion clears the account from content_pack_offers.added_by.
--
-- Actor matrix.
--   anon: no table access, no function execution.
--   outsider, inactive member, Player, DM of another campaign: Forbidden on the item readers.
--   active DM of the campaign (also admin access): reads its item packs.
--   a DM of a campaign a private pack is not offered to: never sees the pack in lists, entries,
--     changes or readers (Invalid request on direct calls).
--   content editor that does not own the pack, signed-in non-editor: Forbidden on the offer RPCs.
--   pack owner: lists and changes the pack's campaigns; adds only campaigns where they are an
--     active DM. Super admin: any pack, any campaign.
-- Offers are idempotent by nature (add, remove). No table gains a client grant.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists.
do $migration$
declare ddl text := $ddl$
create table if not exists public.content_pack_offers (
  pack_id uuid not null references public.content_packs(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id) on delete set null,
  primary key (pack_id, campaign_id)
);
create index if not exists content_pack_offers_campaign on public.content_pack_offers (campaign_id);
create index if not exists content_pack_offers_added_by on public.content_pack_offers (added_by);
alter table public.content_pack_offers enable row level security;
revoke all on public.content_pack_offers from public, anon, authenticated;
comment on table public.content_pack_offers is
  'RYT-163 campaigns a private content pack is offered to. RPC access only.';

/** A pack a campaign may use: published, and public or private and offered to that campaign. */
create or replace function private.content_offered(target_pack uuid, target_campaign uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return exists (select 1 from public.content_packs p
    where p.id = target_pack and p.version > 0
      and (p.visibility = 'public' or exists (select 1 from public.content_pack_offers o
        where o.pack_id = p.id and o.campaign_id = target_campaign)));
end;
$fn$;

/** The pack, locked, when the caller may manage its campaigns: its owner (an editor) or a super admin. */
create or replace function private.content_offer_manager(target_pack uuid, locked boolean)
returns public.content_packs
language plpgsql security definer set search_path = '' as $fn$
declare p public.content_packs;
begin
  if locked then
    select * into p from public.content_packs x where x.id = target_pack for update;
  else
    select * into p from public.content_packs x where x.id = target_pack;
  end if;
  if not found or not (private.is_super_admin()
      or (private.is_content_editor() and p.owner_id = (select auth.uid()))) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  return p;
end;
$fn$;

create or replace function private.content_offer_list(p public.content_packs) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return jsonb_build_object('pack', p.id, 'visibility', p.visibility,
    'super_admin', private.is_super_admin(),
    'offered', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'added_at', o.added_at) order by lower(c.name), c.id)
      from public.content_pack_offers o join public.campaigns c on c.id = o.campaign_id
     where o.pack_id = p.id), '[]'::jsonb),
    -- Campaigns the caller runs as an active DM (not through admin access).
    'mine', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)
        order by lower(c.name), c.id)
      from public.campaigns c
     where exists (select 1 from public.campaign_members m where m.campaign_id = c.id
         and m.user_id = (select auth.uid()) and m.active and m.role = 'dm')), '[]'::jsonb));
end;
$fn$;

/** The campaigns a private pack is offered to, and the caller's own campaigns to add. */
create or replace function public.get_content_pack_offers(target_pack uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  return private.content_offer_list(private.content_offer_manager(target_pack, false));
end;
$fn$;

/** Offers a private pack to a campaign, or stops offering it. */
create or replace function public.set_content_pack_offer(target_pack uuid, target_campaign uuid,
  offered boolean) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare p public.content_packs := private.content_offer_manager(target_pack, true);
begin
  if offered is null or target_campaign is null then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if offered then
    if not private.is_super_admin() and not exists (select 1 from public.campaign_members m
        where m.campaign_id = target_campaign and m.user_id = (select auth.uid())
          and m.active and m.role = 'dm') then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    -- Offers only mean something for a private pack; a super admin may name a missing campaign.
    if p.visibility <> 'private' or not exists (select 1 from public.campaigns c where c.id = target_campaign) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    insert into public.content_pack_offers (pack_id, campaign_id, added_by)
      values (p.id, target_campaign, (select auth.uid())) on conflict do nothing;
  else
    delete from public.content_pack_offers o where o.pack_id = p.id and o.campaign_id = target_campaign;
  end if;
  return private.content_offer_list(p);
end;
$fn$;

/** The item packs a campaign has, at their pinned version, with the keys of their hidden items. */
create or replace function public.get_campaign_item_packs(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack();
begin
  perform private.campaign_content_require_dm(target_campaign);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'ref', private.content_pack_ref(p.id), 'slug', p.slug,
      'title_en', p.title_en, 'title_es', p.title_es, 'srd', coalesce(p.id = srd, false),
      'version', c.version, 'enabled', c.enabled,
      'hidden', coalesce((select jsonb_agg(h.key order by h.key) from public.campaign_content_hidden h
         where h.campaign_id = c.campaign_id and h.pack_id = c.pack_id and h.category = 'items'
           and h.kind = 'item'), '[]'::jsonb))
      order by (p.id = srd) desc, p.title_en, p.id)
    from public.campaign_content c join public.content_packs p on p.id = c.pack_id
   where c.campaign_id = target_campaign and c.category = 'items'
     and private.content_offered(p.id, target_campaign)), '[]'::jsonb);
end;
$fn$;

/** One pack's items at the campaign's pinned version. */
create or replace function public.get_campaign_item_pack(target_campaign uuid, target_pack uuid,
  at_version integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare pinned integer;
begin
  perform private.campaign_content_require_dm(target_campaign);
  if at_version is null or not private.content_offered(target_pack, target_campaign) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select c.version into pinned from public.campaign_content c
   where c.campaign_id = target_campaign and c.pack_id = target_pack and c.category = 'items';
  if pinned is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  if pinned <> at_version then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if (select coalesce(sum(octet_length(a.data::text) + octet_length(a.key) + octet_length(a.name_en)
        + octet_length(a.name_es)), 0)
      from private.content_at(target_pack, 'items', pinned) a where a.kind = 'item') > 8388608 then
    raise exception 'Too large' using errcode = '22023'; end if;
  return jsonb_build_object('version', pinned, 'entries', coalesce((select jsonb_agg(jsonb_build_object(
      'key', a.key, 'name_en', a.name_en, 'name_es', a.name_es, 'data', a.data) order by a.key)
    from private.content_at(target_pack, 'items', pinned) a where a.kind = 'item'), '[]'::jsonb));
end;
$fn$;

/** The public packs whose first items reach every campaign: the SRD (its slug is taken where it was
 * uploaded) and the Rytta basics when the SRD's owner or a super admin owns them (a slug alone is not
 * enough: any content editor could claim it). */
create or replace function private.content_default_item_pack(target_pack uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return exists (select 1 from public.content_packs p where p.id = target_pack and p.version > 0
    and p.visibility = 'public'
    and (p.slug = 'srd-5-2-1' or (p.slug = 'rytta-basics' and p.owner_id is not null and (
      exists (select 1 from private.super_admins s where s.user_id = p.owner_id)
      or p.owner_id = (select x.owner_id from public.content_packs x where x.slug = 'srd-5-2-1')))));
end;
$fn$;

/** After a pack publishes a version: advance unchanged categories and enable first default items. */
create or replace function private.content_pack_published() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if new.version > old.version and old.version > 0 then
    update public.campaign_content c set version = new.version, updated_at = now()
     where c.pack_id = new.id and c.version = old.version
       and not exists (select 1 from public.content_entry_versions v
         where v.pack_id = new.id and v.version = new.version and private.content_category(v.kind) = c.category);
  end if;
  -- A default pack reaches every campaign when its first items are published, or when it becomes
  -- a published public pack with items.
  if private.content_default_item_pack(new.id)
      and exists (select 1 from public.content_entry_versions v where v.pack_id = new.id and v.kind = 'item')
      and (old.visibility <> 'public' or old.version = 0
        or (new.version > old.version and not exists (select 1 from public.content_entry_versions v
          where v.pack_id = new.id and v.version <= old.version and v.kind = 'item'))) then
    insert into public.campaign_content (campaign_id, pack_id, category, version)
      select c.id, new.id, 'items', new.version from public.campaigns c
      on conflict do nothing;
  end if;
  return null;
end;
$fn$;
drop trigger if exists content_packs_published on public.content_packs;
create trigger content_packs_published after update of version, visibility on public.content_packs
  for each row execute function private.content_pack_published();

/** New campaigns: the SRD for every category it has, and the items of the Rytta basics. */
create or replace function private.campaign_content_defaults() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack(); current_version integer;
begin
  if srd is not null then
    select p.version into current_version from public.content_packs p where p.id = srd;
    insert into public.campaign_content (campaign_id, pack_id, category, version, updated_by)
      select new.id, srd, c.category, current_version, new.owner_id
        from (select distinct private.content_category(v.kind) category
                from public.content_entry_versions v where v.pack_id = srd) c
       where c.category is not null and c.category <> 'creatures'
      on conflict do nothing;
    -- Creatures go through the bestiary record, which enables them here too.
    if exists (select 1 from public.content_entry_versions v
        where v.pack_id = srd and private.content_category(v.kind) = 'creatures') then
      insert into public.campaign_srd_bestiary (campaign_id) values (new.id) on conflict do nothing;
    end if;
  end if;
  insert into public.campaign_content (campaign_id, pack_id, category, version, updated_by)
    select new.id, p.id, 'items', p.version, new.owner_id from public.content_packs p
     where p.slug = 'rytta-basics' and private.content_default_item_pack(p.id)
       and exists (select 1 from public.content_entry_versions v where v.pack_id = p.id and v.kind = 'item')
    on conflict do nothing;
  return null;
end;
$fn$;

revoke all on function private.content_offered(uuid, uuid), private.content_offer_manager(uuid, boolean),
  private.content_offer_list(public.content_packs), private.content_default_item_pack(uuid),
  private.content_pack_published(), private.campaign_content_defaults()
  from public, anon, authenticated;
revoke all on function public.get_content_pack_offers(uuid), public.set_content_pack_offer(uuid, uuid, boolean),
  public.get_campaign_item_packs(uuid), public.get_campaign_item_pack(uuid, uuid, integer)
  from public, anon;
grant execute on function public.get_content_pack_offers(uuid), public.set_content_pack_offer(uuid, uuid, boolean),
  public.get_campaign_item_packs(uuid), public.get_campaign_item_pack(uuid, uuid, integer)
  to authenticated;
$ddl$;
  env text; fn regprocedure; def text; patched text; remaining text;
begin
  if to_regclass('pre.campaign_content') is not null
      and to_regprocedure('pre_private.content_pack_ref(uuid)') is not null
      and to_regprocedure('pre_private.is_super_admin()') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
  -- Campaign readers pass their campaign to the offer check.
  foreach env in array array['public', 'pre'] loop
    if to_regprocedure(case env when 'pre' then 'pre_private' else 'private' end
        || '.content_offered(uuid,uuid)') is null then continue; end if;
    for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in (env, case env when 'pre' then 'pre_private' else 'private' end)
          and p.prosrc ~ 'content_offered\([a-z_.]+\)' and 'target_campaign' = any (p.proargnames) loop
      def := pg_get_functiondef(fn);
      patched := regexp_replace(def, 'content_offered\(([a-z_.]+)\)', 'content_offered(\1, target_campaign)', 'g');
      execute patched;
    end loop;
    select string_agg(p.oid::regprocedure::text, ', ') into remaining
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in (env, case env when 'pre' then 'pre_private' else 'private' end)
       and p.prosrc ~ 'content_offered\([a-z_.]+\)';
    if remaining is not null then
      raise exception 'pack offers: content_offered without a campaign in %', remaining; end if;
    execute format('drop function if exists %I.content_offered(uuid)',
      case env when 'pre' then 'pre_private' else 'private' end);
  end loop;
end;
$migration$;

-- Deleting one's account also clears it as the one who offered a pack to a campaign.
do $deletion$
declare env text; fn regprocedure; def text; anchor text;
begin
  foreach env in array array['public', 'pre'] loop
    fn := to_regprocedure(env || '.delete_my_account(text,uuid)');
    if fn is null or to_regclass(env || '.content_pack_offers') is null then continue; end if;
    def := pg_get_functiondef(fn);
    if strpos(def, '.content_pack_offers set added_by') > 0 then continue; end if;
    anchor := 'delete from ' || env || '.profiles where user_id = viewer;';
    if strpos(def, anchor) = 0 then
      raise exception 'delete_my_account changed: % not found', anchor; end if;
    execute replace(def, anchor, format(
      'update %1$s.content_pack_offers set added_by = null where added_by = viewer; %2$s', env, anchor));
  end loop;
end;
$deletion$;
