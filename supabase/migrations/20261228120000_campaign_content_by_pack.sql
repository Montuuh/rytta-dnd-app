-- RYT-184: the Content section works by pack (ADR 051, addendum "Content by pack").
--
-- What. No table, grant on a table or storage policy changes; only functions.
--   - private.content_pack_cover(pack): the pack's cover picture. It is the storage path named by
--     `data.index.image` of the latest published version, at or below the pack's current version,
--     of the reserved entry of kind `pack` and key `cover`. When that version names no picture (a
--     removed cover saves `index: {}`), is withdrawn or does not exist, the picture of the first
--     creature, item or class entry (in that kind order, then by key) that has one at the current
--     version. Kind `pack` has no content category, so it is never offered to a campaign, never
--     counted and never diffed; a version that changes only the cover advances every campaign
--     pinned at the previous version (content_pack_published already skips categories the new
--     version does not touch), so it leaves no pending update.
--   - get_campaign_content: each pack gains `cover` (null when the pack is not offered to the
--     campaign) and each category `kinds` ({kind: n}, the listed entries per kind at the version
--     the category counts, hidden ones included, as `entries`). Entries, hidden and kinds come
--     from one pass per pack category.
--   - private.campaign_content_apply(campaign, pack, category, enabled): the per-category body of
--     set_campaign_content (the SRD creatures still go through the bestiary record).
--     set_campaign_content and the new set_campaign_content_pack call it.
--   - set_campaign_content_pack(campaign, pack, enabled): on enables every category the pack has
--     (refused when the pack is not offered); off turns off every enabled category, also for a
--     pack no longer offered. The SRD pack keeps refusing changes while it is not the published
--     public SRD (content_srd_mismatch), as set_campaign_content does.
--   - get_campaign_content_pack_changes(campaign, pack): the digest of a pack update over the
--     enabled categories pinned below the pack's version, with the same diff as
--     get_campaign_content_changes, and the entries an update affects (withdrawn, hidden or with a
--     campaign version; own versions first; 200 at most, the rest counted).
--   - update_campaign_content_pack(campaign, pack, expected_version): moves every enabled category
--     of the pack to its current version under the campaign lock (Stale revision otherwise), and
--     forgets hidden entries the new version withdrew, as update_campaign_content does.
--   - list_campaign_content_entries gains `only_hidden` (6 arguments; the 5-argument form is
--     dropped, and calls that pass 5 arguments still resolve to the new one); the answer adds
--     `hidden_total` (hidden entries of the pack category, ignoring the search) and each entry its
--     published `index` object ({} when absent).
--   - get_content_choices: each pack gains `cover`.
--   - get_campaign_used_creatures(campaign): the distinct creature references and template ids the
--     campaign's encounters use (drafts, running and ended fights), 2000 of each at most.
--
-- Actor matrix.
--   anon: no execution of any function here.
--   outsider, inactive member, Player, DM of another campaign: Forbidden on every campaign
--     function (campaign_content_require_dm), get_campaign_used_creatures included.
--   active DM of the campaign (also through admin access, RYT-153): reads and changes its content.
--     A pack that is not offered to the campaign (private and not offered, unpublished, unknown)
--     is refused (Invalid request) on switching on, the digest, the update and the entries;
--     switching off stays allowed so a DM can leave a pack that stopped being offered.
--   signed-in account: get_content_choices, as before.
-- Pack updates carry the version they expect and lock the campaign; switching is idempotent.
-- The cover is a path, not a signed URL: the pack-images read rule (pack_image_access) already
-- lets a campaign's members sign any picture a published version of a pack offered to them names.
--
-- PRE. The same DDL is applied to public first and then, when PRE exists, to pre / pre_private
-- with pre_admin.remap. Every function is plpgsql: a PRE refresh recreates functions in name order.
do $migration$
declare ddl text := $ddl$
/** The pack's cover picture at its current version, or the first creature, item or class picture. */
create or replace function private.content_pack_cover(target_pack uuid) returns text
language plpgsql stable security definer set search_path = '' as $fn$
declare current_version integer; path text;
begin
  select p.version into current_version from public.content_packs p where p.id = target_pack;
  if current_version is null or current_version < 1 then return null; end if;
  select case when jsonb_typeof(v.data -> 'index' -> 'image') = 'string' then v.data -> 'index' ->> 'image' end
    into path
    from public.content_entry_versions v
   where v.pack_id = target_pack and v.kind = 'pack' and v.key = 'cover' and v.version <= current_version
   order by v.version desc limit 1;
  if path is not null then return path; end if;
  -- Entries that name a picture at the current version (the image index finds the candidates).
  select v.data -> 'index' ->> 'image' into path
    from public.content_entry_versions v
   where v.pack_id = target_pack and (v.data -> 'index') ? 'image'
     and v.kind in ('creature', 'item', 'class') and v.version <= current_version
     and jsonb_typeof(v.data -> 'index' -> 'image') = 'string'
     and not exists (select 1 from public.content_entry_versions w
       where w.pack_id = v.pack_id and w.kind = v.kind and w.key = v.key
         and w.version > v.version and w.version <= current_version)
   order by array_position(array['creature', 'item', 'class'], v.kind), v.key
   limit 1;
  return path;
end;
$fn$;

/** The packs offered to a campaign, by category: counts per kind, enabled version, hidden, cover. */
create or replace function public.get_campaign_content(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.campaign_content_require_dm(target_campaign);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'title_en', p.title_en, 'title_es', p.title_es,
      -- A pack that stopped being offered (made private) shows only what the campaign uses, so it
      -- can be turned off (except the SRD pack, which stays as it is until it is public again);
      -- its newer versions, entries and cover stay out of reach.
      'offered', private.content_offered(p.id, target_campaign),
      -- The SRD pack mirrors the bestiary: turning its creatures off forgets the bestiary removals.
      'srd', coalesce(p.id = private.content_srd_pack(), false),
      'version', case when private.content_offered(p.id, target_campaign) then p.version end,
      'cover', case when private.content_offered(p.id, target_campaign) then private.content_pack_cover(p.id) end,
      'categories', (select coalesce(jsonb_agg(jsonb_build_object(
          'category', k.category,
          'enabled', coalesce(c.enabled, false),
          'pinned_version', c.version,
          'entries', n.entries,
          'hidden', n.hidden,
          'kinds', n.kinds)
          order by array_position(array['creatures', 'spells', 'classes', 'rules', 'items'], k.category)), '[]'::jsonb)
        from (select distinct private.content_category(v.kind) category
                from public.content_entry_versions v where v.pack_id = p.id) k
        left join public.campaign_content c
          on c.campaign_id = target_campaign and c.pack_id = p.id and c.category = k.category
        -- One pass over the category at the version it counts.
        cross join lateral (select coalesce(sum(g.n), 0)::integer entries, coalesce(sum(g.hidden), 0)::integer hidden,
              coalesce(jsonb_object_agg(g.kind, g.n), '{}'::jsonb) kinds
            from (select a.kind, count(*)::integer n, count(h.key)::integer hidden
                    from private.content_at(p.id, k.category, coalesce(c.version, p.version)) a
                    left join public.campaign_content_hidden h on h.campaign_id = target_campaign
                      and h.pack_id = p.id and h.kind = a.kind and h.key = a.key
                   where private.content_listed(a.kind)
                   group by a.kind) g) n
       where k.category is not null
         and (private.content_offered(p.id, target_campaign) or coalesce(c.enabled, false))))
      order by (p.slug = 'srd-5-2-1') desc, p.title_en, p.id)
    from public.content_packs p
   where private.content_offered(p.id, target_campaign)
      or exists (select 1 from public.campaign_content c
        where c.campaign_id = target_campaign and c.pack_id = p.id and c.enabled)),
    '[]'::jsonb);
end;
$fn$;

/** Enables a pack category (resuming its version and hidden entries), or turns it off. The caller
 * locked the campaign and refused a mismatched SRD. */
create or replace function private.campaign_content_apply(target_campaign uuid, target_pack uuid,
  target_category text, enabled boolean) returns void
language plpgsql security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack(); current_version integer; versions uuid[];
begin
  -- Defence in depth: every caller already checked the DM.
  perform private.campaign_content_require_dm(target_campaign);
  if enabled is null or target_category is null
      or target_category not in ('creatures', 'spells', 'classes', 'rules', 'items') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if enabled then
    if not private.content_offered(target_pack, target_campaign) or not exists (select 1 from public.content_entry_versions v
        where v.pack_id = target_pack and private.content_category(v.kind) = target_category) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    if target_pack = srd and target_category = 'creatures' then
      insert into public.campaign_srd_bestiary (campaign_id) values (target_campaign) on conflict do nothing;
    else
      select p.version into current_version from public.content_packs p where p.id = target_pack;
      insert into public.campaign_content (campaign_id, pack_id, category, version, updated_by)
        values (target_campaign, target_pack, target_category, current_version, (select auth.uid()))
        on conflict (campaign_id, pack_id, category) do update set enabled = true, updated_at = now(),
          updated_by = excluded.updated_by;
    end if;
  elsif target_pack = srd and target_category = 'creatures' then
    -- As the bestiary's remove all: the record and its removals go, with this campaign's versions
    -- of SRD creatures; running fights that use them read their creatures again.
    select coalesce(array_agg(t.id), '{}') into versions from public.combatant_templates t
     where t.campaign_id = target_campaign and t.srd_override;
    if cardinality(versions) > 0 then
      update public.encounters e set revision = e.revision + 1, updated_at = now()
       where e.campaign_id = target_campaign and e.status in ('initiative', 'active')
         and exists (select 1 from public.encounter_combatants x
           where x.encounter_id = e.id and x.template_id = any (versions));
      delete from public.combatant_templates t where t.campaign_id = target_campaign and t.id = any (versions);
    end if;
    delete from public.campaign_srd_bestiary b where b.campaign_id = target_campaign;
  else
    update public.campaign_content c set enabled = false, updated_at = now(), updated_by = (select auth.uid())
     where c.campaign_id = target_campaign and c.pack_id = target_pack and c.category = target_category;
  end if;
end;
$fn$;

/** Enables a pack for a category (resuming its version and hidden entries), or turns it off. */
create or replace function public.set_campaign_content(target_campaign uuid, target_pack uuid,
  target_category text, enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  perform private.campaign_content_require_dm(target_campaign);
  if enabled is null or target_category is null
      or target_category not in ('creatures', 'spells', 'classes', 'rules', 'items')
      or private.content_srd_mismatch(target_pack) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  perform 1 from public.campaigns c where c.id = target_campaign for update;
  perform private.campaign_content_apply(target_campaign, target_pack, target_category, enabled);
  return public.get_campaign_content(target_campaign);
end;
$fn$;

/** Enables every category a pack has, or turns off every category of it the campaign enabled. */
create or replace function public.set_campaign_content_pack(target_campaign uuid, target_pack uuid,
  enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare target_category text; applied integer := 0;
begin
  perform private.campaign_content_require_dm(target_campaign);
  if enabled is null or target_pack is null or private.content_srd_mismatch(target_pack) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  perform 1 from public.campaigns c where c.id = target_campaign for update;
  if enabled then
    if not private.content_offered(target_pack, target_campaign) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    for target_category in select k.category from (select distinct private.content_category(v.kind) category
          from public.content_entry_versions v where v.pack_id = target_pack) k
        where k.category is not null
        order by array_position(array['creatures', 'spells', 'classes', 'rules', 'items'], k.category) loop
      perform private.campaign_content_apply(target_campaign, target_pack, target_category, true);
      applied := applied + 1;
    end loop;
    if applied = 0 then raise exception 'Invalid request' using errcode = '22023'; end if;
  else
    for target_category in select c.category from public.campaign_content c
        where c.campaign_id = target_campaign and c.pack_id = target_pack and c.enabled
        order by array_position(array['creatures', 'spells', 'classes', 'rules', 'items'], c.category) loop
      perform private.campaign_content_apply(target_campaign, target_pack, target_category, false);
    end loop;
  end if;
  return public.get_campaign_content(target_campaign);
end;
$fn$;

/** What updating a whole pack changes for a campaign: totals, per category, and affected entries. */
create or replace function public.get_campaign_content_pack_changes(target_campaign uuid, target_pack uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare current_version integer; srd uuid := private.content_srd_pack(); pack_ref text;
begin
  perform private.campaign_content_require_dm(target_campaign);
  if target_pack is null or not private.content_offered(target_pack, target_campaign) or not exists (
      select 1 from public.campaign_content x
       where x.campaign_id = target_campaign and x.pack_id = target_pack and x.enabled) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select p.version into current_version from public.content_packs p where p.id = target_pack;
  pack_ref := private.content_pack_ref(target_pack);
  return (with pins as materialized (
      select c.category, c.version from public.campaign_content c
       where c.campaign_id = target_campaign and c.pack_id = target_pack and c.enabled
         and c.version < current_version),
    diff as materialized (
      select d.*,
          exists (select 1 from public.campaign_content_hidden h where h.campaign_id = target_campaign
            and h.pack_id = target_pack and h.kind = d.kind and h.key = d.key) hidden,
          -- RYT-094: a campaign version references the creature as its bare key (SRD) or '<ref>--<key>'.
          d.kind = 'creature' and exists (select 1 from public.combatant_templates t
            where t.campaign_id = target_campaign and t.srd_override
              and t.srd_id = case when target_pack = srd then d.key else pack_ref || '--' || d.key end) campaign_version
        from (select pn.category, x.kind, x.key, x.name_en, x.name_es, x.change
              from pins pn
              cross join lateral (select coalesce(a.kind, b.kind) kind, coalesce(a.key, b.key) key,
                    coalesce(a.name_en, b.name_en) name_en, coalesce(a.name_es, b.name_es) name_es,
                    case when b.key is null then 'new' when a.key is null then 'withdrawn' else 'changed' end change
                  from (select * from private.content_at(target_pack, pn.category, current_version) y
                         where private.content_listed(y.kind)) a
                  full join (select * from private.content_at(target_pack, pn.category, pn.version) z
                         where private.content_listed(z.kind)) b on a.kind = b.kind and a.key = b.key
                 where a.key is null or b.key is null or a.version <> b.version) x) d),
    affected as (
      select x.*, row_number() over (order by x.campaign_version desc,
          array_position(array['creatures', 'spells', 'classes', 'rules', 'items'], x.category),
          x.name_en, x.kind, x.key) as rank_no
        from diff x where x.change = 'withdrawn' or x.hidden or x.campaign_version)
    select jsonb_build_object('version', current_version,
      'new', (select count(*) from diff where change = 'new'),
      'changed', (select count(*) from diff where change = 'changed'),
      'withdrawn', (select count(*) from diff where change = 'withdrawn'),
      'campaign_versions', (select count(*) from diff where campaign_version),
      'hidden', (select count(*) from diff where hidden),
      'categories', coalesce((select jsonb_agg(jsonb_build_object('category', pn.category,
          'pinned_version', pn.version,
          'new', (select count(*) from diff x where x.category = pn.category and x.change = 'new'),
          'changed', (select count(*) from diff x where x.category = pn.category and x.change = 'changed'),
          'withdrawn', (select count(*) from diff x where x.category = pn.category and x.change = 'withdrawn'))
        order by array_position(array['creatures', 'spells', 'classes', 'rules', 'items'], pn.category))
        from pins pn), '[]'::jsonb),
      'affected', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'key', x.key,
          'name_en', x.name_en, 'name_es', x.name_es, 'category', x.category, 'change', x.change,
          'hidden', x.hidden, 'campaign_version', x.campaign_version) order by x.rank_no)
        from affected x where x.rank_no <= 200), '[]'::jsonb),
      'affected_more', greatest((select count(*) from affected) - 200, 0)));
end;
$fn$;

/** Moves every enabled category of a pack to its current version after its DM reviewed the digest. */
create or replace function public.update_campaign_content_pack(target_campaign uuid, target_pack uuid,
  expected_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare current_version integer; target_category text;
begin
  perform private.campaign_content_require_dm(target_campaign);
  if target_pack is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  perform 1 from public.campaigns x where x.id = target_campaign for update;
  -- Checked under the campaign lock, as set_campaign_content_pack does.
  if not private.content_offered(target_pack, target_campaign) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  perform 1 from public.campaign_content x
   where x.campaign_id = target_campaign and x.pack_id = target_pack and x.enabled
   for update;
  if not found then raise exception 'Invalid request' using errcode = '22023'; end if;
  select p.version into current_version from public.content_packs p where p.id = target_pack;
  if expected_version is distinct from current_version then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  for target_category in select x.category from public.campaign_content x
      where x.campaign_id = target_campaign and x.pack_id = target_pack and x.enabled
        and x.version < current_version loop
    update public.campaign_content x set version = current_version, updated_at = now(),
        updated_by = (select auth.uid())
     where x.campaign_id = target_campaign and x.pack_id = target_pack and x.category = target_category;
    -- Entries withdrawn by the new version can no longer be hidden (the bestiary keeps its removals).
    delete from public.campaign_content_hidden h
     where h.campaign_id = target_campaign and h.pack_id = target_pack and h.category = target_category
       and not exists (select 1 from private.content_at(target_pack, target_category, current_version) a
         where a.kind = h.kind and a.key = h.key);
  end loop;
  return public.get_campaign_content(target_campaign);
end;
$fn$;

drop function if exists public.list_campaign_content_entries(uuid, uuid, text, text, integer);
/** The entries of a category at the campaign's version, with hidden ones marked; 100 per page. */
create or replace function public.list_campaign_content_entries(target_campaign uuid, target_pack uuid,
  target_category text, search text default null, page integer default 0, only_hidden boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare c public.campaign_content; q text := nullif(trim(coalesce(search, '')), '');
  safe_page integer := least(greatest(coalesce(page, 0), 0), 1000);
  hidden_only boolean := coalesce(only_hidden, false);
begin
  perform private.campaign_content_require_dm(target_campaign);
  if q is not null and char_length(q) > 80 then raise exception 'Invalid search' using errcode = '22023'; end if;
  if not private.content_offered(target_pack, target_campaign) then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into c from public.campaign_content x
   where x.campaign_id = target_campaign and x.pack_id = target_pack and x.category = target_category
     and x.enabled;
  if not found then raise exception 'Invalid request' using errcode = '22023'; end if;
  return (with base as materialized (
      select a.kind, a.key, a.name_en, a.name_es,
          case when jsonb_typeof(a.data -> 'index') = 'object' then a.data -> 'index' else '{}'::jsonb end as "index",
          exists (select 1 from public.campaign_content_hidden h where h.campaign_id = target_campaign
            and h.pack_id = target_pack and h.kind = a.kind and h.key = a.key) as hidden
        from private.content_at(target_pack, target_category, c.version) a
       where private.content_listed(a.kind)),
    listed as (
      select * from base b
       where (not hidden_only or b.hidden)
         and (q is null or b.name_en ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           or b.name_es ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'))
    select jsonb_build_object('total', (select count(*) from listed),
      'hidden_total', (select count(*) from base where base.hidden),
      'entries', coalesce((select jsonb_agg(to_jsonb(r) order by coalesce(nullif(r.name_es, ''), r.name_en), r.key)
        from (select * from listed order by coalesce(nullif(name_es, ''), name_en), key
               offset safe_page * 100 limit 100) r), '[]'::jsonb)));
end;
$fn$;

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
        -- Every pack listed here is offered to the caller (published and open to all, or their own).
        'cover', private.content_pack_cover(p.id),
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

/** The creature references and campaign creature templates the campaign's encounters use. */
create or replace function public.get_campaign_used_creatures(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.campaign_content_require_dm(target_campaign);
  return jsonb_build_object(
    'references', to_jsonb(array(select r.srd_id from (select distinct x.srd_id
        from public.encounter_combatants x
        where x.campaign_id = target_campaign and x.srd_id is not null) r order by r.srd_id limit 2000)),
    'templates', to_jsonb(array(select r.template_id from (select distinct x.template_id
        from public.encounter_combatants x
        where x.campaign_id = target_campaign and x.template_id is not null) r order by r.template_id limit 2000)));
end;
$fn$;

revoke all on function private.content_pack_cover(uuid), private.campaign_content_apply(uuid, uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.get_campaign_content(uuid), public.set_campaign_content(uuid, uuid, text, boolean),
  public.set_campaign_content_pack(uuid, uuid, boolean), public.get_campaign_content_pack_changes(uuid, uuid),
  public.update_campaign_content_pack(uuid, uuid, integer),
  public.list_campaign_content_entries(uuid, uuid, text, text, integer, boolean),
  public.get_content_choices(), public.get_campaign_used_creatures(uuid) from public;
revoke all on function public.get_campaign_content(uuid), public.set_campaign_content(uuid, uuid, text, boolean),
  public.set_campaign_content_pack(uuid, uuid, boolean), public.get_campaign_content_pack_changes(uuid, uuid),
  public.update_campaign_content_pack(uuid, uuid, integer),
  public.list_campaign_content_entries(uuid, uuid, text, text, integer, boolean),
  public.get_content_choices(), public.get_campaign_used_creatures(uuid) from anon;
grant execute on function public.get_campaign_content(uuid), public.set_campaign_content(uuid, uuid, text, boolean),
  public.set_campaign_content_pack(uuid, uuid, boolean), public.get_campaign_content_pack_changes(uuid, uuid),
  public.update_campaign_content_pack(uuid, uuid, integer),
  public.list_campaign_content_entries(uuid, uuid, text, text, integer, boolean),
  public.get_content_choices(), public.get_campaign_used_creatures(uuid) to authenticated;
$ddl$;
begin
  if to_regprocedure('private.content_offered(uuid,uuid)') is null
      or to_regprocedure('private.content_srd_mismatch(uuid)') is null
      or to_regprocedure('private.content_pack_ref(uuid)') is null
      or to_regprocedure('private.content_default_item_pack(uuid)') is null then
    raise exception 'RYT-184 needs campaign content and private packs (RYT-162, RYT-094, RYT-163)';
  end if;
  execute ddl;
  if to_regclass('pre.campaign_content') is not null
      and to_regclass('pre.content_pack_offers') is not null
      and to_regclass('pre.encounter_combatants') is not null
      and to_regprocedure('pre_private.content_offered(uuid,uuid)') is not null
      and to_regprocedure('pre_private.content_pack_ref(uuid)') is not null
      and to_regprocedure('pre_private.content_default_item_pack(uuid)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$migration$;
