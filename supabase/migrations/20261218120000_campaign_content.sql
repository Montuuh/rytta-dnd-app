-- RYT-162: campaign content (ADR 051).
--
-- What. A campaign chooses which content packs it uses, per category, at a pinned version:
--   - public.content_entry_versions keeps every published version of every pack entry (a row per
--     entry and version; data null means the entry was withdrawn at that version). Publishing a
--     pack now writes these rows; the current published entries are back-filled at their version.
--   - public.campaign_content (campaign, pack, category, version): the pack is enabled for that
--     category at that version. Categories group the pack kinds by where they are used:
--     creatures (creature, creature-trait), spells (spell), classes (class, subclass, feature),
--     rules (rule, condition, action, ability, skill, damage, property, mastery, hazard, area,
--     attitude, table) and items (item).
--   - public.campaign_content_hidden (campaign, pack, kind, key): entries the DM hid.
-- Turning a pack off keeps its row (enabled false) with its version and hidden entries; turning it
-- on again resumes them (the SRD creatures keep their version but, as the bestiary remove all,
-- forget their hidden entries). Module readers must read enabled rows only.
-- A new pack version changes nothing in a campaign until its DM accepts the update
-- (update_campaign_content), after reviewing what is new, changed and withdrawn
-- (get_campaign_content_changes), including entries the campaign has its own version of.
--
-- Defaults (owner choice P5 A). A new campaign starts with the public SRD pack (slug srd-5-2-1)
-- enabled for every category it has. Existing campaigns keep what they use today: spells,
-- classes and rules from the SRD (the app always offered them), and creatures only where the DM
-- downloaded the official bestiary, with its removed creatures hidden.
--
-- The campaign bestiary (ADR 039) keeps its tables and RPCs until RYT-094 moves the bestiary to
-- packs. They stay the record for the SRD creatures: downloading, removing or removing all there
-- updates campaign_content and its hidden entries through triggers, and this migration's RPCs
-- write the SRD creatures through those same tables, so both views always agree.
--
-- Actor matrix.
--   anon: no table access, no function execution.
--   outsider, inactive member, Player, DM of another campaign: every RPC raises Forbidden.
--   active DM of the campaign (also through admin access, RYT-153): reads and changes the
--     campaign's content. Only public, published packs are offered (private packs: RYT-163).
-- No table has a client grant; every read and write goes through security definer functions with
-- search_path ''. Content changes are idempotent by nature (enable, disable, hide, show) and an
-- update carries the version it expects.
--
-- Visibility. A pack that stops being offered (made private) is still listed for a campaign that
-- uses it, so its DM can turn it off, but its newer versions, changes and entries are refused
-- (private packs for chosen campaigns come with RYT-163). Module readers (RYT-094, RYT-164 to
-- RYT-166) must apply the same rule. content_entry_versions keeps every published version;
-- withdrawing content for legal reasons means deleting its rows there as well.
--
-- Bestiary differences until RYT-094: hiding an SRD creature here keeps the campaign version of
-- it (the bestiary remove deletes it); turning the SRD creatures off behaves as the bestiary
-- remove all. Accepting an update keeps the bestiary removals of withdrawn creatures, since the
-- bestiary still lists its bundled creatures.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists.
do $migration$
declare ddl text := $ddl$
/** Where a pack kind is used. Kinds outside the five categories are not offered to campaigns. */
create or replace function private.content_category(entry_kind text) returns text
language sql immutable set search_path = '' as $fn$
  select case
    when entry_kind in ('creature', 'creature-trait') then 'creatures'
    when entry_kind = 'spell' then 'spells'
    when entry_kind in ('class', 'subclass', 'feature') then 'classes'
    when entry_kind = 'item' then 'items'
    when entry_kind in ('rule', 'condition', 'action', 'ability', 'skill', 'damage', 'property',
      'mastery', 'hazard', 'area', 'attitude', 'table') then 'rules'
  end;
$fn$;

create table if not exists public.content_entry_versions (
  pack_id uuid not null references public.content_packs(id) on delete cascade,
  kind text not null,
  key text not null,
  version integer not null check (version between 1 and 2000000000),
  name_en text,
  name_es text,
  data jsonb,
  primary key (pack_id, kind, key, version)
);
alter table public.content_entry_versions enable row level security;
create index if not exists content_entry_versions_category
  on public.content_entry_versions (pack_id, private.content_category(kind), kind, key, version desc);
revoke all on public.content_entry_versions from public, anon, authenticated;
comment on table public.content_entry_versions is
  'RYT-162 every published version of each pack entry (data null: withdrawn). RPC access only.';

insert into public.content_entry_versions (pack_id, kind, key, version, name_en, name_es, data)
  select e.pack_id, e.kind, e.key, e.published_version, e.published_name_en, e.published_name_es,
      e.published_data
    from public.content_entries e
   where e.published_data is not null and e.published_version is not null
  on conflict do nothing;

create table if not exists public.campaign_content (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  pack_id uuid not null references public.content_packs(id) on delete cascade,
  category text not null check (category in ('creatures', 'spells', 'classes', 'rules', 'items')),
  version integer not null check (version between 1 and 2000000000),
  -- Turning a pack off keeps its row: its version and hidden entries come back with it, so turning
  -- it on again never skips the review of a newer version.
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (campaign_id, pack_id, category)
);
alter table public.campaign_content add column if not exists enabled boolean not null default true;
create index if not exists campaign_content_pack on public.campaign_content (pack_id);
create index if not exists campaign_content_updated_by on public.campaign_content (updated_by);
alter table public.campaign_content enable row level security;
revoke all on public.campaign_content from public, anon, authenticated;
comment on table public.campaign_content is
  'RYT-162 packs a campaign uses per category, at a pinned version. RPC access only.';

create table if not exists public.campaign_content_hidden (
  campaign_id uuid not null,
  pack_id uuid not null,
  category text not null,
  kind text not null,
  key text not null,
  primary key (campaign_id, pack_id, kind, key),
  foreign key (campaign_id, pack_id, category)
    references public.campaign_content (campaign_id, pack_id, category) on delete cascade
);
create index if not exists campaign_content_hidden_content
  on public.campaign_content_hidden (campaign_id, pack_id, category);
alter table public.campaign_content_hidden enable row level security;
revoke all on public.campaign_content_hidden from public, anon, authenticated;

/** The entries of a pack at a version: the latest published row at or before it, not withdrawn.
 * plpgsql, not sql: a PRE refresh recreates functions in name order, before content_category. */
create or replace function private.content_at(target_pack uuid, target_category text, at_version integer)
returns table (kind text, key text, name_en text, name_es text, data jsonb, version integer)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return query
  select x.kind, x.key, x.name_en, x.name_es, x.data, x.version
    from (select distinct on (v.kind, v.key) v.kind, v.key, v.name_en, v.name_es, v.data, v.version
            from public.content_entry_versions v
           where v.pack_id = target_pack and v.version <= at_version
             and private.content_category(v.kind) = target_category
           order by v.kind, v.key, v.version desc) x
   where x.data is not null;
end;
$fn$;

/** Entries the DM chooses among: every kind of the category except creature traits. */
create or replace function private.content_listed(entry_kind text) returns boolean
language sql immutable set search_path = '' as $fn$
  select entry_kind <> 'creature-trait';
$fn$;

/** The public SRD pack, when it has been published. */
create or replace function private.content_srd_pack() returns uuid
language sql stable security definer set search_path = '' as $fn$
  select p.id from public.content_packs p
   where p.slug = 'srd-5-2-1' and p.visibility = 'public' and p.version > 0;
$fn$;

/** A pack a campaign may use: public and published (private packs: RYT-163). */
create or replace function private.content_offered(target_pack uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.content_packs p
    where p.id = target_pack and p.visibility = 'public' and p.version > 0);
$fn$;

/** The SRD pack exists but is not the published public SRD: its creatures cannot be kept in step
 * with the bestiary, so changes to it are refused until it is published and public again. */
create or replace function private.content_srd_mismatch(target_pack uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
begin
  -- plpgsql: a PRE refresh recreates functions in name order, before content_srd_pack.
  return exists (select 1 from public.content_packs p where p.id = target_pack and p.slug = 'srd-5-2-1')
    and private.content_srd_pack() is distinct from target_pack;
end;
$fn$;

create or replace function private.campaign_content_require_dm(target_campaign uuid) returns void
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if target_campaign is null or not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
end;
$fn$;

-- The bestiary record of the SRD creatures drives campaign_content (both directions agree).
create or replace function private.campaign_content_from_bestiary() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack();
begin
  if srd is null then return null; end if;
  if tg_op = 'INSERT' then
    insert into public.campaign_content (campaign_id, pack_id, category, version, updated_by)
      select new.campaign_id, srd, 'creatures', p.version, (select auth.uid())
        from public.content_packs p where p.id = srd
      on conflict (campaign_id, pack_id, category) do update set enabled = true, updated_at = now(),
        updated_by = excluded.updated_by;
  else
    -- No author: this also runs inside a cascade (an account or campaign being deleted).
    update public.campaign_content c set enabled = false, updated_at = now(), updated_by = null
     where c.campaign_id = old.campaign_id and c.pack_id = srd and c.category = 'creatures';
  end if;
  return null;
end;
$fn$;
drop trigger if exists campaign_srd_bestiary_content on public.campaign_srd_bestiary;
create trigger campaign_srd_bestiary_content after insert or delete on public.campaign_srd_bestiary
  for each row execute function private.campaign_content_from_bestiary();

create or replace function private.campaign_content_from_removed() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack();
begin
  if srd is null then return null; end if;
  if tg_op = 'INSERT' then
    insert into public.campaign_content_hidden (campaign_id, pack_id, category, kind, key)
      select new.campaign_id, srd, 'creatures', 'creature', new.srd_id
       where exists (select 1 from public.campaign_content c
         where c.campaign_id = new.campaign_id and c.pack_id = srd and c.category = 'creatures' and c.enabled)
      on conflict do nothing;
  else
    delete from public.campaign_content_hidden h
     where h.campaign_id = old.campaign_id and h.pack_id = srd and h.kind = 'creature' and h.key = old.srd_id;
  end if;
  return null;
end;
$fn$;
drop trigger if exists campaign_srd_removed_content on public.campaign_srd_removed;
create trigger campaign_srd_removed_content after insert or delete on public.campaign_srd_removed
  for each row execute function private.campaign_content_from_removed();

-- A new campaign starts with the SRD in every category the pack has.
create or replace function private.campaign_content_defaults() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack(); current_version integer;
begin
  if srd is null then return null; end if;
  select p.version into current_version from public.content_packs p where p.id = srd;
  insert into public.campaign_content (campaign_id, pack_id, category, version, updated_by)
    select new.id, srd, c.category, current_version, new.owner_id
      from (select distinct private.content_category(v.kind) category
              from public.content_entry_versions v where v.pack_id = srd) c
     where c.category is not null and c.category <> 'creatures'
    on conflict do nothing;
  -- Creatures go through the bestiary record, which enables them here too.
  if exists (select 1 from public.content_entry_versions v
      where v.pack_id = srd and private.content_category(v.kind) = 'creatures') then
    insert into public.campaign_srd_bestiary (campaign_id) values (new.id) on conflict do nothing;
  end if;
  return null;
end;
$fn$;
drop trigger if exists campaigns_content_defaults on public.campaigns;
create trigger campaigns_content_defaults after insert on public.campaigns
  for each row execute function private.campaign_content_defaults();

/** The packs offered to a campaign, by category: count, enabled version, hidden entries, update. */
create or replace function public.get_campaign_content(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.campaign_content_require_dm(target_campaign);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'title_en', p.title_en, 'title_es', p.title_es,
      -- A pack that stopped being offered (made private) shows only what the campaign uses, so it
      -- can be turned off (except the SRD pack, which stays as it is until it is public again);
      -- its newer versions and entries stay out of reach.
      'offered', private.content_offered(p.id),
      -- The SRD pack mirrors the bestiary: turning its creatures off forgets the bestiary removals.
      'srd', coalesce(p.id = private.content_srd_pack(), false),
      'version', case when private.content_offered(p.id) then p.version end,
      'categories', (select coalesce(jsonb_agg(jsonb_build_object(
          'category', k.category,
          'enabled', coalesce(c.enabled, false),
          'pinned_version', c.version,
          'entries', (select count(*) from private.content_at(p.id, k.category, coalesce(c.version, p.version)) x
            where private.content_listed(x.kind)),
          'hidden', (select count(*) from public.campaign_content_hidden h
            join private.content_at(p.id, k.category, coalesce(c.version, p.version)) a
              on a.kind = h.kind and a.key = h.key
            where h.campaign_id = target_campaign and h.pack_id = p.id and h.category = k.category))
          order by array_position(array['creatures', 'spells', 'classes', 'rules', 'items'], k.category)), '[]'::jsonb)
        from (select distinct private.content_category(v.kind) category
                from public.content_entry_versions v where v.pack_id = p.id) k
        left join public.campaign_content c
          on c.campaign_id = target_campaign and c.pack_id = p.id and c.category = k.category
       where k.category is not null
         and (private.content_offered(p.id) or coalesce(c.enabled, false))))
      order by (p.slug = 'srd-5-2-1') desc, p.title_en, p.id)
    from public.content_packs p
   where private.content_offered(p.id)
      or exists (select 1 from public.campaign_content c
        where c.campaign_id = target_campaign and c.pack_id = p.id and c.enabled)),
    '[]'::jsonb);
end;
$fn$;

/** Enables a pack for a category (resuming its version and hidden entries), or turns it off. */
create or replace function public.set_campaign_content(target_campaign uuid, target_pack uuid,
  target_category text, enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare srd uuid := private.content_srd_pack(); current_version integer; versions uuid[];
begin
  perform private.campaign_content_require_dm(target_campaign);
  if enabled is null or target_category is null
      or target_category not in ('creatures', 'spells', 'classes', 'rules', 'items')
      or private.content_srd_mismatch(target_pack) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  perform 1 from public.campaigns c where c.id = target_campaign for update;
  if enabled then
    if not private.content_offered(target_pack) or not exists (select 1 from public.content_entry_versions v
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
  return public.get_campaign_content(target_campaign);
end;
$fn$;

/** What a pack's current version changes for a campaign, against the version it uses. */
create or replace function public.get_campaign_content_changes(target_campaign uuid, target_pack uuid,
  target_category text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare c public.campaign_content; current_version integer; srd uuid := private.content_srd_pack();
begin
  perform private.campaign_content_require_dm(target_campaign);
  if not private.content_offered(target_pack) then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into c from public.campaign_content x
   where x.campaign_id = target_campaign and x.pack_id = target_pack and x.category = target_category
     and x.enabled;
  if not found then raise exception 'Invalid request' using errcode = '22023'; end if;
  select p.version into current_version from public.content_packs p where p.id = target_pack;
  return jsonb_build_object('pinned_version', c.version, 'version', current_version,
    'changes', coalesce((select jsonb_agg(jsonb_build_object(
        'kind', coalesce(a.kind, b.kind), 'key', coalesce(a.key, b.key),
        'name_en', coalesce(a.name_en, b.name_en), 'name_es', coalesce(a.name_es, b.name_es),
        'change', case when b.key is null then 'new' when a.key is null then 'withdrawn' else 'changed' end,
        'hidden', exists (select 1 from public.campaign_content_hidden h where h.campaign_id = target_campaign
          and h.pack_id = target_pack and h.kind = coalesce(a.kind, b.kind) and h.key = coalesce(a.key, b.key)),
        'campaign_version', target_pack = srd and coalesce(a.kind, b.kind) = 'creature'
          and exists (select 1 from public.combatant_templates t where t.campaign_id = target_campaign
            and t.srd_override and t.srd_id = coalesce(a.key, b.key)))
        order by coalesce(a.name_en, b.name_en), coalesce(a.key, b.key))
      from (select * from private.content_at(target_pack, target_category, current_version) y
             where private.content_listed(y.kind)) a
      full join (select * from private.content_at(target_pack, target_category, c.version) z
             where private.content_listed(z.kind)) b on a.kind = b.kind and a.key = b.key
     where a.key is null or b.key is null or a.version <> b.version), '[]'::jsonb));
end;
$fn$;

/** Moves a campaign to the pack's current version after its DM reviewed the changes. */
create or replace function public.update_campaign_content(target_campaign uuid, target_pack uuid,
  target_category text, expected_version integer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare c public.campaign_content; current_version integer;
begin
  perform private.campaign_content_require_dm(target_campaign);
  if not private.content_offered(target_pack) then raise exception 'Invalid request' using errcode = '22023'; end if;
  perform 1 from public.campaigns x where x.id = target_campaign for update;
  select * into c from public.campaign_content x
   where x.campaign_id = target_campaign and x.pack_id = target_pack and x.category = target_category
     and x.enabled
   for update;
  if not found then raise exception 'Invalid request' using errcode = '22023'; end if;
  select p.version into current_version from public.content_packs p where p.id = target_pack;
  if expected_version is distinct from current_version then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  update public.campaign_content x set version = current_version, updated_at = now(),
      updated_by = (select auth.uid())
   where x.campaign_id = target_campaign and x.pack_id = target_pack and x.category = target_category;
  -- Entries withdrawn by the new version can no longer be hidden. (The bestiary keeps its removals:
  -- until RYT-094 it still lists its bundled creatures, withdrawn ones included.)
  delete from public.campaign_content_hidden h
   where h.campaign_id = target_campaign and h.pack_id = target_pack and h.category = target_category
     and not exists (select 1 from private.content_at(target_pack, target_category, current_version) a
       where a.kind = h.kind and a.key = h.key);
  return public.get_campaign_content(target_campaign);
end;
$fn$;

/** The entries of a category at the campaign's version, with hidden ones marked; 100 per page. */
create or replace function public.list_campaign_content_entries(target_campaign uuid, target_pack uuid,
  target_category text, search text default null, page integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare c public.campaign_content; q text := nullif(trim(coalesce(search, '')), '');
  safe_page integer := least(greatest(coalesce(page, 0), 0), 1000);
begin
  perform private.campaign_content_require_dm(target_campaign);
  if q is not null and char_length(q) > 80 then raise exception 'Invalid search' using errcode = '22023'; end if;
  if not private.content_offered(target_pack) then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into c from public.campaign_content x
   where x.campaign_id = target_campaign and x.pack_id = target_pack and x.category = target_category
     and x.enabled;
  if not found then raise exception 'Invalid request' using errcode = '22023'; end if;
  return (with listed as (
      select a.kind, a.key, a.name_en, a.name_es,
          exists (select 1 from public.campaign_content_hidden h where h.campaign_id = target_campaign
            and h.pack_id = target_pack and h.kind = a.kind and h.key = a.key) hidden
        from private.content_at(target_pack, target_category, c.version) a
       where private.content_listed(a.kind)
         and (q is null or a.name_en ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           or a.name_es ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'))
    select jsonb_build_object('total', (select count(*) from listed),
      'entries', coalesce((select jsonb_agg(to_jsonb(r) order by coalesce(nullif(r.name_es, ''), r.name_en), r.key)
        from (select * from listed order by coalesce(nullif(name_es, ''), name_en), key
               offset safe_page * 100 limit 100) r), '[]'::jsonb)));
end;
$fn$;

/** Hides or shows one entry of a pack the campaign uses. */
create or replace function public.set_campaign_content_hidden(target_campaign uuid, target_pack uuid,
  target_kind text, target_key text, hidden boolean) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare c public.campaign_content; category_value text := private.content_category(target_kind);
  srd uuid := private.content_srd_pack();
begin
  perform private.campaign_content_require_dm(target_campaign);
  if hidden is null or category_value is null or target_key is null or not private.content_listed(target_kind)
      or not private.content_offered(target_pack) or private.content_srd_mismatch(target_pack) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  perform 1 from public.campaigns x where x.id = target_campaign for update;
  select * into c from public.campaign_content x
   where x.campaign_id = target_campaign and x.pack_id = target_pack and x.category = category_value
     and x.enabled;
  if not found or not exists (select 1 from private.content_at(target_pack, category_value, c.version) a
      where a.kind = target_kind and a.key = target_key) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if target_pack = srd and target_kind = 'creature' then
    -- Through the bestiary record (its 1000-creature cap included); campaign versions stay.
    if hidden then
      if (select count(*) from public.campaign_srd_removed r where r.campaign_id = target_campaign) >= 1000 then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      insert into public.campaign_srd_removed (campaign_id, srd_id) values (target_campaign, target_key)
        on conflict do nothing;
    else
      delete from public.campaign_srd_removed r where r.campaign_id = target_campaign and r.srd_id = target_key;
    end if;
  elsif hidden then
    insert into public.campaign_content_hidden (campaign_id, pack_id, category, kind, key)
      values (target_campaign, target_pack, category_value, target_kind, target_key) on conflict do nothing;
  else
    delete from public.campaign_content_hidden h where h.campaign_id = target_campaign
      and h.pack_id = target_pack and h.kind = target_kind and h.key = target_key;
  end if;
  return jsonb_build_object('kind', target_kind, 'key', target_key, 'hidden', hidden);
end;
$fn$;

-- Publishing a pack also records the version of each entry it changes or withdraws.
create or replace function public.publish_content_pack(target_pack uuid, expected_version integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare request_key jsonb := jsonb_build_array('pack_publish', target_pack, expected_version);
  replay jsonb; p public.content_packs; added integer; changed integer; removed integer;
begin
  replay := private.content_begin(request_id, request_key);
  if replay is not null then return replay; end if;
  perform private.content_require_editor();
  p := private.content_pack_locked(target_pack);
  if p.version is distinct from expected_version then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  select count(*) filter (where private.content_entry_state(e) = 'new'),
      count(*) filter (where private.content_entry_state(e) = 'changed'),
      count(*) filter (where private.content_entry_state(e) = 'deleted')
    into added, changed, removed
    from public.content_entries e where e.pack_id = p.id;
  if added + changed + removed = 0 then raise exception 'Nothing to publish' using errcode = 'P0001'; end if;
  insert into public.content_entry_versions (pack_id, kind, key, version)
    select e.pack_id, e.kind, e.key, p.version + 1 from public.content_entries e
     where e.pack_id = p.id and private.content_entry_state(e) = 'deleted'
    on conflict do nothing;
  delete from public.content_entries where pack_id = p.id and deleted;
  update public.content_entries e set published_name_en = e.name_en, published_name_es = e.name_es,
      published_data = e.data, published_version = p.version + 1
    where e.pack_id = p.id and private.content_entry_state(e) in ('new', 'changed');
  insert into public.content_entry_versions (pack_id, kind, key, version, name_en, name_es, data)
    select e.pack_id, e.kind, e.key, p.version + 1, e.published_name_en, e.published_name_es, e.published_data
      from public.content_entries e where e.pack_id = p.id and e.published_version = p.version + 1
    on conflict do nothing;
  update public.content_packs set version = version + 1, published_at = now(), revision = revision + 1,
      updated_at = now()
    where id = p.id returning * into p;
  return private.content_finish(request_id, request_key, jsonb_build_object('id', p.id, 'version', p.version,
    'revision', p.revision, 'added', added, 'changed', changed, 'removed', removed));
end;
$fn$;

-- Existing campaigns keep what they use today.
insert into public.campaign_content (campaign_id, pack_id, category, version)
  select c.id, p.id, k.category, p.version
    from public.campaigns c
    cross join public.content_packs p
    cross join (values ('spells'), ('classes'), ('rules')) k(category)
   where p.id = private.content_srd_pack()
     and exists (select 1 from public.content_entry_versions v
       where v.pack_id = p.id and private.content_category(v.kind) = k.category)
  on conflict do nothing;
insert into public.campaign_content (campaign_id, pack_id, category, version)
  select b.campaign_id, p.id, 'creatures', p.version
    from public.campaign_srd_bestiary b cross join public.content_packs p
   where p.id = private.content_srd_pack()
  on conflict do nothing;
insert into public.campaign_content_hidden (campaign_id, pack_id, category, kind, key)
  select r.campaign_id, c.pack_id, 'creatures', 'creature', r.srd_id
    from public.campaign_srd_removed r
    join public.campaign_content c on c.campaign_id = r.campaign_id and c.category = 'creatures'
     and c.pack_id = private.content_srd_pack()
  on conflict do nothing;

revoke all on function private.content_category(text), private.content_at(uuid, text, integer),
  private.content_listed(text), private.content_srd_pack(), private.content_offered(uuid),
  private.content_srd_mismatch(uuid),
  private.campaign_content_require_dm(uuid), private.campaign_content_from_bestiary(),
  private.campaign_content_from_removed(), private.campaign_content_defaults()
  from public, anon, authenticated;
revoke all on function public.get_campaign_content(uuid), public.set_campaign_content(uuid, uuid, text, boolean),
  public.get_campaign_content_changes(uuid, uuid, text), public.update_campaign_content(uuid, uuid, text, integer),
  public.list_campaign_content_entries(uuid, uuid, text, text, integer),
  public.set_campaign_content_hidden(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.get_campaign_content(uuid), public.set_campaign_content(uuid, uuid, text, boolean),
  public.get_campaign_content_changes(uuid, uuid, text), public.update_campaign_content(uuid, uuid, text, integer),
  public.list_campaign_content_entries(uuid, uuid, text, text, integer),
  public.set_campaign_content_hidden(uuid, uuid, text, text, boolean) to authenticated;
$ddl$;
begin
  if to_regclass('pre.content_packs') is not null
      and to_regclass('pre.campaign_srd_bestiary') is not null
      and to_regprocedure('pre_private.content_begin(uuid,jsonb)') is not null
      and to_regprocedure('pre_private.is_campaign_dm(uuid)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;

-- Deleting one's account also clears it as the last person who changed a campaign's content.
do $deletion$
declare env text; fn regprocedure; def text; anchor text;
begin
  foreach env in array array['public', 'pre'] loop
    fn := to_regprocedure(env || '.delete_my_account(text,uuid)');
    if fn is null or to_regclass(env || '.campaign_content') is null then continue; end if;
    def := pg_get_functiondef(fn);
    if strpos(def, '.campaign_content set updated_by') > 0 then continue; end if;
    anchor := 'delete from ' || env || '.profiles where user_id = viewer;';
    if strpos(def, anchor) = 0 then
      raise exception 'delete_my_account changed: % not found', anchor; end if;
    execute replace(def, anchor, format(
      'update %1$s.campaign_content set updated_by = null where updated_by = viewer; %2$s', env, anchor));
  end loop;
end;
$deletion$;
