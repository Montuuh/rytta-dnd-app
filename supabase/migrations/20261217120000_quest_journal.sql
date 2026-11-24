-- RYT-006: quest journal.
--
-- What. A campaign's quests: a title, the text the Players read, a status (rumour, active,
-- completed, failed), a published switch, up to 20 objectives that the DM reveals one by one and
-- marks done, and a DM-only note. Owner choices on 2026-11-22: objectives revealed one by one
-- (P1 B), four statuses (P2 A), Players only read (P7 A) and a quiet mark on what changed since a
-- Player last opened a quest (P5 A).
--
-- Data. public.quests and public.quest_objectives hold the quest and its objectives;
-- private.quest_notes holds the DM's note apart from them; private.quest_reads keeps, per
-- account and quest, when that account last opened it. None of these tables has a client grant:
-- every read and write goes through security definer functions with search_path ''.
-- public.quest_signals is the only table clients can SELECT: one secret-free row per campaign
-- (a revision and a time) that realtime follows. It changes only when something a Player can see
-- changes (a published quest's text, status or visible objectives, publishing, unpublishing or
-- deleting a published quest), so drafts and DM notes leave no trace in it.
--
-- Actor matrix.
--   anon: no table access, no function execution.
--   outsider, inactive member, DM of another campaign: every RPC raises Forbidden; no signal row.
--   Player (active member) while the DM has 'quests' in the campaign's player modules:
--     list_quests returns published quests only, with their visible objectives and the Player's
--     own last-opened time; never a draft, a hidden objective or the DM's note. mark_quest_seen
--     records that the Player opened a published quest. save_quest and delete_quest raise
--     Forbidden. With the module off, every RPC raises Forbidden and the signal row is hidden.
--   active DM of the campaign (also through admin access, RYT-153): reads everything, creates,
--     edits, publishes, advances and deletes quests, whatever the module switch says.
--
-- Writes. save_quest replaces a quest's fields and its whole objective list in one transaction,
-- with a revision check (optimistic concurrency). Creation is idempotent on the client-generated
-- quest id: a retried create with the same content returns the stored quest. A campaign keeps at
-- most 200 quests. Text is plain; clients never render it as HTML.
--
-- Change marks. A published quest stores when its Player-visible content last changed, and each
-- objective when it was revealed or last changed while visible. A Player sees "new" for what
-- changed after their own last-opened time, which is kept server side so it follows them across
-- devices. Deleting an account removes its read times and clears it as a quest's author (the
-- Auth cascade and delete_my_account both do). Read times of a member who leaves stay until the
-- quest goes; they name no content. Realtime DELETE events of quest_signals (a campaign deleted)
-- carry only the campaign id, as for encounter_signals.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists.
do $migration$
declare ddl text := $ddl$
create table if not exists public.quests (
  id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120 and title = btrim(title)),
  summary text not null default '' check (char_length(summary) <= 4000),
  status text not null default 'active' check (status in ('rumour', 'active', 'completed', 'failed')),
  published boolean not null default false,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  player_changed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, id)
);
create index if not exists quests_campaign on public.quests (campaign_id, updated_at desc);
create index if not exists quests_created_by on public.quests (created_by);
alter table public.quests enable row level security;
revoke all on public.quests from public, anon, authenticated;
comment on table public.quests is
  'RYT-006 campaign quests. No client grants: list_quests and save_quest only.';

create table if not exists public.quest_objectives (
  id uuid primary key,
  campaign_id uuid not null,
  quest_id uuid not null,
  position smallint not null check (position between 0 and 19),
  body text not null check (char_length(body) between 1 and 200),
  visible boolean not null default false,
  done boolean not null default false,
  player_changed_at timestamptz,
  foreign key (campaign_id, quest_id) references public.quests (campaign_id, id) on delete cascade,
  unique (quest_id, position)
);
create index if not exists quest_objectives_quest on public.quest_objectives (campaign_id, quest_id);
alter table public.quest_objectives enable row level security;
revoke all on public.quest_objectives from public, anon, authenticated;
comment on table public.quest_objectives is
  'RYT-006 quest objectives; hidden ones never leave the server for Players. No client grants.';

create table if not exists private.quest_notes (
  quest_id uuid primary key,
  campaign_id uuid not null,
  body text not null check (char_length(body) between 1 and 4000),
  foreign key (campaign_id, quest_id) references public.quests (campaign_id, id) on delete cascade
);
create index if not exists quest_notes_quest on private.quest_notes (campaign_id, quest_id);
alter table private.quest_notes enable row level security;
revoke all on private.quest_notes from public, anon, authenticated;

create table if not exists private.quest_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null,
  campaign_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, quest_id),
  foreign key (campaign_id, quest_id) references public.quests (campaign_id, id) on delete cascade
);
create index if not exists quest_reads_quest on private.quest_reads (campaign_id, quest_id);
alter table private.quest_reads enable row level security;
revoke all on private.quest_reads from public, anon, authenticated;

create table if not exists public.quest_signals (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now()
);
alter table public.quest_signals enable row level security;
revoke all on public.quest_signals from public, anon, authenticated;
grant select on public.quest_signals to authenticated;
drop policy if exists quest_signals_read on public.quest_signals;
create policy quest_signals_read on public.quest_signals for select to authenticated
  using (campaign_id in (select private.my_module_campaign_ids('quests')));
comment on table public.quest_signals is
  'RYT-006 realtime signal per campaign: a revision bumped on Player-visible quest changes only.';

/** The DM, or a member while the DM has the quests module on for Players. */
create or replace function private.can_read_quests(target_campaign uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return target_campaign is not null
    and target_campaign in (select private.my_module_campaign_ids('quests'));
end;
$fn$;

create or replace function private.quest_signal(target_campaign uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.quest_signals (campaign_id) values (target_campaign)
    on conflict (campaign_id) do update
      set revision = public.quest_signals.revision + 1, updated_at = now();
end;
$fn$;

/** What a Player could see of a quest, without times: null while it is a draft. */
create or replace function private.quest_visible(target_quest uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select case when q.published then jsonb_build_object(
      'title', q.title, 'summary', q.summary, 'status', q.status,
      'objectives', coalesce((select jsonb_agg(jsonb_build_array(o.id, o.body, o.done) order by o.position)
          from public.quest_objectives o where o.quest_id = q.id and o.visible), '[]'::jsonb))
    end
    from public.quests q where q.id = target_quest);
end;
$fn$;

create or replace function private.quest_dm_json(target_quest uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select jsonb_build_object(
      'id', q.id, 'title', q.title, 'summary', q.summary, 'status', q.status,
      'published', q.published, 'revision', q.revision, 'changed_at', q.player_changed_at,
      'created_at', q.created_at, 'updated_at', q.updated_at,
      'note', (select n.body from private.quest_notes n where n.quest_id = q.id),
      'objectives', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body,
          'visible', o.visible, 'done', o.done, 'changed_at', o.player_changed_at) order by o.position)
        from public.quest_objectives o where o.quest_id = q.id), '[]'::jsonb))
    from public.quests q where q.id = target_quest);
end;
$fn$;

create or replace function private.quest_player_json(target_quest uuid, viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select jsonb_build_object(
      'id', q.id, 'title', q.title, 'summary', q.summary, 'status', q.status,
      'changed_at', q.player_changed_at,
      'seen_at', (select r.seen_at from private.quest_reads r
        where r.user_id = viewer and r.quest_id = q.id),
      'objectives', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body,
          'done', o.done, 'changed_at', o.player_changed_at) order by o.position)
        from public.quest_objectives o where o.quest_id = q.id and o.visible), '[]'::jsonb))
    from public.quests q where q.id = target_quest and q.published);
end;
$fn$;

/** The campaign's quests: every quest for its DM, published ones only for Players. */
create or replace function public.list_quests(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare dm boolean;
begin
  if not private.can_read_quests(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  return jsonb_build_object('dm', dm, 'quests', coalesce((
    select jsonb_agg(case when dm then private.quest_dm_json(q.id)
        else private.quest_player_json(q.id, (select auth.uid())) end
      order by case when dm then q.updated_at else q.player_changed_at end desc nulls last, q.id)
      from public.quests q
     where q.campaign_id = target_campaign and (dm or q.published)), '[]'::jsonb));
end;
$fn$;

/** Creates or replaces a quest and its objectives (DM only), with a revision check. */
create or replace function public.save_quest(target_campaign uuid, target_quest uuid,
  expected_revision bigint, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  current public.quests;
  new_title text;
  new_summary text;
  new_status text;
  new_published boolean;
  new_note text;
  objectives jsonb := '[]'::jsonb;
  item jsonb;
  old_objectives jsonb;
  old_item jsonb;
  before_view jsonb;
  after_view jsonb;
  next_position integer := 0;
  objective_id uuid;
  new_body text;
  new_visible boolean;
  new_done boolean;
  changed timestamptz;
begin
  if target_campaign is null or target_quest is null or not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  -- The whole quest is replaced, so a payload must carry every part, objectives and note included.
  if jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload->'objectives') is distinct from 'array'
      or jsonb_typeof(payload->'note') is distinct from 'string' then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  new_title := private.check_text(payload->>'title', 120, false);
  new_summary := private.check_text(payload->>'summary', 4000, true);
  new_note := nullif(private.check_text(payload->>'note', 4000, true), '');
  new_status := payload->>'status';
  if new_status is null or new_status not in ('rumour', 'active', 'completed', 'failed') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if jsonb_typeof(payload->'published') is distinct from 'boolean' then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  new_published := (payload->>'published')::boolean;
  if jsonb_array_length(payload->'objectives') > 20 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  begin
    for item in select * from jsonb_array_elements(payload->'objectives') loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'id') <> 'string'
          or jsonb_typeof(item->'visible') <> 'boolean' or jsonb_typeof(item->'done') <> 'boolean' then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      begin
        objective_id := (item->>'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid request' using errcode = '22023';
      end;
      if objectives @> jsonb_build_array(jsonb_build_object('id', objective_id)) then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      objectives := objectives || jsonb_build_array(jsonb_build_object('id', objective_id,
        'body', private.check_text(item->>'body', 200, false),
        'visible', (item->>'visible')::boolean, 'done', (item->>'done')::boolean));
    end loop;
  end;

  -- One writer per campaign at a time: concurrent creates of the same id replay instead of failing.
  perform 1 from public.campaigns c where c.id = target_campaign for update;
  select * into current from public.quests q where q.id = target_quest for update;
  -- An id taken in another campaign looks like any other collision.
  if found and current.campaign_id <> target_campaign then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if not found then
    if expected_revision is not null then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    if (select count(*) from public.quests q where q.campaign_id = target_campaign) >= 200 then
      raise exception 'Quota exceeded' using errcode = 'P0001'; end if;
    insert into public.quests (id, campaign_id, title, summary, status, published, created_by)
      values (target_quest, target_campaign, new_title, new_summary, new_status, new_published, (select auth.uid()));
  else
    if expected_revision is null then
      -- A retried create: the same content is a replay; anything else is a conflict.
      if current.revision = 1 and current.title = new_title and current.summary = new_summary
          and current.status = new_status and current.published = new_published
          and (select n.body from private.quest_notes n where n.quest_id = target_quest) is not distinct from new_note
          and coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'body', o.body,
                'visible', o.visible, 'done', o.done) order by o.position)
              from public.quest_objectives o where o.quest_id = target_quest), '[]'::jsonb) = objectives then
        return private.quest_dm_json(target_quest);
      end if;
      raise exception 'Stale revision' using errcode = 'P0001';
    end if;
    if current.revision <> expected_revision then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    before_view := private.quest_visible(target_quest);
    update public.quests q set title = new_title, summary = new_summary,
        status = new_status, published = new_published,
        revision = q.revision + 1, updated_at = now()
      where q.id = target_quest;
  end if;

  select coalesce(jsonb_object_agg(o.id::text, jsonb_build_object('body', o.body,
      'visible', o.visible, 'done', o.done, 'changed_at', o.player_changed_at)), '{}'::jsonb)
    into old_objectives
    from public.quest_objectives o where o.quest_id = target_quest;
  delete from public.quest_objectives o where o.quest_id = target_quest;
  for item in select * from jsonb_array_elements(objectives) loop
    objective_id := (item->>'id')::uuid;
    new_body := item->>'body';
    new_visible := (item->>'visible')::boolean;
    new_done := (item->>'done')::boolean;
    old_item := old_objectives->(objective_id::text);
    changed := case
      when not new_visible then null
      when old_item is null or not (old_item->>'visible')::boolean or old_item->>'body' <> new_body
        or (old_item->>'done')::boolean <> new_done then now()
      else (old_item->>'changed_at')::timestamptz end;
    begin
      insert into public.quest_objectives (id, campaign_id, quest_id, position, body, visible, done,
          player_changed_at)
        values (objective_id, target_campaign, target_quest, next_position, new_body, new_visible, new_done, changed);
    exception when unique_violation then
      raise exception 'Invalid request' using errcode = '22023';
    end;
    next_position := next_position + 1;
  end loop;

  if new_note is null then
    delete from private.quest_notes n where n.quest_id = target_quest;
  else
    insert into private.quest_notes (quest_id, campaign_id, body)
      values (target_quest, target_campaign, new_note)
      on conflict (quest_id) do update set body = excluded.body;
  end if;

  after_view := private.quest_visible(target_quest);
  if after_view is not null and after_view is distinct from before_view then
    update public.quests q set player_changed_at = now() where q.id = target_quest;
    perform private.quest_signal(target_campaign);
  elsif after_view is null and before_view is not null then
    perform private.quest_signal(target_campaign);
  end if;
  return private.quest_dm_json(target_quest);
end;
$fn$;

/** Deletes a quest (DM only). A retried delete of a quest already gone succeeds. */
create or replace function public.delete_quest(target_campaign uuid, target_quest uuid,
  expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare current public.quests;
begin
  if target_campaign is null or target_quest is null or not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into current from public.quests q
    where q.id = target_quest and q.campaign_id = target_campaign for update;
  if not found then return jsonb_build_object('id', target_quest, 'deleted', true); end if;
  if expected_revision is null or current.revision <> expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  delete from public.quests q where q.id = target_quest;
  if current.published then perform private.quest_signal(target_campaign); end if;
  return jsonb_build_object('id', target_quest, 'deleted', true);
end;
$fn$;

/** Records that the caller opened a published quest, for the "new" marks. */
create or replace function public.mark_quest_seen(target_campaign uuid, target_quest uuid)
returns timestamptz
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); seen timestamptz := now();
begin
  if viewer is null or not private.can_read_quests(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.quests q
      where q.id = target_quest and q.campaign_id = target_campaign and q.published) then
    raise exception 'Quest unavailable' using errcode = 'P0002'; end if;
  insert into private.quest_reads (user_id, quest_id, campaign_id, seen_at)
    values (viewer, target_quest, target_campaign, seen)
    on conflict (user_id, quest_id) do update set seen_at = excluded.seen_at;
  return seen;
end;
$fn$;

revoke all on function private.can_read_quests(uuid), private.quest_signal(uuid),
  private.quest_visible(uuid), private.quest_dm_json(uuid), private.quest_player_json(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.list_quests(uuid), public.save_quest(uuid, uuid, bigint, jsonb),
  public.delete_quest(uuid, uuid, bigint), public.mark_quest_seen(uuid, uuid) from public, anon;
grant execute on function public.list_quests(uuid), public.save_quest(uuid, uuid, bigint, jsonb),
  public.delete_quest(uuid, uuid, bigint), public.mark_quest_seen(uuid, uuid) to authenticated;
$ddl$;
begin
  if to_regclass('pre.campaigns') is not null
      and to_regprocedure('pre_private.check_text(text,integer,boolean)') is not null
      and to_regprocedure('pre_private.my_module_campaign_ids(text)') is not null
      and to_regprocedure('pre_private.is_campaign_dm(uuid)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;

-- Deleting one's account also removes their quest read times and the author reference of the
-- quests they wrote, in production and in PRE (where the shared Auth user is not deleted).
do $deletion$
declare env text; fn regprocedure; def text; anchor text;
begin
  foreach env in array array['public', 'pre'] loop
    fn := to_regprocedure(env || '.delete_my_account(text,uuid)');
    if fn is null or to_regclass(env || '.quests') is null then continue; end if;
    def := pg_get_functiondef(fn);
    if strpos(def, '.quest_reads') > 0 then continue; end if;
    anchor := 'delete from ' || env || '.profiles where user_id = viewer;';
    if strpos(def, anchor) = 0 then
      raise exception 'delete_my_account changed: % not found', anchor; end if;
    execute replace(def, anchor, format(
      'delete from %1$s.quest_reads where user_id = viewer; '
      'update %2$s.quests set created_by = null where created_by = viewer; %3$s',
      case env when 'public' then 'private' else 'pre_private' end, env, anchor));
  end loop;
end;
$deletion$;

-- Realtime follows the secret-free signal in both environments.
do $$
declare env text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach env in array array['public', 'pre'] loop
    if to_regclass(format('%I.quest_signals', env)) is not null and not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime'
          and schemaname = env and tablename = 'quest_signals') then
      execute format('alter publication supabase_realtime add table %I.quest_signals', env);
    end if;
  end loop;
end;
$$;
