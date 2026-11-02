-- RYT-026. Additive application migration; PRE uses the canonical pre_admin.remap.
-- DM: attach images. Assigned Player: read only carried or visible shop images.
-- Anonymous, outsiders and other-campaign DMs: no access.
alter table public.item_definitions add column image_path text;

create function private.can_read_item_image(target_campaign uuid, target_definition uuid, object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.item_definitions d
    where d.campaign_id = target_campaign and d.id = target_definition and d.image_path = object_name
      and (private.is_campaign_dm(target_campaign) or (
        private.is_campaign_member(target_campaign) and (
          exists (select 1 from public.inventory_items i join public.characters c on c.id = i.character_id
            where i.campaign_id = target_campaign and i.definition_id = d.id and i.quantity > 0
              and c.user_id = auth.uid())
          or exists (select 1 from public.shop_listings l join public.characters c on c.campaign_id = l.campaign_id
            where l.campaign_id = target_campaign and l.definition_id = d.id and c.user_id = auth.uid()
              and private.listing_visible(l.id, c.id))
        )
      )));
end;
$$;
revoke all on function private.can_read_item_image(uuid, uuid, text) from public, anon, authenticated;

create function public.set_item_image(target_campaign uuid, target_definition uuid,
  expected_revision bigint, new_path text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare req jsonb := jsonb_build_array('item_image', target_campaign, target_definition, expected_revision, new_path);
  replay jsonb; item public.item_definitions; found_object boolean;
  environment text := case when current_schema() = 'pre' then 'pre' else 'public' end;
begin
  -- search_path is empty: derive the environment from this function's owning table.
  environment := case when 'public.item_definitions'::regclass::text like 'pre.%' then 'pre' else 'public' end;
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select r.result into replay from private.inventory_requests r
    where r.request_id = set_item_image.request_id and r.actor_id = auth.uid() and r.payload = req;
  if replay is not null then return replay; end if;
  if exists (select 1 from private.inventory_requests r where r.request_id = set_item_image.request_id) then
    raise exception 'Request mismatch' using errcode = '22023'; end if;
  select * into item from public.item_definitions where campaign_id = target_campaign and id = target_definition for update;
  if item.id is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if item.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if new_path is not null then
    if new_path !~ ('^' || environment || '/' || target_campaign || '/' || target_definition || '/[0-9a-f-]{36}[.](webp|png|jpg)$') then
      raise exception 'Invalid image path' using errcode = '22023'; end if;
    if to_regclass('storage.objects') is null then raise exception 'Image unavailable' using errcode = '22023'; end if;
    execute 'select exists (select 1 from storage.objects where bucket_id = ''item-images'' and name = $1)'
      into found_object using new_path;
    if not found_object then raise exception 'Image unavailable' using errcode = '22023'; end if;
  end if;
  update public.item_definitions set image_path = new_path, revision = revision + 1
    where id = target_definition;
  return private.inventory_finish(request_id, req, jsonb_build_object('id', target_definition, 'revision', item.revision + 1));
end;
$$;
revoke all on function public.set_item_image(uuid, uuid, bigint, text, uuid) from public, anon;
grant execute on function public.set_item_image(uuid, uuid, bigint, text, uuid) to authenticated;

create or replace function private.shop_item_json(target_definition uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select jsonb_build_object('id', d.id, 'name', d.name, 'category', d.category, 'icon', d.icon,
      'image_path', d.image_path, 'rarity', d.rarity, 'weight_tenths', d.weight_tenths, 'description', d.description,
      'slot_kind', d.slot_kind, 'properties', d.properties)
    from public.item_definitions d where d.id = target_definition);
end;
$$;

-- GLOBAL STORAGE: shared Auth/Storage router, deliberately outside PRE remapping.
create or replace function private.item_image_access(object_name text, writing boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare env text := split_part(object_name, '/', 1); helper text; campaign uuid; definition uuid; allowed boolean;
begin
  if object_name !~ '^(public|pre)/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](webp|png|jpg)$' then return false; end if;
  begin
    campaign := split_part(object_name, '/', 2)::uuid;
    definition := split_part(object_name, '/', 3)::uuid;
  exception when invalid_text_representation then return false; end;
  helper := case env when 'pre' then 'pre_private' else 'private' end;
  if to_regprocedure(format('%I.can_read_item_image(uuid,uuid,text)', helper)) is null then return false; end if;
  if writing then
    execute format('select %I.is_campaign_dm($1) and exists (select 1 from %I.item_definitions where campaign_id=$1 and id=$2)', helper, env)
      into allowed using campaign, definition;
  else
    -- DMs may read unattached uploads for preview and cleanup; Players never may.
    execute format('select %I.is_campaign_dm($1) or %I.can_read_item_image($1,$2,$3)', helper, helper)
      into allowed using campaign, definition, object_name;
  end if;
  return coalesce(allowed, false);
end;
$$;
revoke all on function private.item_image_access(text, boolean) from public, anon;
grant execute on function private.item_image_access(text, boolean) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('item-images', 'item-images', false, 1048576, array['image/webp','image/png','image/jpeg'])
    on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='item_images_read') then
    execute $p$create policy item_images_read on storage.objects for select to authenticated
      using (bucket_id = 'item-images' and private.item_image_access(name, false))$p$;
    execute $p$create policy item_images_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'item-images' and private.item_image_access(name, true))$p$;
    execute $p$create policy item_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'item-images' and private.item_image_access(name, true))$p$;
  end if;
end
$storage$;
