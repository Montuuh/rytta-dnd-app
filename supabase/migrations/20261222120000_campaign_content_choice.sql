-- RYT-167: the DM chooses a new campaign's content, and the SRD leaves the code (ADR 051, owner
-- choices of block L).
--
-- What.
--   - get_content_choices: the packs a new campaign can use, per category with their entry counts:
--     every published public pack, and the caller's own published private packs when they are a
--     content editor. `default` marks the categories a new campaign starts with (every category
--     of the SRD and the items of the Rytta basics, as campaign_content_defaults enables them).
--   - create_campaign_with_content: creates the campaign (create_campaign) and leaves enabled
--     exactly the chosen pack categories (owner choice P2 A), with the checks of set_campaign_content
--     but without rereading the campaign's content after each change. A chosen private pack of the
--     caller is offered to the new campaign first. Versions are pinned at the current published
--     version; a refused pick rolls the whole campaign back.
--   - get_srd_creature_pack: the published SRD's creatures, their traits and the CR baselines table,
--     for signed-in accounts (the library and creature editors), capped at 8 MB.
--
-- Actor matrix.
--   anon: nothing. A visitor without an account sees no glossary or bestiary (the app shows the
--     landing page), so the published SRD stays readable by signed-in accounts only.
--   signed-in account: lists the choices and creates a campaign with them; a pack that is not
--     offered (private and not theirs, unpublished, unknown) or a category the pack lacks is
--     refused (Invalid request) and nothing is created.
-- No table gains a client grant.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists.
do $migration$
declare ddl text := $ddl$
/** Packs a new campaign can use, with their categories at the current published version. */
create or replace function public.get_content_choices() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack(); editor boolean := private.is_content_editor();
begin
  if (select auth.uid()) is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x.pack order by x.srd desc, x.title, x.id) from (
    select p.id, p.title_en title, coalesce(p.id = srd, false) srd, jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'title_en', p.title_en, 'title_es', p.title_es,
        'srd', coalesce(p.id = srd, false), 'private', p.visibility = 'private',
        'version', p.version,
        'categories', (select coalesce(jsonb_agg(jsonb_build_object('category', k.category, 'entries', k.n,
            'default', coalesce(p.id = srd, false)
              or (k.category = 'items' and private.content_default_item_pack(p.id)))
            order by array_position(array['creatures', 'spells', 'classes', 'rules', 'items'], k.category)), '[]'::jsonb)
          from (select c.category, (select count(*) from private.content_at(p.id, c.category, p.version) a
                  where private.content_listed(a.kind)) n
                  from unnest(array['creatures', 'spells', 'classes', 'rules', 'items']) c(category)) k
         where k.n > 0)) pack
      from public.content_packs p
     where p.version > 0
       and (p.visibility = 'public' or (editor and p.owner_id = (select auth.uid())))) x
   where jsonb_array_length(x.pack -> 'categories') > 0), '[]'::jsonb);
end;
$fn$;

/** Creates a campaign with exactly the chosen pack categories enabled. */
create or replace function public.create_campaign_with_content(campaign_name text,
  campaign_description text, chosen jsonb) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare new_id uuid; srd uuid := private.content_srd_pack(); pick record; row_content record;
  current_version integer;
begin
  if chosen is null or jsonb_typeof(chosen) <> 'array' or jsonb_array_length(chosen) > 200
      or octet_length(chosen::text) > 16384
      or exists (select 1 from jsonb_array_elements(chosen) e
        where jsonb_typeof(e) <> 'object'
          or (select count(*) from jsonb_object_keys(e)) <> 2
          or lower(e ->> 'pack') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or coalesce(e ->> 'category', '') not in ('creatures', 'spells', 'classes', 'rules', 'items')) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  new_id := public.create_campaign(campaign_name, coalesce(campaign_description, ''));
  -- Defaults the DM did not choose are turned off (they keep their row, as Content does). The SRD
  -- creatures go through the bestiary record, as set_campaign_content does.
  for row_content in select c.pack_id, c.category from public.campaign_content c
      where c.campaign_id = new_id and c.enabled
        and not exists (select 1 from jsonb_array_elements(chosen) e
          where lower(e ->> 'pack')::uuid = c.pack_id and e ->> 'category' = c.category) loop
    if row_content.pack_id = srd and row_content.category = 'creatures' then
      delete from public.campaign_srd_bestiary b where b.campaign_id = new_id;
    else
      update public.campaign_content c set enabled = false, updated_at = now()
       where c.campaign_id = new_id and c.pack_id = row_content.pack_id
         and c.category = row_content.category;
    end if;
  end loop;
  for pick in select distinct lower(e ->> 'pack')::uuid pack, e ->> 'category' category
      from jsonb_array_elements(chosen) e loop
    -- The caller's own private pack is offered to the campaign they create.
    if private.is_content_editor() and exists (select 1 from public.content_packs p
        where p.id = pick.pack and p.visibility = 'private' and p.version > 0
          and p.owner_id = (select auth.uid())) then
      insert into public.content_pack_offers (pack_id, campaign_id, added_by)
        values (pick.pack, new_id, (select auth.uid())) on conflict do nothing;
    end if;
    if exists (select 1 from public.campaign_content c where c.campaign_id = new_id
        and c.pack_id = pick.pack and c.category = pick.category and c.enabled) then
      continue;
    end if;
    if not private.content_offered(pick.pack, new_id) or not exists (select 1
        from public.content_entry_versions v
        where v.pack_id = pick.pack and private.content_category(v.kind) = pick.category) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    if pick.pack = srd and pick.category = 'creatures' then
      insert into public.campaign_srd_bestiary (campaign_id) values (new_id) on conflict do nothing;
    else
      select p.version into current_version from public.content_packs p where p.id = pick.pack;
      insert into public.campaign_content (campaign_id, pack_id, category, version, updated_by)
        values (new_id, pick.pack, pick.category, current_version, (select auth.uid()))
        on conflict (campaign_id, pack_id, category) do update set enabled = true, updated_at = now();
    end if;
  end loop;
  return new_id;
end;
$fn$;

/** The published public SRD's creatures, their traits and the CR baselines (signed-in accounts). */
create or replace function public.get_srd_creature_pack(part text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack(); current_version integer; other text;
begin
  if (select auth.uid()) is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if srd is null or part is null or part not in ('index', 'en', 'es') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select p.version into current_version from public.content_packs p where p.id = srd;
  other := case part when 'en' then 'es' else 'en' end;
  -- Refuse an oversized answer before building it (any content editor can publish the SRD).
  if (select coalesce(sum(octet_length(case when part = 'index' then (a.data -> 'index')::text
        else coalesce(a.data -> part, a.data -> other)::text end)), 0)
      from private.content_at(srd, 'creatures', current_version) a) > 8388608 then
    raise exception 'Too large' using errcode = '22023'; end if;
  if part = 'index' then
    return jsonb_build_object('pack', srd, 'version', current_version,
      'rows', coalesce((select jsonb_agg(
          (case when jsonb_typeof(a.data -> 'index') = 'object' then a.data -> 'index' else '{}'::jsonb end)
            || jsonb_build_object('id', a.key, 'name_en', a.name_en, 'name_es', a.name_es) order by a.key)
        from private.content_at(srd, 'creatures', current_version) a where a.kind = 'creature'), '[]'::jsonb),
      'baselines', coalesce((select a.data -> 'rows' from private.content_at(srd, 'rules', current_version) a
        where a.kind = 'table' and a.key = 'creature-baselines'), '[]'::jsonb));
  end if;
  return jsonb_build_object('pack', srd, 'version', current_version,
    'monsters', coalesce((select jsonb_object_agg(a.key, coalesce(a.data -> part, a.data -> other))
      from private.content_at(srd, 'creatures', current_version) a
     where a.kind = 'creature' and coalesce(a.data -> part, a.data -> other) is not null), '{}'::jsonb),
    'traits', coalesce((select jsonb_agg(jsonb_build_object('key', a.key,
        'from', a.data -> 'index' -> 'from', 'count', a.data -> 'index' -> 'count',
        'name', coalesce(a.data -> part, a.data -> other) -> 'name',
        'text', coalesce(a.data -> part, a.data -> other) -> 'text') order by a.key)
      from private.content_at(srd, 'creatures', current_version) a
     where a.kind = 'creature-trait' and coalesce(a.data -> part, a.data -> other) is not null), '[]'::jsonb));
end;
$fn$;

revoke all on function public.get_content_choices(), public.create_campaign_with_content(text, text, jsonb),
  public.get_srd_creature_pack(text) from public;
revoke all on function public.get_content_choices(), public.create_campaign_with_content(text, text, jsonb),
  public.get_srd_creature_pack(text) from anon;
grant execute on function public.get_content_choices(), public.create_campaign_with_content(text, text, jsonb),
  public.get_srd_creature_pack(text) to authenticated;
$ddl$;
begin
  if to_regclass('pre.content_pack_offers') is not null
      and to_regprocedure('pre.create_campaign(text,text)') is not null
      and to_regprocedure('pre_private.content_default_item_pack(uuid)') is not null
      and to_regprocedure('pre_private.content_offered(uuid,uuid)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;
