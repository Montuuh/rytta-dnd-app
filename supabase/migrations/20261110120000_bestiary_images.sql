-- RYT-053: creature art for the SRD bestiary and the DM's own image per SRD creature (ADR 030).
--
-- The bundled SRD art (openly licensed, attributed in the app) is public content and is not stored
-- here. This migration stores only the image a DM chooses for an SRD creature in one campaign; it
-- replaces the bundled art in that campaign's bestiary and in the DM's combat view.
--
-- Data:
--   campaign_creature_images           (campaign_id, srd_id) -> image_path in the private
--                                      'creature-images' bucket, DM-only reads, RPC writes only.
--
-- RPCs:
--   list_creature_srd_images (new)     DM: the campaign's SRD creature images.
--   set_creature_srd_image (new)       DM: attach an uploaded object to an SRD creature, or clear it
--                                      (null) to restore the bundled art. Idempotent request id,
--                                      campaign lock, path of the own environment, campaign and
--                                      creature, and the object must exist.
--
-- Storage (global, outside PRE remapping): private.creature_image_access also accepts
-- '{public|pre}/{campaign}/srd-{srd id}/{uuid}.{webp|png|jpg}'. The campaign DM reads, uploads and
-- deletes those objects; Players never read them (the SRD image is not part of their projection).
--
-- Actor matrix: anon cannot execute; outsiders and inactive members raise Forbidden; Players raise
-- Forbidden; a DM of another campaign raises Forbidden through the target campaign id.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has the
-- RYT-046 bestiary columns and not this change, the same DDL is executed again remapped with
-- pre_admin.remap. A PRE that already has it (the remapped DDL was tested there first) is left as is.

do $images$
declare ddl text := $ddl$
create table public.campaign_creature_images (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  srd_id text not null check (srd_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(srd_id) <= 80),
  image_path text not null,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, srd_id)
);
alter table public.campaign_creature_images enable row level security;
revoke all on public.campaign_creature_images from public, anon, authenticated;
grant select on public.campaign_creature_images to authenticated;
create policy campaign_creature_images_read on public.campaign_creature_images for select to authenticated
  using (private.is_campaign_dm(campaign_id));
comment on table public.campaign_creature_images is
  'RYT-053 DM image for an SRD creature in one campaign (private creature-images object). RPC writes only.';

create function public.list_creature_srd_images(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.combat_require_dm(target_campaign);
  return (select coalesce(jsonb_agg(jsonb_build_object('srd_id', i.srd_id, 'image_path', i.image_path,
      'updated_at', i.updated_at) order by i.srd_id), '[]'::jsonb)
    from public.campaign_creature_images i where i.campaign_id = target_campaign);
end;
$fn$;
revoke all on function public.list_creature_srd_images(uuid) from public, anon;
grant execute on function public.list_creature_srd_images(uuid) to authenticated;

create function public.set_creature_srd_image(target_campaign uuid, target_srd text, new_path text,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('srd_image', target_campaign, target_srd, new_path);
  replay jsonb; found_object boolean; environment text;
begin
  -- search_path is empty: the owning table tells which environment this copy of the function serves.
  environment := case when 'public.campaign_creature_images'::regclass::text like 'pre.%' then 'pre'
    else 'public' end;
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  if target_srd is null or target_srd !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(target_srd) > 80 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if new_path is null then
    delete from public.campaign_creature_images
      where campaign_id = target_campaign and srd_id = target_srd;
  else
    if new_path !~ ('^' || environment || '/' || target_campaign || '/srd-' || target_srd
        || '/[0-9a-f-]{36}[.](webp|png|jpg)$') then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    if to_regclass('storage.objects') is null then
      raise exception 'Image unavailable' using errcode = '22023'; end if;
    execute 'select exists (select 1 from storage.objects where bucket_id = ''creature-images'' and name = $1)'
      into found_object using new_path;
    if not found_object then raise exception 'Image unavailable' using errcode = '22023'; end if;
    insert into public.campaign_creature_images (campaign_id, srd_id, image_path)
      values (target_campaign, target_srd, new_path)
      on conflict (campaign_id, srd_id) do update set image_path = excluded.image_path, updated_at = now();
  end if;
  return private.combat_finish(request_id, payload,
    jsonb_build_object('srd_id', target_srd, 'image_path', new_path));
end;
$fn$;
revoke all on function public.set_creature_srd_image(uuid, text, text, uuid) from public, anon;
grant execute on function public.set_creature_srd_image(uuid, text, text, uuid) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre_admin.remap(text)') is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'combatant_templates' and column_name = 'stat_block')
      and to_regclass('pre.campaign_creature_images') is null then
    execute pre_admin.remap(ddl);
  end if;
end;
$images$;

-- ---------------------------------------------------------------------------------------------
-- GLOBAL STORAGE: the creature-images router (RYT-043) learns the SRD creature prefix.
-- ---------------------------------------------------------------------------------------------

create or replace function private.creature_image_access(object_name text, writing boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare env text := split_part(object_name, '/', 1); helper text; campaign uuid; template uuid; allowed boolean;
begin
  if object_name is null then return false; end if;
  helper := case env when 'pre' then 'pre_private' else 'private' end;
  -- SRD creature images (RYT-053): the campaign DM only, once the environment has the table.
  if object_name ~ '^(public|pre)/[0-9a-f-]{36}/srd-[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f-]{36}[.](webp|png|jpg)$'
      and char_length(split_part(object_name, '/', 3)) <= 84 then
    begin
      campaign := split_part(object_name, '/', 2)::uuid;
    exception when invalid_text_representation then return false; end;
    if to_regclass(format('%I.campaign_creature_images', env)) is null
        or to_regprocedure(format('%I.is_campaign_dm(uuid)', helper)) is null then
      return false; end if;
    execute format('select %I.is_campaign_dm($1)', helper) into allowed using campaign;
    return coalesce(allowed, false);
  end if;
  if object_name !~ '^(public|pre)/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](webp|png|jpg)$' then
    return false; end if;
  begin
    campaign := split_part(object_name, '/', 2)::uuid;
    template := split_part(object_name, '/', 3)::uuid;
  exception when invalid_text_representation then return false; end;
  if to_regprocedure(format('%I.can_view_creature_image(uuid,uuid,text)', helper)) is null then
    return false; end if;
  if writing then
    execute format('select %I.is_campaign_dm($1) and exists (select 1 from %I.combatant_templates '
      'where campaign_id = $1 and id = $2)', helper, env) into allowed using campaign, template;
  else
    -- DMs may read unattached uploads for preview and cleanup; Players never may.
    execute format('select %I.is_campaign_dm($1) or %I.can_view_creature_image($1, $2, $3)', helper, helper)
      into allowed using campaign, template, object_name;
  end if;
  return coalesce(allowed, false);
end;
$$;
revoke all on function private.creature_image_access(text, boolean) from public, anon;
grant execute on function private.creature_image_access(text, boolean) to authenticated;
