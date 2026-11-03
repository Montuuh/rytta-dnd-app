-- RYT-008: campaign homebrew glossary entries.
-- The SRD 5.2.1 rules glossary and spells are bundled in the app (CC-BY-4.0, ADR 023); this
-- migration stores only the campaign's own homebrew entries and house rules. DM and Players
-- have the same permissions in this module (user decision 2026-11-03), within the DM's module
-- switch: a Player reads and writes only while 'glossary' is in campaigns.player_modules.
--
-- Actor matrix:
--   anon: no table access, no RPC execution.
--   outsider / inactive member / DM of another campaign: RLS hides every entry; every RPC
--           raises Forbidden.
--   Player (active member) with the glossary module enabled: reads, creates, edits and deletes
--           any entry of the campaign. With the module disabled: no reads, RPCs raise Forbidden.
--   active campaign DM: reads, creates, edits and deletes any entry, regardless of the switch.
-- Writes go through security definer RPCs with a revision check (optimistic concurrency).
-- Creation is idempotent on the client-generated entry id: a retried create with the same id
-- and payload returns the stored entry. Names are unique per campaign (case-insensitive) so
-- automatic term links stay unambiguous. Text is plain; clients never render it as HTML.
--
-- Environments: this file runs on production (public). A PRE (pre / pre_private) that predates
-- this migration receives the same table, policy and functions through the guarded blocks,
-- remapped with the canonical pre_admin.remap used by the ETL (docs/pre-environment.md).
-- Apply to PRE first, validate, then to production.

do $structure$
declare ddl text := $ddl$
  create table public.glossary_entries (
    id uuid primary key,
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    category text not null check (category in ('rule', 'condition', 'action', 'spell', 'lore', 'other')),
    name text not null check (char_length(name) between 1 and 80 and name = btrim(name)),
    aliases text[] not null default '{}'::text[] check (cardinality(aliases) <= 10
      and char_length(array_to_string(aliases, '')) <= 600),
    summary text not null default '' check (char_length(summary) <= 280),
    body text not null default '' check (char_length(body) <= 8000),
    facts jsonb not null default '[]'::jsonb check (jsonb_typeof(facts) = 'array'
      and jsonb_array_length(facts) <= 8),
    srd_ref text check (srd_ref is null or srd_ref ~ '^[a-z]+\.[a-z0-9-]{1,80}$'),
    revision bigint not null default 1 check (revision between 1 and 9007199254740991),
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (campaign_id, id)
  );
  create unique index glossary_entries_name on public.glossary_entries(campaign_id, lower(name));
  create index glossary_entries_srd_ref on public.glossary_entries(campaign_id, srd_ref)
    where srd_ref is not null;

  alter table public.glossary_entries enable row level security;
  revoke all on public.glossary_entries from public, anon, authenticated;
  grant select on public.glossary_entries to authenticated;
  comment on table public.glossary_entries is
    'RYT-008 campaign homebrew glossary entries and house rules. RPC writes only.';
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.campaigns') is not null and to_regprocedure('pre_admin.remap(text)') is not null
      and to_regclass('pre.glossary_entries') is null then
    execute pre_admin.remap(ddl);
  end if;
end;
$structure$;

-- Active DM, or active member while the DM has the glossary module enabled for Players.
-- plpgsql (not sql) so the PRE ETL can recreate it before the membership helpers it calls.
create function private.can_use_glossary(target_campaign uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.is_campaign_dm(target_campaign)
    or (private.is_campaign_member(target_campaign) and exists (
      select 1 from public.campaigns c
      where c.id = target_campaign and 'glossary' = any(c.player_modules)));
end;
$$;

-- The policy is created after its helper (the helper reads campaigns, which predates it).
create policy glossary_entries_read on public.glossary_entries for select to authenticated
  using (private.can_use_glossary(campaign_id));

create function private.glossary_json(entry_id uuid) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  return (select jsonb_build_object('id', e.id, 'campaign_id', e.campaign_id, 'category', e.category,
    'name', e.name, 'aliases', to_jsonb(e.aliases), 'summary', e.summary, 'body', e.body,
    'facts', e.facts, 'srd_ref', e.srd_ref, 'revision', e.revision, 'created_by', e.created_by,
    'updated_by', e.updated_by, 'created_at', e.created_at, 'updated_at', e.updated_at)
  from public.glossary_entries e where e.id = entry_id);
end;
$$;

-- Validates and normalizes an entry payload; raises 'Invalid request' on any violation.
create function private.glossary_payload(payload jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  category text := payload->>'category';
  aliases text[] := array[]::text[];
  facts jsonb := '[]'::jsonb;
  item jsonb;
  alias text;
  label text;
  value text;
  ref text := nullif(btrim(coalesce(payload->>'srd_ref', '')), '');
begin
  if jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if category is null or category not in ('rule', 'condition', 'action', 'spell', 'lore', 'other') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if payload ? 'aliases' and jsonb_typeof(payload->'aliases') <> 'null' then
    if jsonb_typeof(payload->'aliases') <> 'array' or jsonb_array_length(payload->'aliases') > 10 then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    for item in select * from jsonb_array_elements(payload->'aliases') loop
      if jsonb_typeof(item) <> 'string' then raise exception 'Invalid request' using errcode = '22023'; end if;
      alias := private.check_text(item #>> '{}', 60, false);
      if not exists (select 1 from unnest(aliases) a where lower(a) = lower(alias)) then
        aliases := aliases || alias;
      end if;
    end loop;
  end if;
  if payload ? 'facts' and jsonb_typeof(payload->'facts') <> 'null' then
    if jsonb_typeof(payload->'facts') <> 'array' or jsonb_array_length(payload->'facts') > 8 then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    for item in select * from jsonb_array_elements(payload->'facts') loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'label') <> 'string'
          or jsonb_typeof(item->'value') <> 'string' then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      label := private.check_text(item->>'label', 40, false);
      value := private.check_text(item->>'value', 200, false);
      facts := facts || jsonb_build_array(jsonb_build_object('label', label, 'value', value));
    end loop;
  end if;
  if ref is not null and ref !~ '^[a-z]+\.[a-z0-9-]{1,80}$' then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  return jsonb_build_object(
    'category', category,
    'name', private.check_text(payload->>'name', 80, false),
    'aliases', to_jsonb(aliases),
    'summary', private.check_text(payload->>'summary', 280, true),
    'body', private.check_text(payload->>'body', 8000, true),
    'facts', facts,
    'srd_ref', ref);
end;
$$;

create function public.save_glossary_entry(target_campaign uuid, entry_id uuid,
  expected_revision bigint, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  clean jsonb;
  current public.glossary_entries;
  saved public.glossary_entries;
  new_aliases text[];
begin
  if target_campaign is null or entry_id is null or not private.can_use_glossary(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  clean := private.glossary_payload(payload);
  select coalesce(array_agg(a), array[]::text[]) into new_aliases
    from jsonb_array_elements_text(clean->'aliases') a;
  select * into current from public.glossary_entries where id = entry_id for update;
  if not found then
    if expected_revision is not null then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    begin
      insert into public.glossary_entries(id, campaign_id, category, name, aliases, summary, body,
          facts, srd_ref, created_by, updated_by)
        values (entry_id, target_campaign, clean->>'category', clean->>'name', new_aliases,
          clean->>'summary', clean->>'body', clean->'facts', clean->>'srd_ref',
          (select auth.uid()), (select auth.uid()))
        returning * into saved;
    exception when unique_violation then
      raise exception 'Duplicate name' using errcode = 'P0001';
    end;
    return private.glossary_json(saved.id);
  end if;
  if current.campaign_id <> target_campaign then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if expected_revision is null then
    -- A retried create: same author and same content is a replay; anything else conflicts.
    if current.created_by is not distinct from (select auth.uid()) and current.revision = 1
        and current.category = clean->>'category' and current.name = clean->>'name'
        and current.aliases = new_aliases and current.summary = clean->>'summary'
        and current.body = clean->>'body' and current.facts = clean->'facts'
        and current.srd_ref is not distinct from clean->>'srd_ref' then
      return private.glossary_json(current.id);
    end if;
    raise exception 'Stale revision' using errcode = 'P0001';
  end if;
  if current.revision <> expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  begin
    update public.glossary_entries set category = clean->>'category', name = clean->>'name',
        aliases = new_aliases, summary = clean->>'summary', body = clean->>'body',
        facts = clean->'facts', srd_ref = clean->>'srd_ref', revision = revision + 1,
        updated_by = (select auth.uid()), updated_at = now()
      where id = entry_id returning * into saved;
  exception when unique_violation then
    raise exception 'Duplicate name' using errcode = 'P0001';
  end;
  return private.glossary_json(saved.id);
end;
$$;

create function public.delete_glossary_entry(target_campaign uuid, entry_id uuid,
  expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current public.glossary_entries;
begin
  if target_campaign is null or entry_id is null or not private.can_use_glossary(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into current from public.glossary_entries where id = entry_id for update;
  -- Already gone (e.g. a retried delete): idempotent success within the caller's campaign.
  if not found then return jsonb_build_object('id', entry_id, 'deleted', true); end if;
  if current.campaign_id <> target_campaign then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if current.revision <> expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  delete from public.glossary_entries where id = entry_id;
  return jsonb_build_object('id', entry_id, 'deleted', true);
end;
$$;

revoke all on function private.can_use_glossary(uuid), private.glossary_json(uuid),
  private.glossary_payload(jsonb) from public, anon;
grant execute on function private.can_use_glossary(uuid) to authenticated;
revoke all on function public.save_glossary_entry(uuid, uuid, bigint, jsonb),
  public.delete_glossary_entry(uuid, uuid, bigint) from public, anon;
grant execute on function public.save_glossary_entry(uuid, uuid, bigint, jsonb),
  public.delete_glossary_entry(uuid, uuid, bigint) to authenticated;

-- PRE mirror of the helpers, policy and RPCs (only when PRE exists and predates this migration).
do $$
declare fn text;
begin
  if to_regclass('pre.glossary_entries') is null or to_regprocedure('pre_admin.remap(text)') is null
      or to_regprocedure('pre.delete_glossary_entry(uuid,uuid,bigint)') is not null then
    return;
  end if;
  execute pre_admin.remap(pg_get_functiondef('private.can_use_glossary(uuid)'::regprocedure));
  execute pre_admin.remap($ddl$
    create policy glossary_entries_read on public.glossary_entries for select to authenticated
      using (private.can_use_glossary(campaign_id));
  $ddl$);
  foreach fn in array array['private.glossary_json(uuid)',
      'private.glossary_payload(jsonb)'] loop
    execute pre_admin.remap(pg_get_functiondef(fn::regprocedure));
    execute format('revoke all on function %s from public, anon', pre_admin.remap(fn));
  end loop;
  execute format('revoke all on function %s from public, anon',
    pre_admin.remap('private.can_use_glossary(uuid)'));
  execute format('grant execute on function %s to authenticated',
    pre_admin.remap('private.can_use_glossary(uuid)'));
  foreach fn in array array['public.save_glossary_entry(uuid,uuid,bigint,jsonb)',
      'public.delete_glossary_entry(uuid,uuid,bigint)'] loop
    execute pre_admin.remap(pg_get_functiondef(fn::regprocedure));
    execute format('revoke all on function %s from public, anon', pre_admin.remap(fn));
    execute format('grant execute on function %s to authenticated', pre_admin.remap(fn));
  end loop;
end;
$$;
