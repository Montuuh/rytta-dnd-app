-- RYT-164, RYT-165: spells, class features and rules come from the campaign's content packs
-- (ADR 051, owner choices of block I).
--
-- What.
--   - get_campaign_rule_packs: for the spells, classes and rules categories, the packs the campaign
--     has (enabled or turned off, only packs still offered) at their pinned version, with the ids
--     of their hidden entries. Every active member reads it: Players use spells, class features and
--     rules on their sheets and in the glossary.
--   - get_campaign_rule_pack: one pack's entries of one category at the campaign's pinned version,
--     shaped as the glossary reads them: 'index' rows or the 'en' / 'es' bodies (each falling back
--     to the other language). Hidden entries are included, marked by the first RPC, so characters
--     that already have them keep their texts (owner choice P2 A); the app no longer offers them.
--   - get_srd_rule_pack: the same for the published public SRD at its current version, for the
--     glossary outside a campaign (signed-in accounts; the demo keeps the bundled sample).
--   - Glossary ids: '<kind>.<key>' for the SRD (as the bundled glossary and stored characters use
--     them) and '<kind>.<ref>--<key>' for other packs, so no two packs share an id.
--   - The 'table' kind (the creature CR baselines) is not glossary content and is left out.
--   - A read stays under 8 MB (Too large).
--
-- Actor matrix.
--   anon: no execution.
--   outsider, inactive member, member of another campaign: Forbidden.
--   active member of the campaign (Player or DM, also admin access): reads that campaign's packs.
--   any signed-in account: reads the published public SRD (public content).
-- Reads only; no table gains a client grant.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists.
do $migration$
declare ddl text := $ddl$
create or replace function private.campaign_rule_require_member(target_campaign uuid) returns void
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if target_campaign is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
end;
$fn$;

/** A pack's entries of one category, at a version, shaped as the glossary reads them. */
create or replace function private.rule_pack_part(target_pack uuid, target_category text, at_version integer,
  part text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare srd boolean := target_pack = private.content_srd_pack(); pack_ref text := private.content_pack_ref(target_pack);
  other text := case part when 'en' then 'es' else 'en' end; result jsonb;
begin
  if part is null or part not in ('index', 'en', 'es') or target_category is null
      or target_category not in ('spells', 'classes', 'rules') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  -- Refuse an oversized part before building it (entries can hold up to 128 KB each).
  if (select coalesce(sum(octet_length(case when part = 'index' then (a.data -> 'index')::text
        else coalesce(a.data -> part, a.data -> other)::text end)), 0)
      from private.content_at(target_pack, target_category, at_version) a where a.kind <> 'table') > 8388608 then
    raise exception 'Too large' using errcode = '22023'; end if;
  with entries as (
    select a.kind, a.name_en, a.name_es, a.data,
        a.kind || '.' || case when srd then a.key else pack_ref || '--' || a.key end as id
      from private.content_at(target_pack, target_category, at_version) a
     where a.kind <> 'table')
  select case when part = 'index' then jsonb_build_object('version', at_version, 'rows',
      coalesce((select jsonb_agg(
          (case when jsonb_typeof(e.data -> 'index') = 'object' then e.data -> 'index' else '{}'::jsonb end)
            || jsonb_build_object('id', e.id, 'cat', e.kind,
              'en', coalesce(nullif(e.data -> 'index' ->> 'en', ''), nullif(e.name_en, ''), e.name_es),
              'es', coalesce(nullif(e.data -> 'index' ->> 'es', ''), nullif(e.name_es, ''), e.name_en))
          order by e.id) from entries e), '[]'::jsonb))
    else jsonb_build_object('version', at_version, 'bodies',
      coalesce((select jsonb_object_agg(e.id, coalesce(e.data -> part, e.data -> other)) from entries e
        where coalesce(e.data -> part, e.data -> other) is not null), '{}'::jsonb)) end
    into result;
  if octet_length(result::text) > 8388608 then
    raise exception 'Too large' using errcode = '22023'; end if;
  return result;
end;
$fn$;

/** The spells, classes and rules packs a campaign has, with their pinned version and hidden ids. */
create or replace function public.get_campaign_rule_packs(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack();
begin
  perform private.campaign_rule_require_member(target_campaign);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'ref', private.content_pack_ref(p.id), 'title_en', p.title_en, 'title_es', p.title_es,
      'srd', coalesce(p.id = srd, false), 'category', c.category, 'version', c.version, 'enabled', c.enabled,
      'hidden', coalesce((select jsonb_agg(h.kind || '.' || case when p.id = srd then h.key
            else private.content_pack_ref(p.id) || '--' || h.key end order by h.kind, h.key)
          from public.campaign_content_hidden h
         where h.campaign_id = c.campaign_id and h.pack_id = c.pack_id and h.category = c.category), '[]'::jsonb))
      order by (p.id = srd) desc, p.title_en, p.id,
        array_position(array['spells', 'classes', 'rules'], c.category))
    from public.campaign_content c join public.content_packs p on p.id = c.pack_id
   where c.campaign_id = target_campaign and c.category in ('spells', 'classes', 'rules')
     and private.content_offered(p.id)), '[]'::jsonb);
end;
$fn$;

/** One pack's spells, class features or rules at the campaign's pinned version. */
create or replace function public.get_campaign_rule_pack(target_campaign uuid, target_pack uuid,
  target_category text, at_version integer, part text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare pinned integer;
begin
  perform private.campaign_rule_require_member(target_campaign);
  if at_version is null or not private.content_offered(target_pack) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select c.version into pinned from public.campaign_content c
   where c.campaign_id = target_campaign and c.pack_id = target_pack and c.category = target_category;
  if pinned is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  if pinned <> at_version then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  return private.rule_pack_part(target_pack, target_category, pinned, part);
end;
$fn$;

/** The published public SRD's spells, class features or rules, for the glossary outside a campaign. */
create or replace function public.get_srd_rule_pack(target_category text, part text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack(); current_version integer;
begin
  if (select auth.uid()) is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if srd is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select p.version into current_version from public.content_packs p where p.id = srd;
  return private.rule_pack_part(srd, target_category, current_version, part)
    || jsonb_build_object('pack', srd);
end;
$fn$;

revoke all on function private.campaign_rule_require_member(uuid),
  private.rule_pack_part(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.get_campaign_rule_packs(uuid),
  public.get_campaign_rule_pack(uuid, uuid, text, integer, text),
  public.get_srd_rule_pack(text, text) from public, anon;
grant execute on function public.get_campaign_rule_packs(uuid),
  public.get_campaign_rule_pack(uuid, uuid, text, integer, text),
  public.get_srd_rule_pack(text, text) to authenticated;
$ddl$;
begin
  if to_regclass('pre.campaign_content') is not null
      and to_regprocedure('pre_private.content_pack_ref(uuid)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;
