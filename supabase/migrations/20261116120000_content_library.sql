-- RYT-092: the content library, a downloadable game-data endpoint (ADR 040).
--
-- A content pack is a source (the SRD 5.2.1, a homebrew set, a book the owner bought) and its
-- entries are game data by kind (creature, spell, rule, condition, class feature, subclass, ...).
-- Editors change entries as drafts; publishing a pack copies every pending draft to its published
-- copy and bumps the pack version, so clients download again only when the version changes.
--
-- Data:
--   private.content_editors   the platform role that may write; granted outside the repository.
--   private.content_requests  idempotent replies of the write RPCs.
--   content_packs             slug, titles and descriptions (English, Spanish), edition, license,
--                             attribution, visibility (public | private), owner, version (0 until
--                             the first publish), revision.
--   content_entries           pack, kind, key (unique per pack and kind), draft names and data,
--                             a pending-delete flag, and the published names and data.
--   Entry data is a JSON object (at most 128 KB as text); its optional "index" object (at most
--   4 KB) is the listing metadata the manager shows without loading the whole entry.
--
-- RPCs (security definer, fixed search_path):
--   get_content_library        signed-in: {editor, packs}. Others see published public packs and
--                              their own published private packs; editors see every pack with
--                              draft counts, pending changes and revisions.
--   get_content_entries        signed-in: the published entries of one kind of a readable pack and
--                              the pack version, 500 per page in key order (`after_key`, `next`).
--                              Unreadable or unknown packs raise Forbidden.
--   list_content_drafts, get_content_draft, list_content_changes   editors: drafts and their state
--                              (new, changed, deleted, published).
--   save_content_pack, delete_content_pack (never published only), save_content_entry,
--   delete_content_entry (pending delete once published), revert_content_entry,
--   import_content_entries (up to 500 per call, with a dry run), publish_content_pack
--                              editors only; revision or version checks and idempotent request ids.
--   set_content_pack_visibility  editors: the only way to change who can read a published pack;
--                              save_content_pack refuses it, because it applies at once, not on publish.
--
-- Limits: a pack update must send every field (a missing one never resets attribution or
-- visibility); a pack payload is at most 16 KB with known keys only; at most 5000 entries per pack
-- and kind. Idempotency keys store a SHA-256 of large payloads, and a request id is serialised with
-- an advisory lock, so a double tap replays the first result instead of failing.
--
-- Actor matrix: anon cannot execute anything and has no table access; signed-in users who are not
-- editors read only published public packs (and published private packs they own) through the read
-- RPCs and raise Forbidden on every editor RPC; editors read and write everything. The tables have
-- RLS on and no grants: every read and write goes through the RPCs. A retried request id replays
-- the caller's own earlier result before the editor check (as in RYT-089): results hold only ids,
-- revisions and counts. A different payload with the same id raises Request mismatch.
--
-- Environments: this file runs on production (public / private). When a PRE (pre / pre_private)
-- exists without this change, the same DDL runs again remapped with pre_admin.remap. Editors are
-- granted in each environment; a PRE refresh (pre:sync) copies private.content_editors, the packs
-- (private ones included) and the replies from production, so production editors become PRE
-- editors and PRE-only grants must be repeated after a refresh. Published packs cannot be deleted
-- through the API; a takedown is an owner SQL operation (docs/security.md).

do $library$
declare ddl text := $ddl$
create table private.content_editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
revoke all on private.content_editors from public, anon, authenticated;
alter table private.content_editors enable row level security;
comment on table private.content_editors is
  'RYT-092 accounts that may write the content library. Granted with SQL outside the repository.';

create table private.content_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on private.content_requests from public, anon, authenticated;
alter table private.content_requests enable row level security;

create table public.content_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title_en text not null default '' check (char_length(title_en) <= 120 and title_en = btrim(title_en)),
  title_es text not null default '' check (char_length(title_es) <= 120 and title_es = btrim(title_es)),
  description_en text not null default '' check (char_length(description_en) <= 2000),
  description_es text not null default '' check (char_length(description_es) <= 2000),
  edition text check (edition in ('2024', '2014')),
  license text not null default '' check (char_length(license) <= 120),
  attribution text not null default '' check (char_length(attribution) <= 2000),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  owner_id uuid references auth.users(id) on delete set null,
  version integer not null default 0 check (version between 0 and 2000000000),
  published_at timestamptz,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_packs_titled check (title_en <> '' or title_es <> '')
);

create table public.content_entries (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.content_packs(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9-]{0,31}$'),
  key text not null check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(key) <= 80),
  name_en text not null default '' check (char_length(name_en) <= 120),
  name_es text not null default '' check (char_length(name_es) <= 120),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 131072),
  deleted boolean not null default false,
  published_name_en text,
  published_name_es text,
  published_data jsonb,
  published_version integer,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint content_entries_named check (name_en <> '' or name_es <> ''),
  constraint content_entries_pack_kind_key unique (pack_id, kind, key)
);
create index content_entries_pack_kind on public.content_entries (pack_id, kind);

alter table public.content_packs enable row level security;
alter table public.content_entries enable row level security;
revoke all on public.content_packs, public.content_entries from public, anon, authenticated;
comment on table public.content_packs is
  'RYT-092 content library packs (ADR 040). RLS on, no grants: read and written through RPCs only.';
comment on table public.content_entries is
  'RYT-092 content library entries: draft and published copies. RPC access only.';

-- ---------------------------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------------------------

create function private.is_content_editor() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select auth.uid() is not null
    and exists (select 1 from private.content_editors e where e.user_id = auth.uid());
$fn$;

create function private.content_require_editor() returns void
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not private.is_content_editor() then raise exception 'Forbidden' using errcode = '42501'; end if;
end;
$fn$;

-- Signed-in check and idempotent replay. Role checks follow in each RPC.
create function private.content_begin(request_id uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare prior private.content_requests;
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  -- A second call with the same id waits for the first one and then replays its result.
  perform pg_advisory_xact_lock(hashtextextended('rytta.content_request:' || request_id::text, 0));
  select * into prior from private.content_requests r where r.request_id = content_begin.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result;
  end if;
  return null;
end;
$fn$;

create function private.content_finish(request_id uuid, payload jsonb, result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into private.content_requests (request_id, actor_id, payload, result)
    values (request_id, auth.uid(), payload, result);
  return result;
end;
$fn$;

-- The pack row, locked: every write of a pack and its entries is serialised on it.
create function private.content_pack_locked(target_pack uuid) returns public.content_packs
language plpgsql security definer set search_path = '' as $fn$
declare p public.content_packs;
begin
  select * into p from public.content_packs where id = target_pack for update;
  if p.id is null then raise exception 'Pack unavailable' using errcode = '42501'; end if;
  return p;
end;
$fn$;

-- The idempotency key of a large payload: its SHA-256 (the payload itself is not stored).
create function private.content_digest(value jsonb) returns text
language sql immutable set search_path = '' as $fn$
  select encode(sha256(convert_to(coalesce(value::text, ''), 'UTF8')), 'hex');
$fn$;

-- A trimmed string field ('' when absent or null); anything else, or a longer text, is invalid.
create function private.content_text(source jsonb, field text, max_length integer) returns text
language plpgsql immutable set search_path = '' as $fn$
declare value jsonb := source -> field; result text;
begin
  if value is null or value = 'null'::jsonb then return ''; end if;
  if jsonb_typeof(value) <> 'string' then raise exception 'Invalid request' using errcode = '22023'; end if;
  result := btrim(value #>> '{}');
  if char_length(result) > max_length then raise exception 'Invalid request' using errcode = '22023'; end if;
  return result;
end;
$fn$;

-- Why an entry cannot be stored, or null when it can.
create function private.content_entry_problem(kind text, key text, name_en text, name_es text, data jsonb)
returns text language sql immutable set search_path = '' as $fn$
  select case
    when kind is null or kind !~ '^[a-z][a-z0-9-]{0,31}$' then 'kind'
    when key is null or key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(key) > 80 then 'key'
    when name_en is null or name_es is null or char_length(name_en) > 120 or char_length(name_es) > 120
      or (name_en = '' and name_es = '') then 'name'
    when data is null or jsonb_typeof(data) <> 'object' then 'data'
    when octet_length(data::text) > 131072 then 'size'
    when data ? 'index' and (jsonb_typeof(data -> 'index') <> 'object'
      or octet_length((data -> 'index')::text) > 4096) then 'index'
  end;
$fn$;

-- A string field of an imported item, trimmed; null when it is not a string.
create function private.content_item_text(item jsonb, field text) returns text
language sql immutable set search_path = '' as $fn$
  select case when item -> field is null or item -> field = 'null'::jsonb then ''
    when jsonb_typeof(item -> field) = 'string' then btrim(item ->> field) end;
$fn$;

-- plpgsql (not sql) so that the PRE refresh, which recreates functions in name order, can create
-- content_draft_row before the content_entry_state it calls.
create function private.content_entry_state(e public.content_entries) returns text
language plpgsql immutable set search_path = '' as $fn$
begin
  return case
    when e.published_data is null then 'new'
    when e.deleted then 'deleted'
    when e.data = e.published_data and e.name_en = e.published_name_en
      and e.name_es = e.published_name_es then 'published'
    else 'changed'
  end;
end;
$fn$;

create function private.content_draft_row(e public.content_entries) returns jsonb
language plpgsql immutable set search_path = '' as $fn$
begin
  return jsonb_build_object('id', e.id, 'kind', e.kind, 'key', e.key, 'name_en', e.name_en,
    'name_es', e.name_es, 'index', case when jsonb_typeof(e.data -> 'index') = 'object' then e.data -> 'index' end,
    'state', private.content_entry_state(e), 'revision', e.revision, 'updated_at', e.updated_at);
end;
$fn$;

revoke all on function private.is_content_editor(), private.content_require_editor(),
  private.content_begin(uuid, jsonb), private.content_finish(uuid, jsonb, jsonb),
  private.content_pack_locked(uuid), private.content_text(jsonb, text, integer), private.content_digest(jsonb),
  private.content_entry_problem(text, text, text, text, jsonb), private.content_item_text(jsonb, text),
  private.content_entry_state(public.content_entries), private.content_draft_row(public.content_entries)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Read RPCs
-- ---------------------------------------------------------------------------------------------

create function public.get_content_library() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare editor boolean;
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  editor := private.is_content_editor();
  return jsonb_build_object('editor', editor, 'packs', coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'title_en', p.title_en, 'title_es', p.title_es,
        'description_en', p.description_en, 'description_es', p.description_es, 'edition', p.edition,
        'license', p.license, 'attribution', p.attribution, 'visibility', p.visibility,
        'mine', p.owner_id = auth.uid(), 'version', p.version, 'published_at', p.published_at,
        'kinds', (select coalesce(jsonb_object_agg(k.kind, k.n), '{}'::jsonb) from (
            select e.kind, count(*) n from public.content_entries e
            where e.pack_id = p.id and e.published_data is not null group by e.kind) k),
        'drafts', case when editor then (select coalesce(jsonb_object_agg(k.kind, k.n), '{}'::jsonb) from (
            select e.kind, count(*) n from public.content_entries e
            where e.pack_id = p.id and not e.deleted group by e.kind) k) end,
        'pending', case when editor then (select count(*) from public.content_entries e
            where e.pack_id = p.id and private.content_entry_state(e) <> 'published') end,
        'revision', case when editor then p.revision end))
      order by p.slug)
    from public.content_packs p
    where editor or (p.version > 0 and (p.visibility = 'public' or p.owner_id = auth.uid()))), '[]'::jsonb));
end;
$fn$;

-- One page (500 entries in key order) after `after_key`; `next` is the key to ask for the next page.
create function public.get_content_entries(target_pack uuid, entry_kind text, after_key text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare p public.content_packs; page jsonb; last_key text; more boolean;
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into p from public.content_packs where id = target_pack;
  if p.id is null or (not private.is_content_editor()
      and (p.version = 0 or not (p.visibility = 'public' or p.owner_id = auth.uid()))) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'name_en', s.published_name_en,
      'name_es', s.published_name_es, 'data', s.published_data) order by s.key), '[]'::jsonb), max(s.key)
    into page, last_key
    from (select e.key, e.published_name_en, e.published_name_es, e.published_data
      from public.content_entries e
      where e.pack_id = p.id and e.kind = entry_kind and e.published_data is not null
        and (after_key is null or e.key > after_key)
      order by e.key limit 500) s;
  more := last_key is not null and exists (select 1 from public.content_entries e
    where e.pack_id = p.id and e.kind = entry_kind and e.published_data is not null and e.key > last_key);
  return jsonb_build_object('pack_id', p.id, 'version', p.version, 'kind', entry_kind, 'entries', page,
    'next', case when more then last_key end);
end;
$fn$;

create function public.list_content_drafts(target_pack uuid, entry_kind text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.content_require_editor();
  if not exists (select 1 from public.content_packs where id = target_pack) then
    raise exception 'Pack unavailable' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_strip_nulls(private.content_draft_row(e)) order by e.key)
    from public.content_entries e where e.pack_id = target_pack and e.kind = entry_kind), '[]'::jsonb);
end;
$fn$;

create function public.list_content_changes(target_pack uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.content_require_editor();
  if not exists (select 1 from public.content_packs where id = target_pack) then
    raise exception 'Pack unavailable' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(c.row order by c.kind, c.key) from (
      select e.kind, e.key, jsonb_strip_nulls(private.content_draft_row(e) - 'index') as row
      from public.content_entries e
      where e.pack_id = target_pack and private.content_entry_state(e) <> 'published'
      order by e.kind, e.key limit 1000) c), '[]'::jsonb);
end;
$fn$;

create function public.get_content_draft(target_entry uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare e public.content_entries;
begin
  perform private.content_require_editor();
  select * into e from public.content_entries where id = target_entry;
  if e.id is null then raise exception 'Entry unavailable' using errcode = '42501'; end if;
  return private.content_draft_row(e) - 'index' || jsonb_build_object('pack_id', e.pack_id, 'data', e.data,
    'published', case when e.published_data is not null then jsonb_build_object('name_en', e.published_name_en,
      'name_es', e.published_name_es, 'data', e.published_data, 'version', e.published_version) end);
end;
$fn$;

-- ---------------------------------------------------------------------------------------------
-- Write RPCs (editors)
-- ---------------------------------------------------------------------------------------------

create function public.save_content_pack(target_pack uuid, expected_revision bigint, payload jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare request_key jsonb; replay jsonb; p public.content_packs; slug_value text; edition_value text;
  visibility_value text; title_en_value text; title_es_value text;
  fields constant text[] := array['slug', 'title_en', 'title_es', 'description_en', 'description_es',
    'edition', 'license', 'attribution', 'visibility'];
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 16384
      or exists (select 1 from jsonb_object_keys(payload) k where k <> all (fields))
      -- An update sends every field: a missing one must never reset attribution or visibility.
      or (target_pack is not null and not payload ?& fields) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  request_key := jsonb_build_array('pack_save', target_pack, expected_revision, private.content_digest(payload));
  replay := private.content_begin(request_id, request_key);
  if replay is not null then return replay; end if;
  perform private.content_require_editor();
  slug_value := private.content_text(payload, 'slug', 60);
  edition_value := nullif(private.content_text(payload, 'edition', 4), '');
  visibility_value := coalesce(nullif(private.content_text(payload, 'visibility', 10), ''), 'private');
  title_en_value := private.content_text(payload, 'title_en', 120);
  title_es_value := private.content_text(payload, 'title_es', 120);
  if slug_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or (edition_value is not null and edition_value not in ('2024', '2014'))
      or visibility_value not in ('public', 'private') or (title_en_value = '' and title_es_value = '') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  begin
    if target_pack is null then
      insert into public.content_packs (slug, title_en, title_es, description_en, description_es, edition,
          license, attribution, visibility, owner_id)
        values (slug_value, title_en_value, title_es_value, private.content_text(payload, 'description_en', 2000),
          private.content_text(payload, 'description_es', 2000), edition_value,
          private.content_text(payload, 'license', 120), private.content_text(payload, 'attribution', 2000),
          visibility_value, auth.uid())
        returning * into p;
    else
      p := private.content_pack_locked(target_pack);
      if p.revision is distinct from expected_revision then
        raise exception 'Stale revision' using errcode = 'P0001'; end if;
      -- Clients find a published pack by its slug, and its readers change only through
      -- set_content_pack_visibility (it applies at once, not on publish).
      if p.version > 0 and (slug_value <> p.slug or visibility_value <> p.visibility) then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      update public.content_packs set slug = slug_value, title_en = title_en_value, title_es = title_es_value,
          description_en = private.content_text(payload, 'description_en', 2000),
          description_es = private.content_text(payload, 'description_es', 2000), edition = edition_value,
          license = private.content_text(payload, 'license', 120),
          attribution = private.content_text(payload, 'attribution', 2000), visibility = visibility_value,
          revision = revision + 1, updated_at = now()
        where id = p.id returning * into p;
    end if;
  exception when unique_violation then
    raise exception 'Slug taken' using errcode = 'P0001';
  end;
  return private.content_finish(request_id, request_key, jsonb_build_object('id', p.id, 'revision', p.revision));
end;
$fn$;

create function public.set_content_pack_visibility(target_pack uuid, expected_revision bigint,
  new_visibility text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare request_key jsonb := jsonb_build_array('pack_visibility', target_pack, expected_revision, new_visibility);
  replay jsonb; p public.content_packs;
begin
  replay := private.content_begin(request_id, request_key);
  if replay is not null then return replay; end if;
  perform private.content_require_editor();
  if new_visibility is null or new_visibility not in ('public', 'private') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  p := private.content_pack_locked(target_pack);
  if p.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  update public.content_packs set visibility = new_visibility, revision = revision + 1, updated_at = now()
    where id = p.id returning * into p;
  return private.content_finish(request_id, request_key, jsonb_build_object('id', p.id, 'revision', p.revision,
    'visibility', p.visibility));
end;
$fn$;

create function public.delete_content_pack(target_pack uuid, expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare request_key jsonb := jsonb_build_array('pack_delete', target_pack, expected_revision);
  replay jsonb; p public.content_packs;
begin
  replay := private.content_begin(request_id, request_key);
  if replay is not null then return replay; end if;
  perform private.content_require_editor();
  p := private.content_pack_locked(target_pack);
  if p.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  -- A published pack may already be in use; only packs never published can be deleted.
  if p.version > 0 then raise exception 'Pack published' using errcode = 'P0001'; end if;
  delete from public.content_packs where id = p.id;
  return private.content_finish(request_id, request_key, jsonb_build_object('id', p.id, 'deleted', true));
end;
$fn$;

create function public.save_content_entry(target_pack uuid, target_entry uuid, expected_revision bigint,
  payload jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare request_key jsonb; replay jsonb; e public.content_entries; kind_value text; key_value text;
  name_en_value text; name_es_value text; data_value jsonb;
begin
  if payload is not null and octet_length(payload::text) > 140000 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  request_key := jsonb_build_array('entry_save', target_pack, target_entry, expected_revision,
    private.content_digest(payload));
  replay := private.content_begin(request_id, request_key);
  if replay is not null then return replay; end if;
  perform private.content_require_editor();
  perform private.content_pack_locked(target_pack);
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  kind_value := private.content_text(payload, 'kind', 32);
  key_value := private.content_text(payload, 'key', 80);
  name_en_value := private.content_text(payload, 'name_en', 120);
  name_es_value := private.content_text(payload, 'name_es', 120);
  data_value := payload -> 'data';
  if private.content_entry_problem(kind_value, key_value, name_en_value, name_es_value, data_value) is not null then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if target_entry is null then
    if exists (select 1 from public.content_entries
        where pack_id = target_pack and kind = kind_value and key = key_value) then
      raise exception 'Key taken' using errcode = 'P0001'; end if;
    if (select count(*) from public.content_entries where pack_id = target_pack and kind = kind_value) >= 5000 then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    insert into public.content_entries (pack_id, kind, key, name_en, name_es, data, updated_by)
      values (target_pack, kind_value, key_value, name_en_value, name_es_value, data_value, auth.uid())
      returning * into e;
  else
    select * into e from public.content_entries where id = target_entry and pack_id = target_pack for update;
    if e.id is null then raise exception 'Entry unavailable' using errcode = '42501'; end if;
    if e.revision is distinct from expected_revision then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    -- The kind and key identify the entry for clients; they never change.
    if kind_value <> e.kind or key_value <> e.key then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    update public.content_entries set name_en = name_en_value, name_es = name_es_value, data = data_value,
        deleted = false, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
      where id = e.id returning * into e;
  end if;
  return private.content_finish(request_id, request_key, jsonb_build_object('id', e.id, 'revision', e.revision,
    'state', private.content_entry_state(e)));
end;
$fn$;

-- Shared by delete and revert: the entry and its pack, locked, after the revision check.
create function private.content_entry_locked(target_entry uuid, expected_revision bigint)
returns public.content_entries language plpgsql security definer set search_path = '' as $fn$
declare e public.content_entries; pack uuid;
begin
  select pack_id into pack from public.content_entries where id = target_entry;
  if pack is null then raise exception 'Entry unavailable' using errcode = '42501'; end if;
  perform private.content_pack_locked(pack);
  select * into e from public.content_entries where id = target_entry for update;
  if e.id is null then raise exception 'Entry unavailable' using errcode = '42501'; end if;
  if e.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  return e;
end;
$fn$;
revoke all on function private.content_entry_locked(uuid, bigint) from public, anon, authenticated;

create function public.delete_content_entry(target_entry uuid, expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare request_key jsonb := jsonb_build_array('entry_delete', target_entry, expected_revision);
  replay jsonb; e public.content_entries;
begin
  replay := private.content_begin(request_id, request_key);
  if replay is not null then return replay; end if;
  perform private.content_require_editor();
  e := private.content_entry_locked(target_entry, expected_revision);
  -- Never published: it goes now. Published: it stays for clients until the next publish.
  if e.published_data is null then
    delete from public.content_entries where id = e.id;
    return private.content_finish(request_id, request_key, jsonb_build_object('id', e.id, 'deleted', true));
  end if;
  update public.content_entries set deleted = true, revision = revision + 1, updated_at = now(),
      updated_by = auth.uid()
    where id = e.id returning * into e;
  return private.content_finish(request_id, request_key, jsonb_build_object('id', e.id, 'revision', e.revision,
    'state', private.content_entry_state(e)));
end;
$fn$;

create function public.revert_content_entry(target_entry uuid, expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare request_key jsonb := jsonb_build_array('entry_revert', target_entry, expected_revision);
  replay jsonb; e public.content_entries;
begin
  replay := private.content_begin(request_id, request_key);
  if replay is not null then return replay; end if;
  perform private.content_require_editor();
  e := private.content_entry_locked(target_entry, expected_revision);
  if e.published_data is null then
    delete from public.content_entries where id = e.id;
    return private.content_finish(request_id, request_key, jsonb_build_object('id', e.id, 'deleted', true));
  end if;
  update public.content_entries set name_en = published_name_en, name_es = published_name_es,
      data = published_data, deleted = false, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
    where id = e.id returning * into e;
  return private.content_finish(request_id, request_key, jsonb_build_object('id', e.id, 'revision', e.revision,
    'state', private.content_entry_state(e)));
end;
$fn$;

-- Up to 500 entries of one kind, matched by key. A dry run reports without writing, without locks
-- and without a stored reply. Unchanged entries are left alone; a pending delete of a re-imported
-- entry is undone. A pack keeps at most 5000 entries of one kind.
create function public.import_content_entries(target_pack uuid, entry_kind text, entries jsonb,
  dry_run boolean, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare request_key jsonb; replay jsonb; item jsonb; item_position bigint; key_value text; name_en_value text;
  name_es_value text; problem text; seen text[] := '{}'; existing public.content_entries;
  added integer := 0; updated integer := 0; unchanged integer := 0; refused jsonb := '[]'::jsonb;
  refused_count integer := 0; report jsonb; stored bigint;
begin
  if dry_run is null or entry_kind is null or entry_kind !~ '^[a-z][a-z0-9-]{0,31}$' or entries is null
      or jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) not between 1 and 500 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if dry_run then
    if auth.uid() is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  else
    request_key := jsonb_build_array('entry_import', target_pack, entry_kind, private.content_digest(entries));
    replay := private.content_begin(request_id, request_key);
    if replay is not null then return replay; end if;
  end if;
  perform private.content_require_editor();
  if dry_run then
    if not exists (select 1 from public.content_packs where id = target_pack) then
      raise exception 'Pack unavailable' using errcode = '42501'; end if;
  else
    perform private.content_pack_locked(target_pack);
  end if;
  for item, item_position in select a.value, a.ordinality from jsonb_array_elements(entries) with ordinality a loop
    key_value := case when jsonb_typeof(item) = 'object' then private.content_item_text(item, 'key') end;
    name_en_value := case when jsonb_typeof(item) = 'object' then private.content_item_text(item, 'name_en') end;
    name_es_value := case when jsonb_typeof(item) = 'object' then private.content_item_text(item, 'name_es') end;
    problem := case
      when jsonb_typeof(item) <> 'object' then 'data'
      when key_value is not null and key_value = any (seen) then 'duplicate'
      else private.content_entry_problem(entry_kind, key_value, name_en_value, name_es_value, item -> 'data')
    end;
    if problem is not null then
      refused_count := refused_count + 1;
      if refused_count <= 100 then
        refused := refused || jsonb_build_object('position', item_position, 'key', key_value, 'reason', problem);
      end if;
      continue;
    end if;
    seen := seen || key_value;
    -- The pack lock already serialises a real import; a dry run reads without locking.
    select * into existing from public.content_entries
      where pack_id = target_pack and kind = entry_kind and key = key_value;
    if existing.id is null then
      added := added + 1;
      if not dry_run then
        insert into public.content_entries (pack_id, kind, key, name_en, name_es, data, updated_by)
          values (target_pack, entry_kind, key_value, name_en_value, name_es_value, item -> 'data', auth.uid());
      end if;
    elsif existing.data = item -> 'data' and existing.name_en = name_en_value
        and existing.name_es = name_es_value and not existing.deleted then
      unchanged := unchanged + 1;
    else
      updated := updated + 1;
      if not dry_run then
        update public.content_entries set name_en = name_en_value, name_es = name_es_value, data = item -> 'data',
            deleted = false, revision = revision + 1, updated_at = now(), updated_by = auth.uid()
          where id = existing.id;
      end if;
    end if;
  end loop;
  -- A real import has already inserted its new entries; a dry run counts them on top.
  stored := (select count(*) from public.content_entries where pack_id = target_pack and kind = entry_kind);
  if dry_run then stored := stored + added; end if;
  if added > 0 and stored > 5000 then raise exception 'Invalid request' using errcode = '22023'; end if;
  report := jsonb_build_object('added', added, 'updated', updated, 'unchanged', unchanged,
    'refused', refused_count, 'problems', refused, 'dry_run', dry_run);
  if dry_run then return report; end if;
  return private.content_finish(request_id, request_key, report);
end;
$fn$;

create function public.publish_content_pack(target_pack uuid, expected_version integer, request_id uuid)
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
  delete from public.content_entries where pack_id = p.id and deleted;
  update public.content_entries e set published_name_en = e.name_en, published_name_es = e.name_es,
      published_data = e.data, published_version = p.version + 1
    where e.pack_id = p.id and private.content_entry_state(e) in ('new', 'changed');
  update public.content_packs set version = version + 1, published_at = now(), revision = revision + 1,
      updated_at = now()
    where id = p.id returning * into p;
  return private.content_finish(request_id, request_key, jsonb_build_object('id', p.id, 'version', p.version,
    'revision', p.revision, 'added', added, 'changed', changed, 'removed', removed));
end;
$fn$;

revoke all on function public.get_content_library(), public.get_content_entries(uuid, text, text),
  public.list_content_drafts(uuid, text), public.list_content_changes(uuid), public.get_content_draft(uuid),
  public.save_content_pack(uuid, bigint, jsonb, uuid), public.delete_content_pack(uuid, bigint, uuid),
  public.save_content_entry(uuid, uuid, bigint, jsonb, uuid), public.delete_content_entry(uuid, bigint, uuid),
  public.revert_content_entry(uuid, bigint, uuid), public.import_content_entries(uuid, text, jsonb, boolean, uuid),
  public.publish_content_pack(uuid, integer, uuid), public.set_content_pack_visibility(uuid, bigint, text, uuid)
  from public, anon;
grant execute on function public.get_content_library(), public.get_content_entries(uuid, text, text),
  public.list_content_drafts(uuid, text), public.list_content_changes(uuid), public.get_content_draft(uuid),
  public.save_content_pack(uuid, bigint, jsonb, uuid), public.delete_content_pack(uuid, bigint, uuid),
  public.save_content_entry(uuid, uuid, bigint, jsonb, uuid), public.delete_content_entry(uuid, bigint, uuid),
  public.revert_content_entry(uuid, bigint, uuid), public.import_content_entries(uuid, text, jsonb, boolean, uuid),
  public.publish_content_pack(uuid, integer, uuid), public.set_content_pack_visibility(uuid, bigint, text, uuid)
  to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre_admin.remap(text)') is not null and to_regclass('pre.campaigns') is not null
      and to_regclass('pre.content_packs') is null then
    execute pre_admin.remap(ddl);
  end if;
end;
$library$;
