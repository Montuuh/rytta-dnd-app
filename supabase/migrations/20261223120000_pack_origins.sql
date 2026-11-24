-- RYT-171: species, backgrounds and feats are pack entries (ADR 051, owner choices of block M).
--
-- What.
--   - Entries of kind `species`, `background` and `feat` belong to the classes category (owner
--     choice P2 A: the category the app now names "Characters"), beside classes, subclasses and
--     features. Campaigns keep the versions they pin; the published SRD gains them as a new version.
--   - private.content_category is immutable and indexes content_entry_versions: the index is
--     rebuilt after the change. No published entry of these kinds existed before this migration.
--
-- Actor matrix. Unchanged: these kinds are read through get_campaign_rule_pack (campaign members)
-- and get_srd_rule_pack (signed-in accounts), and written through the library RPCs (content
-- editors), as every other entry of the category. No grant changes.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists, after
-- public: a PRE index copied by a refresh may still read private.content_category, so it is
-- rebuilt once the public definition is the new one.
do $migration$
declare ddl text := $ddl$
/** Where a pack kind is used. Kinds outside the five categories are not offered to campaigns. */
create or replace function private.content_category(entry_kind text) returns text
language sql immutable set search_path = '' as $fn$
  select case
    when entry_kind in ('creature', 'creature-trait') then 'creatures'
    when entry_kind = 'spell' then 'spells'
    when entry_kind in ('class', 'subclass', 'feature', 'species', 'background', 'feat') then 'classes'
    when entry_kind = 'item' then 'items'
    when entry_kind in ('rule', 'condition', 'action', 'ability', 'skill', 'damage', 'property',
      'mastery', 'hazard', 'area', 'attitude', 'table') then 'rules'
  end;
$fn$;
revoke all on function private.content_category(text) from public, anon, authenticated;
reindex index public.content_entry_versions_category;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.content_entry_versions_category') is not null
      and to_regprocedure('pre_private.content_category(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$migration$;
