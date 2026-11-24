-- RYT-174: the base pack becomes Rytta (ADR 051, owner choices of block Q).
--
-- What.
--   - content_packs.baseline_version: the version up to which a pack's entries are the source it
--     started from. It is set on the base pack (slug srd-5-2-1) at its current version, where every
--     entry is still the SRD as uploaded. Other packs have no baseline and no origin (P5 A).
--   - Origin of an entry (P2 A), worked out from the published versions the library already keeps:
--     `srd` when its names and data equal its baseline row, `changed` when they differ, `own` when
--     it has no baseline row. The picture (data.index.image) does not count as a change. Nothing is
--     written to the entries, so no campaign is asked to review anything.
--   - Library rows (content_draft_row, used by list_content_drafts, list_content_changes and
--     get_content_draft) carry `origin` and `protected`; get_content_draft adds the baseline of a
--     changed entry, so the editor can show the original.
--   - Readers (P3 A): get_campaign_content_origins(campaign) lists, for the campaign's members,
--     the entries of its enabled packs that are not plain baseline entries at the versions the
--     campaign pins, hidden entries left out. get_content_origins() does the same for signed-in
--     accounts at the current version of every published pack open to all (the glossary outside a
--     campaign). Both name the pack, so the app can show its title.
--   - Protected entries (P4 A): the entries the app's code relies on cannot be withdrawn from the
--     base pack once published: the 14 conditions the sheet tracks, the 12 SRD classes, the 9 SRD
--     species, the 4 SRD backgrounds and the creature baselines table. A trigger on content_entries
--     refuses to flag them deleted or to delete their row (Entry protected), whatever the caller;
--     their names and texts stay editable. A takedown is owner SQL with the trigger disabled.
--
-- Actor matrix.
--   anon: no function execution.
--   signed-in account: get_content_origins (published packs open to all only).
--   outsider, inactive member, DM or Player of another campaign: Forbidden on
--     get_campaign_content_origins.
--   active member of the campaign (also admin access): reads the origins of its enabled packs.
--   super admin: library rows with origin and protected, the baseline of a changed entry; refused
--     (Entry protected) when withdrawing a protected entry. Nobody else reads drafts (RYT-173).
-- No table gains a client grant. The new helpers are security definer with search_path '' and are
-- not executable by anon or authenticated.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists.
do $migration$
declare ddl text := $ddl$
alter table public.content_packs add column if not exists baseline_version integer
  check (baseline_version is null or baseline_version between 1 and 2000000000);
comment on column public.content_packs.baseline_version is
  'RYT-174 the version up to which the entries are the source the pack started from; null: no origin per entry.';

update public.content_packs set baseline_version = version
 where slug = 'srd-5-2-1' and version > 0 and baseline_version is null;

/** The baseline row of an entry: its latest published version at or before the pack's baseline. */
create or replace function private.content_baseline(target_pack uuid, entry_kind text, entry_key text)
returns jsonb language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('name_en', v.name_en, 'name_es', v.name_es, 'data', v.data)
    from public.content_entry_versions v join public.content_packs p on p.id = v.pack_id
   where v.pack_id = target_pack and v.kind = entry_kind and v.key = entry_key
     and v.version <= p.baseline_version
   order by v.version desc limit 1;
$fn$;

/** srd, changed or own; null when the pack has no baseline. The picture is not a change. */
create or replace function private.content_origin(target_pack uuid, entry_kind text, entry_key text,
  entry_name_en text, entry_name_es text, entry_data jsonb) returns text
language plpgsql stable security definer set search_path = '' as $fn$
declare b jsonb;
begin
  if not exists (select 1 from public.content_packs p
      where p.id = target_pack and p.baseline_version is not null) then return null; end if;
  b := private.content_baseline(target_pack, entry_kind, entry_key);
  if b is null or jsonb_typeof(b -> 'data') is distinct from 'object' then return 'own'; end if;
  if b ->> 'name_en' = entry_name_en and b ->> 'name_es' = entry_name_es
      and (b -> 'data') #- '{index,image}' = entry_data #- '{index,image}' then return 'srd'; end if;
  return 'changed';
end;
$fn$;

/** Entries the app's code relies on (keys of src/features/characters/domain/srd.ts and the CR
 * baselines the bestiary reads). Only the base pack has them. */
create or replace function private.content_entry_protected(target_pack uuid, entry_kind text, entry_key text)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.content_packs p where p.id = target_pack and p.slug = 'srd-5-2-1')
    and case entry_kind
      when 'condition' then entry_key in ('blinded', 'charmed', 'deafened', 'frightened', 'grappled',
        'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained',
        'stunned', 'unconscious')
      when 'class' then entry_key in ('barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
        'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard')
      when 'species' then entry_key in ('dragonborn', 'dwarf', 'elf', 'gnome', 'goliath', 'halfling',
        'human', 'orc', 'tiefling')
      when 'background' then entry_key in ('acolyte', 'criminal', 'sage', 'soldier')
      when 'table' then entry_key = 'creature-baselines'
      else false
    end;
$fn$;

/** A published protected entry is never flagged deleted and its row is never deleted. */
create or replace function private.content_entries_protect() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if tg_op = 'DELETE' then
    -- A pack being deleted is gone by now, so its entries go with it.
    if old.published_data is not null
        and private.content_entry_protected(old.pack_id, old.kind, old.key) then
      raise exception 'Entry protected' using errcode = 'P0001'; end if;
    return old;
  end if;
  if new.deleted and not old.deleted and new.published_data is not null
      and private.content_entry_protected(new.pack_id, new.kind, new.key) then
    raise exception 'Entry protected' using errcode = 'P0001'; end if;
  return new;
end;
$fn$;
drop trigger if exists content_entries_protect on public.content_entries;
create trigger content_entries_protect before delete or update of deleted on public.content_entries
  for each row execute function private.content_entries_protect();

-- Stable now (it reads the baseline); plpgsql so that a PRE refresh, which recreates functions in
-- name order, can create it before the helpers it calls.
create or replace function private.content_draft_row(e public.content_entries) returns jsonb
language plpgsql stable set search_path = '' as $fn$
begin
  return jsonb_build_object('id', e.id, 'kind', e.kind, 'key', e.key, 'name_en', e.name_en,
    'name_es', e.name_es, 'index', case when jsonb_typeof(e.data -> 'index') = 'object' then e.data -> 'index' end,
    'state', private.content_entry_state(e), 'revision', e.revision, 'updated_at', e.updated_at,
    'origin', private.content_origin(e.pack_id, e.kind, e.key, e.name_en, e.name_es, e.data),
    'protected', case when e.published_data is not null
      and private.content_entry_protected(e.pack_id, e.kind, e.key) then true end);
end;
$fn$;

create or replace function public.get_content_draft(target_entry uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare e public.content_entries; row_json jsonb;
begin
  perform private.content_require_editor();
  select * into e from public.content_entries where id = target_entry;
  if e.id is null then raise exception 'Entry unavailable' using errcode = '42501'; end if;
  row_json := private.content_draft_row(e);
  return jsonb_strip_nulls(row_json - 'index') || jsonb_build_object('pack_id', e.pack_id, 'data', e.data,
    'published', case when e.published_data is not null then jsonb_build_object('name_en', e.published_name_en,
      'name_es', e.published_name_es, 'data', e.published_data, 'version', e.published_version) end,
    -- The original of a changed entry, for the editor.
    'baseline', case when row_json ->> 'origin' = 'changed'
      then private.content_baseline(e.pack_id, e.kind, e.key) end);
end;
$fn$;

/** Entries of a pack category at a version that are not plain baseline entries. Everything up to
 * the baseline version is the baseline by definition. */
create or replace function private.content_origins_at(target_pack uuid, target_category text, at_version integer)
returns table (kind text, key text, origin text)
language plpgsql stable security definer set search_path = '' as $fn$
declare base integer;
begin
  select p.baseline_version into base from public.content_packs p where p.id = target_pack;
  if base is null or at_version is null or at_version <= base then return; end if;
  return query
  select a.kind, a.key, case when b.data is null then 'own' else 'changed' end
    from private.content_at(target_pack, target_category, at_version) a
    left join lateral (select v.name_en, v.name_es, v.data from public.content_entry_versions v
        where v.pack_id = target_pack and v.kind = a.kind and v.key = a.key and v.version <= base
        order by v.version desc limit 1) b on true
   where b.data is null or b.name_en is distinct from a.name_en or b.name_es is distinct from a.name_es
      or b.data #- '{index,image}' is distinct from a.data #- '{index,image}';
end;
$fn$;

/** For the campaign's members: its enabled packs that have a baseline, with the entries that are
 * changed or the pack's own at the versions the campaign pins. Hidden entries are left out. */
create or replace function public.get_campaign_content_origins(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if target_campaign is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title_en', p.title_en, 'title_es', p.title_es,
      'entries', coalesce((select jsonb_agg(jsonb_build_object('kind', o.kind, 'key', o.key, 'origin', o.origin)
          order by o.kind, o.key)
        from public.campaign_content c
        cross join lateral private.content_origins_at(p.id, c.category, c.version) o
       where c.campaign_id = target_campaign and c.pack_id = p.id and c.enabled
         and not exists (select 1 from public.campaign_content_hidden h
           where h.campaign_id = c.campaign_id and h.pack_id = c.pack_id and h.kind = o.kind and h.key = o.key)),
        '[]'::jsonb)) order by p.id)
    from public.content_packs p
   where p.baseline_version is not null and private.content_offered(p.id, target_campaign)
     and exists (select 1 from public.campaign_content c
       where c.campaign_id = target_campaign and c.pack_id = p.id and c.enabled)), '[]'::jsonb);
end;
$fn$;

/** For signed-in accounts: the same at the current version of every published pack open to all. */
create or replace function public.get_content_origins() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if (select auth.uid()) is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title_en', p.title_en, 'title_es', p.title_es,
      'entries', coalesce((select jsonb_agg(jsonb_build_object('kind', o.kind, 'key', o.key, 'origin', o.origin)
          order by o.kind, o.key)
        from unnest(array['creatures', 'spells', 'classes', 'rules', 'items']) c(category)
        cross join lateral private.content_origins_at(p.id, c.category, p.version) o), '[]'::jsonb)) order by p.id)
    from public.content_packs p
   where p.baseline_version is not null and p.version > 0 and p.visibility = 'public'), '[]'::jsonb);
end;
$fn$;

revoke all on function private.content_baseline(uuid, text, text),
  private.content_origin(uuid, text, text, text, text, jsonb),
  private.content_entry_protected(uuid, text, text), private.content_entries_protect(),
  private.content_draft_row(public.content_entries),
  private.content_origins_at(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.get_campaign_content_origins(uuid), public.get_content_origins(),
  public.get_content_draft(uuid) from public;
revoke all on function public.get_campaign_content_origins(uuid), public.get_content_origins(),
  public.get_content_draft(uuid) from anon;
grant execute on function public.get_campaign_content_origins(uuid), public.get_content_origins(),
  public.get_content_draft(uuid) to authenticated;
$ddl$;
begin
  if to_regprocedure('private.content_at(uuid,text,integer)') is null
      or to_regprocedure('private.content_offered(uuid,uuid)') is null
      or to_regprocedure('private.is_super_admin()') is null then
    raise exception 'RYT-174 needs campaign content (RYT-162, RYT-163) and the super admin role (RYT-153)';
  end if;
  execute ddl;
  if to_regclass('pre.content_entry_versions') is not null
      and to_regclass('pre.campaign_content_hidden') is not null
      and to_regprocedure('pre_private.content_at(uuid,text,integer)') is not null
      and to_regprocedure('pre_private.content_offered(uuid,uuid)') is not null
      and to_regprocedure('pre_private.content_entry_state(pre.content_entries)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$migration$;
