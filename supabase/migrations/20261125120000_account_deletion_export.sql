-- RYT-115 (backend): account data export and self-service account deletion; closes audit M-3.
-- Additive at apply time: no row or stored object is removed or rewritten by this file. It adds
-- functions, one idempotency table and a trigger, makes eight user reference columns nullable and
-- recreates the 15 NO ACTION foreign keys to auth.users with an explicit delete action.
--
-- 1. Foreign keys to auth.users (catalog after 20261124120000: 22 in public, 1 in private):
--      column                                   before      after
--      campaigns.owner_id                       no action   set null (nullable; RPC hands over)
--      campaign_members.user_id                 no action   cascade (trigger releases characters)
--      campaign_invitations.created_by          no action   set null (nullable)
--      campaign_invitations.responded_by        no action   set null
--      character_events.actor_id                no action   set null
--      inventory_events.actor_id                no action   set null
--      shop_orders.actor_id / closed_by         no action   set null
--      trades.created_by / closed_by            no action   set null
--      encounters.created_by                    no action   set null
--      encounter_effects.created_by             no action   set null
--      item_definitions.created_by              no action   set null
--      item_proposals.proposed_by               no action   set null (nullable)
--      item_proposals.resolved_by               no action   set null
--    Already explicit and unchanged: profiles.user_id and private.content_editors.user_id
--    (cascade); content_packs.owner_id, content_entries.updated_by, encounter_events.actor_id,
--    glossary_entries.created_by / updated_by, tabletop_scenes.created_by (set null).
--    User references without a foreign key, handled by delete_my_account only:
--    rest_requests.requested_by / resolved_by and private.rest_votes.voted_by (made nullable,
--    set null), the actor_id of the seven private.*_requests idempotency tables (rows deleted) and
--    the user_id kept inside character_events snapshots of characters rows (set to JSON null).
--    characters (campaign_id, user_id) -> campaign_members stays NO ACTION: the new BEFORE DELETE
--    trigger private.release_member_characters applies the leave rule first (the character goes
--    back to the DM pool, archived ones stay archived), so deleting an Auth user directly (for
--    example from the dashboard) no longer fails on foreign keys.
-- 2. public.export_my_data() returns one jsonb with the caller's profile, memberships, the
--    characters they play in campaigns where they are an active member (sheet, vitals,
--    resources), their inventory (items through private.shop_item_json: never the DM-only
--    value_gp), invitations to their verified email, and the orders, trades, proposals, rest
--    requests, audit and combat events, item definitions, glossary entries and content packs they
--    authored. Audit rows are metadata only (no before/after snapshots), combat events only
--    visible ones unless the caller is the campaign DM, DM notes are never included, campaign names
--    only for active memberships and pending invitations. Every section is capped at 500 rows;
--    the payload says so in limits.rows_per_section and lists capped sections in truncated.
-- 3. public.account_deletion_blockers() lists the campaigns where the caller is the only active
--    DM while other active members remain. public.account_storage_paths() lists the Storage
--    objects (five app buckets, at most 5000) of the campaigns that deletion will delete: those
--    where the caller is an active DM and the only active member. Only paths of the active
--    environment ({env}/{campaign}/...) are returned. Storage objects cannot be deleted from SQL:
--    the browser removes them first. Portraits of characters in surviving campaigns stay with the
--    character, which stays in the campaign.
-- 4. public.delete_my_account(confirmation, request_id): confirmation must be 'DELETE'.
--    Refused with 'Account deletion blocked' while account_deletion_blockers() is not empty.
--    Then, in one transaction (campaign rows locked in id order, as every membership change does):
--    campaigns where the caller is the only active member and a DM are deleted with their data;
--    in every other campaign the membership row is deleted, the caller's characters return to the
--    pool (archived ones stay archived, as change_campaign_member does on leave) and ownership
--    passes to the longest-standing other active DM; invitations to the caller's verified email,
--    the profile, content editor grant and idempotency rows are deleted; every authored or acted
--    row elsewhere stays, with its user reference set to null. Writes made by the function run
--    with the request's JWT subject cleared, as system writes: the absence rules let the system
--    unassign absent characters and the audit trigger records those changes without an actor.
--    Idempotent: a replay with the same request id by the same caller returns the stored result
--    (the request table keeps an md5 digest of the user id, not the id itself); a request id of
--    another caller raises 'Request mismatch'. Calling again with a new request id after a
--    deletion finds nothing left and changes nothing.
--    Auth user (production only): the function deletes the auth.users row when it may. On hosted
--    Supabase the function owner (postgres) normally can; it is not verified by this file. When the
--    delete fails on privileges or on a foreign key (for example a retained PRE backup schema,
--    whose foreign keys still use NO ACTION), the application data is deleted anyway, the Auth
--    user is banned and their sessions removed when those columns and tables are present
--    ('disabled'), otherwise left as is ('kept'). The result reports auth_user as deleted,
--    disabled, kept or, in PRE, shared: the PRE function never touches the shared Auth user.
--    Deleting the Auth user removes the remaining Auth identities through Supabase's own keys;
--    an Edge Function with the server secret remains the follow-up for 'kept'.
--
-- Actor matrix (new objects):
--   anon: no execute on any function here (permission denied).
--   outsider / Player / DM of another campaign: each function only reads or changes rows tied to
--          auth.uid(); no argument names another user, campaign or character. Exports contain no
--          other user's private rows; a Player's export carries no DM-only field.
--   own DM: blocked while sole DM of a campaign with other active members; otherwise leaves or
--          deletes campaigns as above.
-- Every function is security definer with search_path '' and execute for authenticated only.
-- private.account_deletion_requests has RLS on and no client grants.
--
-- Environments: production runs the DDL on public / private. A PRE that has the RYT-078
-- profiles, the content library and the RYT-080 rest tables receives the same DDL through
-- pre_admin.remap, so pre.delete_my_account only touches pre / pre_private, lists pre/ Storage
-- paths and leaves the shared Auth user alone. PRE foreign keys get the same delete actions, so
-- a production Auth deletion also nulls or removes that user's rows in the current PRE copy.
-- Production deletion does not purge retained PRE backups or other copies (RYT-116).

do $m$
declare ddl text := $ddl$
-- ---------------------------------------------------------------------------------------------
-- Foreign keys to auth.users: explicit delete actions. Constraint names can differ in a PRE
-- cloned by the ETL, so existing keys are found by column.
-- ---------------------------------------------------------------------------------------------
do $fk$
declare spec record; con record;
begin
  for spec in select * from (values
      ('public.campaigns', 'campaigns', 'owner_id', 'set null'),
      ('public.campaign_members', 'campaign_members', 'user_id', 'cascade'),
      ('public.campaign_invitations', 'campaign_invitations', 'created_by', 'set null'),
      ('public.campaign_invitations', 'campaign_invitations', 'responded_by', 'set null'),
      ('public.character_events', 'character_events', 'actor_id', 'set null'),
      ('public.inventory_events', 'inventory_events', 'actor_id', 'set null'),
      ('public.shop_orders', 'shop_orders', 'actor_id', 'set null'),
      ('public.shop_orders', 'shop_orders', 'closed_by', 'set null'),
      ('public.trades', 'trades', 'created_by', 'set null'),
      ('public.trades', 'trades', 'closed_by', 'set null'),
      ('public.encounters', 'encounters', 'created_by', 'set null'),
      ('public.encounter_effects', 'encounter_effects', 'created_by', 'set null'),
      ('public.item_definitions', 'item_definitions', 'created_by', 'set null'),
      ('public.item_proposals', 'item_proposals', 'proposed_by', 'set null'),
      ('public.item_proposals', 'item_proposals', 'resolved_by', 'set null')
    ) v(tbl, short_name, col, action) loop
    for con in select c.conname from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attname = spec.col
        where c.conrelid = spec.tbl::regclass and c.contype = 'f'
          and c.confrelid = 'auth.users'::regclass and c.conkey = array[a.attnum] loop
      execute format('alter table %s drop constraint %I', spec.tbl, con.conname);
    end loop;
    if spec.action = 'set null' then
      execute format('alter table %s alter column %I drop not null', spec.tbl, spec.col);
    end if;
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete %s',
      spec.tbl, spec.short_name || '_' || spec.col || '_fkey', spec.col, spec.action);
  end loop;
end;
$fk$;

alter table public.rest_requests alter column requested_by drop not null;
alter table private.rest_votes alter column voted_by drop not null;
comment on column public.campaigns.owner_id is
  'Creator attribution and owner quota only; grants no privileges. Passes to another active DM when the owner deletes their account; null after a direct Auth deletion.';

-- Deleting a membership row applies the leave rule of change_campaign_member to the member's
-- characters. Skipped while the campaign itself is being deleted.
create or replace function private.release_member_characters() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if exists (select 1 from public.campaigns c where c.id = old.campaign_id) then
    update public.characters set user_id = null, is_active = (archived_at is null and not absent)
      where campaign_id = old.campaign_id and user_id = old.user_id;
  end if;
  return old;
end;
$fn$;
revoke all on function private.release_member_characters() from public, anon, authenticated;
drop trigger if exists members_release_characters on public.campaign_members;
create trigger members_release_characters before delete on public.campaign_members
  for each row execute function private.release_member_characters();

create table if not exists private.account_deletion_requests (
  request_id uuid primary key,
  actor_digest text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
comment on table private.account_deletion_requests is
  'RYT-115: replay results of delete_my_account. actor_digest is md5 of the user id, never the id.';
revoke all on private.account_deletion_requests from public, anon, authenticated;
alter table private.account_deletion_requests enable row level security;

-- Campaigns the account deletion would delete: the user is an active DM and the only active member.
create or replace function private.account_solo_campaigns(target_user uuid) returns setof uuid
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return query select m.campaign_id from public.campaign_members m
    where m.user_id = target_user and m.active and m.role = 'dm'
      and not exists (select 1 from public.campaign_members o where o.campaign_id = m.campaign_id
        and o.active and o.user_id <> target_user)
    order by m.campaign_id;
end;
$fn$;

create or replace function private.account_blockers(target_user uuid)
returns table(campaign_id uuid, campaign_name text, other_members integer)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return query select c.id, c.name, (select count(*)::integer from public.campaign_members o
      where o.campaign_id = c.id and o.active and o.user_id <> target_user)
    from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
    where m.user_id = target_user and m.active and m.role = 'dm'
      and not exists (select 1 from public.campaign_members d where d.campaign_id = m.campaign_id
        and d.active and d.role = 'dm' and d.user_id <> target_user)
      and exists (select 1 from public.campaign_members o where o.campaign_id = m.campaign_id
        and o.active and o.user_id <> target_user)
    order by c.name, c.id;
end;
$fn$;
revoke all on function private.account_solo_campaigns(uuid), private.account_blockers(uuid)
  from public, anon, authenticated;

create or replace function public.account_deletion_blockers()
returns table(campaign_id uuid, campaign_name text, other_members integer)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  return query select b.campaign_id, b.campaign_name, b.other_members
    from private.account_blockers(auth.uid()) b;
end;
$fn$;

-- The environment is read from this function's own schema reference ('public.' becomes 'pre.'
-- under pre_admin.remap and the ETL), so PRE lists only pre/ paths.
create or replace function public.account_storage_paths()
returns table(bucket_id text, object_path text, campaign_id uuid)
language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); env constant text := split_part('public.campaigns', '.', 1);
  solo uuid[];
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  solo := array(select private.account_solo_campaigns(viewer));
  if cardinality(solo) = 0 or to_regclass('storage.objects') is null then return; end if;
  return query execute
    'select o.bucket_id::text, o.name::text, split_part(o.name, ''/'', 2)::uuid
       from storage.objects o
      where o.bucket_id in (''character-portraits'', ''item-images'', ''creature-images'', ''tabletop-media'', ''shop-images'')
        and split_part(o.name, ''/'', 1) = $1
        and split_part(o.name, ''/'', 2) = any($2)
      order by 1, 2 limit 5000'
    using env, array(select s::text from unnest(solo) s);
end;
$fn$;

create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); env constant text := split_part('public.campaigns', '.', 1);
  cap constant integer := 500; my_email text := private.verified_email();
  sections jsonb; section_name text; truncated text[] := '{}';
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  sections := jsonb_build_object(
    'memberships', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select m.joined_at k, m.campaign_id id, jsonb_build_object('campaign_id', m.campaign_id,
          'campaign_name', case when m.active then c.name end, 'role', m.role, 'active', m.active,
          'joined_at', m.joined_at, 'is_owner', c.owner_id = viewer) j
        from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
        where m.user_id = viewer order by m.joined_at, m.campaign_id limit cap + 1) x), '[]'::jsonb),
    'characters', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select ch.created_at k, ch.id, jsonb_build_object('id', ch.id, 'campaign_id', ch.campaign_id,
          'name', ch.name, 'created_at', ch.created_at, 'is_active', ch.is_active,
          'archived_at', ch.archived_at, 'absent', ch.absent, 'shares_live', ch.shares_live,
          'sheet', (select jsonb_build_object('status', s.status, 'level', s.level, 'max_hp', s.max_hp,
              'armor_class', s.armor_class, 'build', s.build, 'portrait_path', s.portrait_path,
              'updated_at', s.updated_at)
            from public.character_sheets s where s.campaign_id = ch.campaign_id and s.character_id = ch.id),
          'vitals', (select jsonb_build_object('current_hp', v.current_hp, 'temp_hp', v.temp_hp,
              'hit_dice_spent', v.hit_dice_spent, 'death_successes', v.death_successes,
              'death_failures', v.death_failures, 'heroic_inspiration', v.heroic_inspiration,
              'conditions', v.conditions, 'slots_used', v.slots_used, 'tracker_uses', v.tracker_uses)
            from public.character_vitals v where v.campaign_id = ch.campaign_id and v.character_id = ch.id),
          'resources', (select jsonb_build_object('gold', r.gold, 'water_units', r.water_units,
              'rations', r.rations, 'exhaustion', r.exhaustion)
            from public.character_resources r where r.campaign_id = ch.campaign_id and r.character_id = ch.id)) j
        from public.characters ch
        where ch.user_id = viewer and exists (select 1 from public.campaign_members m
          where m.campaign_id = ch.campaign_id and m.user_id = viewer and m.active)
        order by ch.created_at, ch.id limit cap + 1) x), '[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select i.created_at k, i.id, jsonb_build_object('id', i.id, 'campaign_id', i.campaign_id,
          'character_id', i.character_id, 'quantity', i.quantity, 'equipped_slot', i.equipped_slot,
          'source', i.source, 'notes', i.notes, 'created_at', i.created_at,
          'item', private.shop_item_json(i.definition_id)) j
        from public.inventory_items i join public.characters ch
          on ch.campaign_id = i.campaign_id and ch.id = i.character_id
        where ch.user_id = viewer and exists (select 1 from public.campaign_members m
          where m.campaign_id = ch.campaign_id and m.user_id = viewer and m.active)
        order by i.created_at, i.id limit cap + 1) x), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select i.created_at k, i.id, jsonb_build_object('id', i.id, 'campaign_id', i.campaign_id,
          'campaign_name', case when i.status = 'pending' and i.expires_at > now() then c.name end,
          'status', i.status, 'created_at', i.created_at, 'expires_at', i.expires_at,
          'responded_at', i.responded_at) j
        from public.campaign_invitations i join public.campaigns c on c.id = i.campaign_id
        where my_email is not null and i.email = my_email
        order by i.created_at, i.id limit cap + 1) x), '[]'::jsonb),
    'shop_orders', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select o.created_at k, o.id, jsonb_build_object('id', o.id, 'campaign_id', o.campaign_id,
          'shop_id', o.shop_id, 'character_id', o.character_id, 'kind', o.kind, 'status', o.status,
          'total', o.total, 'refunded', o.refunded, 'player_note', o.player_note,
          'created_at', o.created_at, 'closed_at', o.closed_at,
          'lines', (select coalesce(jsonb_agg(jsonb_build_object('item_name', d.name,
              'quantity', ln.quantity, 'final_price', ln.final_price) order by ln.id), '[]'::jsonb)
            from public.shop_order_lines ln join public.item_definitions d
              on d.campaign_id = ln.campaign_id and d.id = ln.definition_id
            where ln.campaign_id = o.campaign_id and ln.order_id = o.id)) j
        from public.shop_orders o where o.actor_id = viewer
        order by o.created_at, o.id limit cap + 1) x), '[]'::jsonb),
    'trades', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select t.created_at k, t.id, jsonb_build_object('id', t.id, 'campaign_id', t.campaign_id,
          'initiator_character', t.initiator_character, 'partner_character', t.partner_character,
          'status', t.status, 'created_at', t.created_at, 'completed_at', t.completed_at) j
        from public.trades t where t.created_by = viewer
        order by t.created_at, t.id limit cap + 1) x), '[]'::jsonb),
    'item_proposals', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select p.created_at k, p.id, jsonb_build_object('id', p.id, 'campaign_id', p.campaign_id,
          'character_id', p.character_id, 'draft', p.draft, 'quantity', p.quantity,
          'status', p.status, 'created_at', p.created_at, 'resolved_at', p.resolved_at) j
        from public.item_proposals p where p.proposed_by = viewer
        order by p.created_at, p.id limit cap + 1) x), '[]'::jsonb),
    'rest_requests', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select r.created_at k, r.id, jsonb_build_object('id', r.id, 'campaign_id', r.campaign_id,
          'kind', r.kind, 'status', r.status, 'created_at', r.created_at) j
        from public.rest_requests r where r.requested_by = viewer
        order by r.created_at, r.id limit cap + 1) x), '[]'::jsonb),
    'character_events', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select e.created_at k, e.id, jsonb_build_object('id', e.id, 'campaign_id', e.campaign_id,
          'character_id', e.character_id, 'kind', e.kind, 'created_at', e.created_at) j
        from public.character_events e where e.actor_id = viewer
        order by e.created_at, e.id limit cap + 1) x), '[]'::jsonb),
    'inventory_events', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select e.created_at k, e.id, jsonb_build_object('id', e.id, 'campaign_id', e.campaign_id,
          'character_id', e.character_id, 'item_id', e.item_id, 'kind', e.kind,
          'quantity_delta', e.quantity_delta, 'created_at', e.created_at) j
        from public.inventory_events e where e.actor_id = viewer
        order by e.created_at, e.id limit cap + 1) x), '[]'::jsonb),
    'combat_events', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select e.created_at k, e.id, jsonb_build_object('id', e.id, 'campaign_id', e.campaign_id,
          'encounter_id', e.encounter_id, 'round', e.round, 'kind', e.kind, 'created_at', e.created_at) j
        from public.encounter_events e where e.actor_id = viewer
          and (e.visible or exists (select 1 from public.campaign_members m
            where m.campaign_id = e.campaign_id and m.user_id = viewer and m.active and m.role = 'dm'))
        order by e.created_at, e.id limit cap + 1) x), '[]'::jsonb),
    'item_definitions', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select d.created_at k, d.id, jsonb_build_object('id', d.id, 'campaign_id', d.campaign_id,
          'name', d.name, 'origin', d.origin, 'created_at', d.created_at) j
        from public.item_definitions d where d.created_by = viewer
          and exists (select 1 from public.campaign_members m
            where m.campaign_id = d.campaign_id and m.user_id = viewer and m.active)
        order by d.created_at, d.id limit cap + 1) x), '[]'::jsonb),
    'glossary_entries', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select g.created_at k, g.id, jsonb_build_object('id', g.id, 'campaign_id', g.campaign_id,
          'category', g.category, 'name', g.name, 'created_at', g.created_at) j
        from public.glossary_entries g where g.created_by = viewer
          and exists (select 1 from public.campaign_members m
            where m.campaign_id = g.campaign_id and m.user_id = viewer and m.active and m.role = 'dm')
        order by g.created_at, g.id limit cap + 1) x), '[]'::jsonb),
    'content_packs', coalesce((select jsonb_agg(x.j order by x.k, x.id) from (
        select p.created_at k, p.id, jsonb_build_object('id', p.id, 'slug', p.slug,
          'title_en', p.title_en, 'title_es', p.title_es, 'visibility', p.visibility,
          'version', p.version, 'created_at', p.created_at) j
        from public.content_packs p where p.owner_id = viewer
        order by p.created_at, p.id limit cap + 1) x), '[]'::jsonb));
  for section_name in select jsonb_object_keys(sections) loop
    if jsonb_array_length(sections -> section_name) > cap then
      sections := jsonb_set(sections, array[section_name], (sections -> section_name) - cap);
      truncated := truncated || section_name;
    end if;
  end loop;
  return jsonb_build_object('format', 'rytta-account-export', 'version', 1, 'environment', env,
    'generated_at', now(), 'limits', jsonb_build_object('rows_per_section', cap),
    'truncated', to_jsonb(array(select t from unnest(truncated) t order by t)),
    'profile', (select jsonb_build_object('user_id', u.id, 'email', u.email,
        'name', nullif(left(u.raw_user_meta_data ->> 'full_name', 100), ''),
        'username', (select p.username from public.profiles p where p.user_id = viewer))
      from auth.users u where u.id = viewer)) || sections;
end;
$fn$;

create or replace function public.delete_my_account(confirmation text, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); env constant text := split_part('public.campaigns', '.', 1);
  digest text; prior private.account_deletion_requests; my_email text := private.verified_email();
  solo uuid[]; kept uuid[]; owned record; auth_state text := 'shared'; result jsonb;
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  if confirmation is distinct from 'DELETE' then
    raise exception 'Confirmation required' using errcode = '22023'; end if;
  digest := md5(viewer::text);
  perform pg_advisory_xact_lock(hashtextextended('delete_my_account:' || viewer::text, 115));
  select * into prior from private.account_deletion_requests r
    where r.request_id = delete_my_account.request_id;
  if prior.request_id is not null then
    if prior.actor_digest <> digest then raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result;
  end if;

  perform 1 from public.campaigns c where c.id in (select m.campaign_id from public.campaign_members m
    where m.user_id = viewer) or c.owner_id = viewer order by c.id for update;
  if exists (select 1 from private.account_blockers(viewer)) then
    raise exception 'Account deletion blocked' using errcode = 'P0001',
      hint = 'Hand over or remove the members of the campaigns listed by account_deletion_blockers.';
  end if;
  solo := array(select private.account_solo_campaigns(viewer));

  -- From here on the writes are system writes (no JWT subject) for triggers and audit rows.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  -- Campaigns where the caller is alone: delete with their data. Rows whose foreign keys do not
  -- cascade from the campaign go first.
  if cardinality(solo) > 0 then
    delete from public.character_events where campaign_id = any(solo);
    delete from public.inventory_events where campaign_id = any(solo);
    delete from private.resource_requests r using public.characters ch
      where ch.id = r.character_id and ch.campaign_id = any(solo);
    delete from public.campaign_invitations where campaign_id = any(solo);
    delete from public.shop_orders where campaign_id = any(solo);
    delete from public.item_proposals where campaign_id = any(solo);
    delete from public.inventory_items where campaign_id = any(solo);
    delete from public.shops where campaign_id = any(solo);
    delete from public.campaigns where id = any(solo);
  end if;

  -- Other campaigns: hand over ownership, return characters to the pool, remove the membership.
  kept := array(select m.campaign_id from public.campaign_members m where m.user_id = viewer
    order by m.campaign_id);
  for owned in select c.id from public.campaigns c where c.owner_id = viewer loop
    update public.campaigns set owner_id = (select m.user_id from public.campaign_members m
        where m.campaign_id = owned.id and m.active and m.role = 'dm' and m.user_id <> viewer
        order by m.joined_at, m.user_id limit 1)
      where id = owned.id;
  end loop;
  update public.characters set user_id = null, is_active = (archived_at is null and not absent)
    where user_id = viewer;
  if my_email is not null then
    delete from public.campaign_invitations where campaign_invitations.email = my_email;
  end if;
  update public.campaign_invitations set created_by = null where created_by = viewer;
  update public.campaign_invitations set responded_by = null where responded_by = viewer;
  delete from public.campaign_members where user_id = viewer;

  -- Authored and acted rows stay, without the user reference.
  update public.character_events set actor_id = null where actor_id = viewer;
  update public.character_events set
      before_value = case when before_value ->> 'user_id' = viewer::text
        then jsonb_set(before_value, '{user_id}', 'null'::jsonb) else before_value end,
      after_value = case when after_value ->> 'user_id' = viewer::text
        then jsonb_set(after_value, '{user_id}', 'null'::jsonb) else after_value end
    where kind like 'characters:%'
      and (before_value ->> 'user_id' = viewer::text or after_value ->> 'user_id' = viewer::text);
  update public.inventory_events set actor_id = null where actor_id = viewer;
  update public.shop_orders set actor_id = null where actor_id = viewer;
  update public.shop_orders set closed_by = null where closed_by = viewer;
  update public.trades set created_by = null where created_by = viewer;
  update public.trades set closed_by = null where closed_by = viewer;
  update public.encounters set created_by = null where created_by = viewer;
  update public.encounter_effects set created_by = null where created_by = viewer;
  update public.encounter_events set actor_id = null where actor_id = viewer;
  update public.item_definitions set created_by = null where created_by = viewer;
  update public.item_proposals set proposed_by = null where proposed_by = viewer;
  update public.item_proposals set resolved_by = null where resolved_by = viewer;
  update public.glossary_entries set created_by = null where created_by = viewer;
  update public.glossary_entries set updated_by = null where updated_by = viewer;
  update public.tabletop_scenes set created_by = null where created_by = viewer;
  update public.content_packs set owner_id = null where owner_id = viewer;
  update public.content_entries set updated_by = null where updated_by = viewer;
  update public.rest_requests set requested_by = null where requested_by = viewer;
  update public.rest_requests set resolved_by = null where resolved_by = viewer;
  update private.rest_votes set voted_by = null where voted_by = viewer;

  -- Personal rows.
  delete from private.character_requests where actor_id = viewer;
  delete from private.combat_requests where actor_id = viewer;
  delete from private.content_requests where actor_id = viewer;
  delete from private.inventory_requests where actor_id = viewer;
  delete from private.resource_requests where actor_id = viewer;
  delete from private.sheet_requests where actor_id = viewer;
  delete from private.tabletop_requests where actor_id = viewer;
  delete from private.content_editors where user_id = viewer;
  delete from public.profiles where user_id = viewer;

  -- The Auth user is shared by both environments: only production removes it.
  if env = 'public' and to_regclass('auth.users') is not null then
    begin
      delete from auth.users where id = viewer;
      auth_state := case when found then 'deleted' else 'absent' end;
    exception when foreign_key_violation or insufficient_privilege or restrict_violation then
      auth_state := 'kept';
      begin
        if exists (select 1 from pg_attribute a where a.attrelid = to_regclass('auth.users')
            and a.attname = 'banned_until' and a.attnum > 0 and not a.attisdropped) then
          execute 'update auth.users set banned_until = now() + interval ''100 years'' where id = $1'
            using viewer;
          auth_state := 'disabled';
        end if;
        if to_regclass('auth.sessions') is not null then
          execute 'delete from auth.sessions where user_id = $1' using viewer;
        end if;
      exception when insufficient_privilege then null;
      end;
    end;
  end if;

  result := jsonb_build_object('deleted', true, 'environment', env, 'auth_user', auth_state,
    'campaigns_deleted', to_jsonb(solo), 'campaigns_left', to_jsonb(kept));
  insert into private.account_deletion_requests(request_id, actor_digest, result)
    values (delete_my_account.request_id, digest, result);
  return result;
end;
$fn$;

comment on function public.export_my_data() is
  'RYT-115: the caller''s own data as one jsonb; 500 rows per section, capped sections listed in truncated.';
comment on function public.account_deletion_blockers() is
  'RYT-115: campaigns where the caller is the only active DM while other active members remain.';
comment on function public.account_storage_paths() is
  'RYT-115: Storage objects of the campaigns delete_my_account will delete, active environment only.';
comment on function public.delete_my_account(text, uuid) is
  'RYT-115: deletes the caller''s account data (confirmation ''DELETE'', idempotent request id); production also removes the Auth user when permitted.';

revoke all on function public.export_my_data(), public.account_deletion_blockers(),
  public.account_storage_paths(), public.delete_my_account(text, uuid) from public, anon;
grant execute on function public.export_my_data(), public.account_deletion_blockers(),
  public.account_storage_paths(), public.delete_my_account(text, uuid) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.profiles') is not null and to_regclass('pre.rest_requests') is not null
      and to_regclass('pre.content_packs') is not null and to_regclass('pre.item_proposals') is not null
      and to_regclass('pre_private.tabletop_requests') is not null
      and to_regclass('pre_private.content_requests') is not null
      and to_regprocedure('pre_private.shop_item_json(uuid)') is not null
      and to_regprocedure('pre_private.verified_email()') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$m$;
