-- RYT-094: creatures come from the campaign's content packs (ADR 051, owner choices of block F).
--
-- What.
--   - private.content_pack_ref: a fixed 8-hex code per pack (the start of its id, unique by
--     index). A creature from a pack other than the SRD is referenced as '<ref>--<key>' wherever
--     the app stores an official creature
--     (srd_id of campaign creatures, fight combatants and their images, board tokens). SRD
--     creatures keep their bare key, so every stored reference stays valid. Keys never contain
--     '--', so both forms cannot be confused. The column keeps its historical name srd_id.
--   - The srd_id checks of combatant_templates, encounter_combatants and campaign_creature_images,
--     the board token check (tabletop_data_ok), the image RPC (set_creature_srd_image) and the
--     storage path rule (creature_image_access) accept both forms. A reference stays within 80
--     characters, so the content library now limits creature keys to 70.
--   - get_campaign_creature_packs: the creature packs the campaign has (enabled or turned off,
--     only packs still offered), at their pinned version, with the hidden keys.
--   - get_campaign_creature_pack: one pack's creatures at the campaign's pinned version: 'index'
--     (rows for lists and fights) or 'en' / 'es' (stat blocks and the trait library, each falling
--     back to the other language). The browser caches it by pack and version.
--   - get_campaign_content_changes flags campaign versions of creatures from any pack.
--   - add_combatants, save_combatant_template and set_creature_srd_image also require a
--     '<ref>--<key>' reference to name a pack the campaign has for creatures, other than the SRD
--     (private.creature_reference_ok). Board tokens check the form only (they show art).
--   - A pack read stays under 8 MB (Too large).
--
-- Actor matrix.
--   anon: no execution.
--   outsider, Player, inactive member, DM of another campaign: Forbidden.
--   active DM of the campaign (also through admin access, RYT-153): reads the creature packs the
--     campaign uses. A version other than the pinned one is refused (Stale revision); a pack that
--     is not offered any more, or that the campaign never used, is refused (Invalid request).
-- Reads only; no table gains a client grant.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists. The
-- storage rule is global (one function for both environments) and is patched once.
do $migration$
declare ddl text := $ddl$
/** A pack's fixed reference: the first 8 hex digits of its id (unique, see the index below). */
create or replace function private.content_pack_ref(pack uuid) returns text
language sql immutable set search_path = '' as $fn$
  select left(replace(pack::text, '-', ''), 8);
$fn$;
-- Inline expression, not the helper: PRE copies tables with their indexes and refuses external
-- dependencies. Both must stay the same expression.
create unique index if not exists content_packs_ref on public.content_packs (left(replace(id::text, '-', ''), 8));

/** A stored creature reference names a pack this campaign has for creatures (the SRD only as its
 * bare key), so the same creature is never stored two ways and no reference points elsewhere. */
create or replace function private.creature_reference_ok(target_campaign uuid, reference text) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if reference is null or strpos(reference, '--') = 0 then return true; end if;
  return exists (select 1 from public.campaign_content c
    where c.campaign_id = target_campaign and c.category = 'creatures'
      and private.content_pack_ref(c.pack_id) = split_part(reference, '--', 1)
      and c.pack_id is distinct from private.content_srd_pack());
end;
$fn$;

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
  end;
$fn$;

/** The creature packs a campaign has, offered ones only, with their pinned version and hidden keys. */
create or replace function public.get_campaign_creature_packs(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.campaign_content_require_dm(target_campaign);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'ref', private.content_pack_ref(p.id), 'slug', p.slug, 'title_en', p.title_en, 'title_es', p.title_es,
      'srd', coalesce(p.id = private.content_srd_pack(), false),
      'version', c.version, 'enabled', c.enabled,
      'hidden', coalesce((select jsonb_agg(h.key order by h.key) from public.campaign_content_hidden h
        where h.campaign_id = c.campaign_id and h.pack_id = c.pack_id and h.category = 'creatures'
          and h.kind = 'creature'), '[]'::jsonb))
      order by (p.slug = 'srd-5-2-1') desc, p.title_en, p.id)
    from public.campaign_content c join public.content_packs p on p.id = c.pack_id
   where c.campaign_id = target_campaign and c.category = 'creatures' and private.content_offered(p.id)),
    '[]'::jsonb);
end;
$fn$;

/** One pack's creatures at the campaign's pinned version: 'index' rows or the 'en' / 'es' bodies. */
create or replace function public.get_campaign_creature_pack(target_campaign uuid, target_pack uuid,
  at_version integer, part text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare pinned integer; other text; result jsonb;
begin
  perform private.campaign_content_require_dm(target_campaign);
  if part is null or part not in ('index', 'en', 'es') or at_version is null
      or not private.content_offered(target_pack) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select c.version into pinned from public.campaign_content c
   where c.campaign_id = target_campaign and c.pack_id = target_pack and c.category = 'creatures';
  if pinned is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  if pinned <> at_version then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if part = 'index' then
    result := jsonb_build_object('version', pinned, 'rows', coalesce((select jsonb_agg(
        (case when jsonb_typeof(a.data -> 'index') = 'object' then a.data -> 'index' else '{}'::jsonb end)
          || jsonb_build_object('id', a.key, 'name_en', a.name_en, 'name_es', a.name_es) order by a.key)
      from private.content_at(target_pack, 'creatures', pinned) a where a.kind = 'creature'), '[]'::jsonb));
  else
  other := case part when 'en' then 'es' else 'en' end;
  result := jsonb_build_object('version', pinned,
    'monsters', coalesce((select jsonb_object_agg(a.key, coalesce(a.data -> part, a.data -> other))
      from private.content_at(target_pack, 'creatures', pinned) a
     where a.kind = 'creature' and coalesce(a.data -> part, a.data -> other) is not null), '{}'::jsonb),
    'traits', coalesce((select jsonb_agg(jsonb_build_object('key', a.key,
        'from', a.data -> 'index' -> 'from', 'count', a.data -> 'index' -> 'count',
        'name', coalesce(a.data -> part, a.data -> other) -> 'name',
        'text', coalesce(a.data -> part, a.data -> other) -> 'text') order by a.key)
      from private.content_at(target_pack, 'creatures', pinned) a
     where a.kind = 'creature-trait' and coalesce(a.data -> part, a.data -> other) is not null), '[]'::jsonb));
  end if;
  -- One answer stays bounded (the SRD is about 0.6 MB per language).
  if octet_length(result::text) > 8388608 then
    raise exception 'Too large' using errcode = '22023'; end if;
  return result;
end;
$fn$;

/** What a pack's current version changes for a campaign, against the version it uses. */
create or replace function public.get_campaign_content_changes(target_campaign uuid, target_pack uuid,
  target_category text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare c public.campaign_content; current_version integer; srd uuid := private.content_srd_pack();
  pack_ref text;
begin
  perform private.campaign_content_require_dm(target_campaign);
  if not private.content_offered(target_pack) then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into c from public.campaign_content x
   where x.campaign_id = target_campaign and x.pack_id = target_pack and x.category = target_category
     and x.enabled;
  if not found then raise exception 'Invalid request' using errcode = '22023'; end if;
  select p.version into current_version from public.content_packs p where p.id = target_pack;
  pack_ref := private.content_pack_ref(target_pack);
  return jsonb_build_object('pinned_version', c.version, 'version', current_version,
    'changes', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', coalesce(a.kind, b.kind), 'key', coalesce(a.key, b.key),
        'name_en', coalesce(a.name_en, b.name_en), 'name_es', coalesce(a.name_es, b.name_es),
        'change', case when b.key is null then 'new' when a.key is null then 'withdrawn' else 'changed' end,
        'hidden', exists (select 1 from public.campaign_content_hidden h where h.campaign_id = target_campaign
          and h.pack_id = target_pack and h.kind = coalesce(a.kind, b.kind) and h.key = coalesce(a.key, b.key)),
        -- RYT-094: a campaign version references the creature as its bare key (SRD) or '<ref>--<key>'.
        'campaign_version', coalesce(a.kind, b.kind) = 'creature'
          and exists (select 1 from public.combatant_templates t where t.campaign_id = target_campaign
            and t.srd_override and t.srd_id = case when target_pack = srd then coalesce(a.key, b.key)
              else pack_ref || '--' || coalesce(a.key, b.key) end))
        order by coalesce(a.name_en, b.name_en), coalesce(a.key, b.key))
      from (select * from private.content_at(target_pack, target_category, current_version) y
             where private.content_listed(y.kind)) a
      full join (select * from private.content_at(target_pack, target_category, c.version) z
             where private.content_listed(z.kind)) b on a.kind = b.kind and a.key = b.key
     where a.key is null or b.key is null or a.version <> b.version), '[]'::jsonb));
end;
$fn$;

revoke all on function private.content_pack_ref(uuid), private.creature_reference_ok(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_campaign_creature_packs(uuid),
  public.get_campaign_creature_pack(uuid, uuid, integer, text) from public, anon;
grant execute on function public.get_campaign_creature_packs(uuid),
  public.get_campaign_creature_pack(uuid, uuid, integer, text) to authenticated;
$ddl$;
begin
  if to_regclass('pre.campaign_content') is not null
      and to_regprocedure('pre_private.content_at(uuid,text,integer)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;

-- Stored official creature references accept '<ref>--<key>' (both environments).
do $references$
declare env text; target text; constraint_name text; fn regprocedure; def text; anchor text;
  old_pattern constant text := '''^[a-z0-9]+(-[a-z0-9]+)*$''';
  new_pattern constant text := '''^([0-9a-f]{8}--)?[a-z0-9]+(-[a-z0-9]+)*$''';
begin
  foreach env in array array['public', 'pre'] loop
    if to_regclass(env || '.campaign_content') is null then continue; end if;
    foreach target in array array['combatant_templates', 'encounter_combatants', 'campaign_creature_images'] loop
      for constraint_name in
        select c.conname from pg_constraint c
         where c.conrelid = (env || '.' || target)::regclass and c.contype = 'c'
           and pg_get_constraintdef(c.oid) like '%srd_id ~%' and pg_get_constraintdef(c.oid) not like '%{8}--%'
      loop
        execute format('alter table %I.%I drop constraint %I', env, target, constraint_name);
      end loop;
      if not exists (select 1 from pg_constraint c where c.conrelid = (env || '.' || target)::regclass
          and c.conname = target || '_srd_reference') then
        execute format('alter table %I.%I add constraint %I check (srd_id is null or (srd_id ~ %s and char_length(srd_id) <= 80))',
          env, target, target || '_srd_reference', new_pattern);
      end if;
    end loop;
    -- Fights, campaign creatures, board tokens and images: patch the latest definitions in place.
    foreach target in array array[
        (case env when 'pre' then 'pre_private' else 'private' end) || '.tabletop_data_ok(text,jsonb,jsonb)',
        env || '.set_creature_srd_image(uuid,text,text,uuid)',
        env || '.add_combatants(uuid,uuid,jsonb,uuid)',
        env || '.save_combatant_template(uuid,uuid,bigint,jsonb,uuid)'] loop
      fn := to_regprocedure(target);
      if fn is null then raise exception 'pack creatures: % not found', target; end if;
      anchor := case
        when target like '%tabletop_data_ok%' then 'data->>''srd_id'' ~ ' || old_pattern
        when target like '%set_creature_srd_image%' then 'target_srd !~ ' || old_pattern
        else 'srd_value !~ ' || old_pattern end;
      def := pg_get_functiondef(fn);
      if strpos(def, replace(anchor, old_pattern, new_pattern)) > 0 then continue; end if;
      if strpos(def, anchor) = 0 then raise exception 'pack creatures: % not found in %', anchor, fn; end if;
      if target like '%tabletop_data_ok%' then
        execute replace(def, anchor, replace(anchor, old_pattern, new_pattern));
      else
        -- e.g. "srd_value !~ <pattern>" becomes "(srd_value !~ <pattern> or not <helper>(campaign, srd_value))".
        execute replace(def, anchor, format('(%s or not %s.creature_reference_ok(target_campaign, %s))',
          replace(anchor, old_pattern, new_pattern),
          case env when 'pre' then 'pre_private' else 'private' end, split_part(anchor, ' ', 1)));
      end if;
    end loop;
  end loop;
  -- Storage rule for creature images (global).
  def := pg_get_functiondef('private.creature_image_access(text,boolean)'::regprocedure);
  anchor := '/srd-[a-z0-9]+(-[a-z0-9]+)*/';
  if strpos(def, '/srd-([0-9a-f]{8}--)?[a-z0-9]+(-[a-z0-9]+)*/') = 0 then
    if strpos(def, anchor) = 0 then raise exception 'pack creatures: storage rule changed'; end if;
    execute replace(def, anchor, '/srd-([0-9a-f]{8}--)?[a-z0-9]+(-[a-z0-9]+)*/');
  end if;
end;
$references$;
