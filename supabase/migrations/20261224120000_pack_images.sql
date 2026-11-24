-- RYT-172: content library entries carry their own picture (owner choices of block P, ADR 053).
--
-- What.
--   - A creature, item, class or subclass entry may name a picture in `data.index.image`: an object
--     of the new private bucket `pack-images`, at `<env>/<pack id>/<uuid>.<webp|png|jpg>` (2 MB,
--     WebP, PNG or JPEG). It is part of the entry's data, so it is published with the pack version
--     and a campaign sees it when its DM updates the pack (P2 A). Replacing or removing a picture
--     never deletes the old object: earlier versions may still name it.
--   - private.content_entry_problem refuses an `index.image` that is not such a path.
--   - private.shop_item_json also returns the item's `basic_key` (the pack item it came from, an
--     entry id, no secret: the catalogue already gives it to Players), so shop tiles can show the
--     pack picture.
--   - public.get_campaign_pack_images(campaign): the pictures of the campaign's enabled packs at
--     their pinned version, by the id the app uses (`<key>` for the SRD, `<ref>--<key>` otherwise).
--     The DM receives every creature, item, class and subclass picture. Other members receive
--     only what they can already see: classes and subclasses, items the campaign's storeroom holds
--     (by basic_key), and creatures of public packs; never an entry the DM hid.
--   - An expression index finds the published versions that name a picture.
--
-- Actor matrix.
--   - Upload (storage insert): content editors (super admins included), only into an existing pack
--     of the path's environment. Nobody updates or deletes through the API.
--   - Read (storage select, which also governs listing and signing): content editors and the pack
--     owner read every object of the pack, drafts included. Anyone else reads only an object that
--     a published version of that pack names, and only when the pack is public (signed-in
--     accounts) or offered to a campaign they are an active member of. Anon never.
--   - get_campaign_pack_images: active campaign members (and super admins inside through the admin
--     panel, as is_campaign_member allows); outsiders and anon are refused.
--
-- PRE. The storage router is global (outside PRE remapping, like the other buckets) and picks
-- `pre` / `pre_private` from the path. The entry check, the index, shop_item_json and the campaign
-- reader are applied to public first and then, when PRE exists, to pre / pre_private with
-- pre_admin.remap.
do $migration$
declare ddl text := $ddl$
/** Creature keys leave room for the pack reference ('<ref>--<key>' within 80 characters). */
create or replace function private.content_entry_problem(kind text, key text, name_en text, name_es text, data jsonb)
returns text language sql immutable set search_path = '' as $fn$
  select case
    when kind is null or kind !~ '^[a-z][a-z0-9-]{0,31}$' then 'kind'
    when key is null or key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(key) > 80
      or (kind = 'creature' and char_length(key) > 70) then 'key'
    when name_en is null or name_es is null or char_length(name_en) > 120 or char_length(name_es) > 120
      or (name_en = '' and name_es = '') then 'name'
    when data is null or jsonb_typeof(data) <> 'object' then 'data'
    when octet_length(data::text) > 131072 then 'size'
    when data ? 'index' and (jsonb_typeof(data -> 'index') <> 'object'
      or octet_length((data -> 'index')::text) > 4096) then 'index'
    -- RYT-172: a picture is an object of the pack-images bucket.
    when data -> 'index' ? 'image' and (jsonb_typeof(data -> 'index' -> 'image') <> 'string'
      or (data -> 'index' ->> 'image') !~ '^(public|pre)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|png|jpg)$') then 'image'
  end;
$fn$;

/** The published versions that name a picture: the storage read policy looks them up. */
create index if not exists content_entry_versions_image on public.content_entry_versions
  (pack_id, ((data -> 'index') ->> 'image')) where (data -> 'index') ? 'image';

/** A shop's item for every reader; RYT-172 adds the pack item it came from (`basic_key`). */
create or replace function private.shop_item_json(target_definition uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select jsonb_build_object('id', d.id, 'name', d.name, 'category', d.category, 'icon', d.icon,
      'image_path', d.image_path, 'rarity', d.rarity, 'weight_tenths', d.weight_tenths,
      'weight_lb', d.weight_lb, 'description', d.description, 'translations', d.translations,
      'slot_kind', d.slot_kind, 'properties', d.properties, 'basic_key', d.basic_key)
    from public.item_definitions d where d.id = target_definition);
end;
$fn$;
revoke all on function private.shop_item_json(uuid) from public, anon, authenticated;

/** The pictures of a campaign's creatures, items and classes, at the versions it pins. */
create or replace function public.get_campaign_pack_images(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare dm boolean;
begin
  if target_campaign is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  return coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'id', x.id, 'path', x.path)
      order by x.kind, x.id)
    from (select a.kind,
        case when p.id = private.content_srd_pack() then a.key
          else private.content_pack_ref(p.id) || '--' || a.key end as id,
        a.data -> 'index' ->> 'image' as path,
        p.visibility, c.pack_id, c.category, a.key
      from public.campaign_content c
      join public.content_packs p on p.id = c.pack_id
      cross join lateral private.content_at(c.pack_id, c.category, c.version) a
     where c.campaign_id = target_campaign and c.enabled
       and c.category in ('creatures', 'items', 'classes')
       and private.content_offered(p.id, target_campaign)
       and a.kind in ('creature', 'item', 'class', 'subclass')
       and jsonb_typeof(a.data -> 'index' -> 'image') = 'string') x
   where dm or (
       not exists (select 1 from public.campaign_content_hidden h
         where h.campaign_id = target_campaign and h.pack_id = x.pack_id
           and h.category = x.category and h.kind = x.kind and h.key = x.key)
       and (x.kind in ('class', 'subclass')
         or (x.kind = 'creature' and x.visibility = 'public')
         or (x.kind = 'item' and exists (select 1 from public.item_definitions d
           where d.campaign_id = target_campaign and d.basic_key = x.id))))
   limit 3000), '[]'::jsonb);
end;
$fn$;
revoke all on function public.get_campaign_pack_images(uuid) from public;
revoke all on function public.get_campaign_pack_images(uuid) from anon;
grant execute on function public.get_campaign_pack_images(uuid) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.campaign_content') is not null
      and to_regclass('pre.content_entry_versions') is not null
      and to_regprocedure('pre_private.content_at(uuid,text,integer)') is not null
      and to_regprocedure('pre_private.content_offered(uuid,uuid)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$migration$;

-- GLOBAL STORAGE: shared Auth/Storage router, deliberately outside PRE remapping.
create or replace function private.pack_image_access(object_name text, writing boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare env text := split_part(object_name, '/', 1); helper text; pack uuid; allowed boolean;
begin
  if auth.uid() is null or object_name !~ ('^(public|pre)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|png|jpg)$') then
    return false; end if;
  pack := split_part(object_name, '/', 2)::uuid;
  helper := case env when 'pre' then 'pre_private' else 'private' end;
  if to_regprocedure(format('%I.is_content_editor()', helper)) is null
      or to_regprocedure(format('%I.is_campaign_member(uuid)', helper)) is null
      or to_regclass(format('%I.content_packs', env)) is null
      or to_regclass(format('%I.content_pack_offers', env)) is null
      or to_regclass(format('%I.content_entry_versions', env)) is null then return false; end if;
  if writing then
    execute format('select %I.is_content_editor() and exists (select 1 from %I.content_packs where id = $1)',
        helper, env)
      into allowed using pack;
  else
    -- Editors and the owner read the whole pack (drafts too). Anyone else reads only a picture a
    -- published version names, of a public pack or of one offered to a campaign they belong to.
    execute format($q$select %1$I.is_content_editor() or exists (select 1 from %2$I.content_packs p
        where p.id = $1 and (p.owner_id = auth.uid() or (p.version > 0
          and exists (select 1 from %2$I.content_entry_versions v
            where v.pack_id = p.id and (v.data -> 'index') ? 'image'
              and (v.data -> 'index') ->> 'image' = $2)
          and (p.visibility = 'public' or exists (select 1 from %2$I.content_pack_offers o
            where o.pack_id = p.id and %1$I.is_campaign_member(o.campaign_id))))))$q$, helper, env)
      into allowed using pack, object_name;
  end if;
  return coalesce(allowed, false);
end;
$$;
revoke all on function private.pack_image_access(text, boolean) from public, anon;
grant execute on function private.pack_image_access(text, boolean) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('pack-images', 'pack-images', false, 2097152,
      array['image/webp', 'image/png', 'image/jpeg'])
    on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'pack_images_read') then
    execute $p$create policy pack_images_read on storage.objects for select to authenticated
      using (bucket_id = 'pack-images' and private.pack_image_access(name, false))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'pack_images_insert') then
    execute $p$create policy pack_images_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'pack-images' and private.pack_image_access(name, true))$p$;
  end if;
end
$storage$;
