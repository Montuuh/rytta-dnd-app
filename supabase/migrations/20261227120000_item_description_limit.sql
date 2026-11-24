-- RYT-176: an item description holds 10000 characters (it held 2000).
--
-- What. The magic items of the SRD 5.2.1 enter the base pack with their whole rules text, and
-- the longest (the Mysterious Deck, with its table and a stat block) has about 8500 characters
-- in Spanish. An item taken from the pack into a campaign keeps that text, so the three places
-- that limit an item description grow from 2000 to 10000 characters:
--   - the check on item_definitions.description, and the byte ceiling that sat behind it for
--     the old limit, item_definitions.translations (8192 bytes, now 81920: two languages of
--     100 + 10000 characters of at most four bytes), so a text the validators accept is never
--     refused by the table;
--   - private.item_draft (latest definition 20261120120000, otherwise unchanged), the validator
--     of save_item_definition, import_basic_items, propose_item and resolve_item_proposal;
--   - private.item_translations (latest definition 20261120120000, otherwise unchanged), the
--     validator of the optional second-language text of an item.
-- A Player's proposal does not grow: item_proposals.draft keeps its 16384 bytes, so a proposed
-- item still holds a few thousand characters and one Player cannot fill the DM's list with long
-- drafts (security review). The long texts are the pack's, which arrive through the DM's
-- import_basic_items and save_item_definition.
-- Nothing else changes: names stay at 100 characters, properties at 4096 bytes, an import at 500
-- items, and shop, encounter and note texts keep their own limits. No row is rewritten: every
-- stored description already fits. The swap fails instead of passing in silence if a check with
-- the old limit is still on the table afterwards.
--
-- Actor matrix: unchanged. Both functions are immutable validators without table access; they
-- are not security definer and are called only from RPCs that already authorize the caller
-- (anon cannot execute them; an outsider, a Player of another campaign and a DM of another
-- campaign get Forbidden before any validation; a Player writes only what RYT-105 allows).
-- No table, grant or policy changes.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists.
-- The constraint swaps take ACCESS EXCLUSIVE locks; give up quickly instead of queueing behind
-- (and in front of) live requests.
set local lock_timeout = '5s';

do $migration$
declare ddl text := $ddl$
alter table public.item_definitions drop constraint if exists item_definitions_description_check;
alter table public.item_definitions add constraint item_definitions_description_check
  check (char_length(description) <= 10000);
-- Two languages of 100 + 10000 characters of at most four bytes each.
alter table public.item_definitions drop constraint if exists item_definitions_translations_check;
alter table public.item_definitions add constraint item_definitions_translations_check
  check (translations is null
    or (jsonb_typeof(translations) = 'object' and pg_column_size(translations) <= 81920));

-- Optional translations: {"en"|"es": {"name": 1..100 trimmed, "description": <= 10000}}.
-- Null or {} is stored as null.
create or replace function private.item_translations(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $fn$
declare lang text; entry jsonb; result jsonb := '{}'::jsonb; label text; body text;
begin
  if value is null or jsonb_typeof(value) = 'null' then return null; end if;
  if jsonb_typeof(value) <> 'object' then
    raise exception 'Invalid request' using errcode = '22023', detail = 'translations'; end if;
  for lang, entry in select e.key, e.value from jsonb_each(value) e loop
    if lang not in ('en', 'es') or jsonb_typeof(entry) <> 'object'
        or exists (select 1 from jsonb_object_keys(entry) k where k not in ('name', 'description'))
        or jsonb_typeof(entry -> 'name') is distinct from 'string'
        or (entry ? 'description' and jsonb_typeof(entry -> 'description') not in ('string', 'null')) then
      raise exception 'Invalid request' using errcode = '22023', detail = 'translations'; end if;
    label := trim(entry ->> 'name');
    body := coalesce(entry ->> 'description', '');
    if char_length(label) not between 1 and 100 or char_length(body) > 10000 then
      raise exception 'Invalid request' using errcode = '22023', detail = 'translations'; end if;
    result := result || jsonb_build_object(lang, jsonb_build_object('name', label, 'description', body));
  end loop;
  return nullif(result, '{}'::jsonb);
end;
$fn$;

-- The definition fields of a draft, validated and normalized (no price, origin or flags).
create or replace function private.item_draft(item jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $fn$
declare label text; body text; category text; icon text; rarity text; slot text;
begin
  if item is null or jsonb_typeof(item) <> 'object' then
    raise exception 'Invalid request' using errcode = '22023', detail = 'item'; end if;
  if jsonb_typeof(item -> 'name') is distinct from 'string'
      or (item ? 'description' and jsonb_typeof(item -> 'description') not in ('string', 'null')) then
    raise exception 'Invalid request' using errcode = '22023', detail = 'name'; end if;
  label := trim(item ->> 'name');
  body := coalesce(item ->> 'description', '');
  category := item ->> 'category';
  icon := coalesce(item ->> 'icon', 'package');
  rarity := coalesce(item ->> 'rarity', 'common');
  slot := coalesce(item ->> 'slot_kind', 'none');
  if char_length(label) not between 1 and 100 or char_length(body) > 10000
      or category is null or category not in
        ('weapon', 'armor', 'shield', 'gear', 'consumable', 'ammo', 'tool', 'treasure', 'quest')
      or icon !~ '^[a-z0-9-]{1,40}$'
      or rarity not in ('common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact')
      or slot not in ('head', 'neck', 'cloak', 'body', 'hands', 'belt', 'feet', 'ring', 'one_hand',
        'two_hands', 'shield', 'none') then
    raise exception 'Invalid request' using errcode = '22023', detail = 'item'; end if;
  -- Without translations the key is absent, so draft -> 'translations' is SQL null.
  return jsonb_strip_nulls(jsonb_build_object('translations', private.item_translations(item -> 'translations')))
    || jsonb_build_object('name', label, 'description', body, 'category', category,
      'icon', icon, 'rarity', rarity, 'slot_kind', slot,
      'properties', private.item_properties(item -> 'properties'),
      'weight_lb', private.item_weight_lb(item));
end;
$fn$;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.item_definitions') is not null
      and to_regprocedure('pre_private.item_draft(jsonb)') is not null
      and to_regprocedure('pre_private.item_translations(jsonb)') is not null
      and to_regprocedure('pre_private.item_properties(jsonb)') is not null
      and to_regprocedure('pre_private.item_weight_lb(jsonb)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  -- A check under another name would survive the swap and keep the old limit.
  if exists (select 1 from pg_constraint k
      join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'pre') and c.relname = 'item_definitions' and k.contype = 'c'
       and (pg_get_constraintdef(k.oid) like '%char_length(description) <= 2000)%'
         or pg_get_constraintdef(k.oid) like '%pg_column_size(translations) <= 8192)%')) then
    raise exception 'item_definitions still has a check with the old description limit';
  end if;
end;
$migration$;
