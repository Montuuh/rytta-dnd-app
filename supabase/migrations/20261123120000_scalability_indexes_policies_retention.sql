-- RYT-114: scalability. Indexes, cheaper read policies and retention. Additive at apply time: no
-- row is removed or rewritten by this file; only private.prune_stale_rows() deletes, when run.
--
-- 1. Indexes. One index per foreign key that had no index whose leading columns are exactly the
--    key (64 keys, composite campaign keys included), plus characters(user_id) for the policy
--    helpers below and created_at on every idempotency table for pruning. Plain CREATE INDEX
--    inside the migration transaction: the hosted tables are small today. On large tables use
--    CREATE INDEX CONCURRENTLY outside a transaction instead.
-- 2. Read policies. The SELECT policies called private.is_campaign_member / is_campaign_dm /
--    can_play_character / can_use_glossary once per candidate row (security definer functions
--    are never inlined). They now compare the row with a set computed once per statement:
--      private.my_campaign_ids()          active memberships of auth.uid()
--      private.my_dm_campaign_ids()       active memberships with role dm
--      private.my_character_keys()        (campaign_id, character_id) of the caller's characters
--                                         in campaigns where the caller is an active member
--      private.my_carried_definitions()   (campaign_id, definition_id) carried by those characters
--      private.my_module_campaign_ids(m) campaigns where the caller is DM, or a member with module m
--                                         enabled for Players
--    `x in (select f())` is an uncorrelated subquery: PostgreSQL runs it once and hashes it.
--    Every rewrite is the same boolean as before, term by term:
--      is_campaign_dm(c)            = c in my_dm_campaign_ids()
--      is_campaign_member(c)        = c in my_campaign_ids()
--      can_play_character(c, ch)    = c in my_dm_campaign_ids() or (c, ch) in my_character_keys()
--      can_use_glossary(c)          = c in my_module_campaign_ids('glossary')
--      verified_email() per row     = (select verified_email()) once
--    definitions_read keeps its structure; the correlated exists over inventory_items/characters
--    becomes (campaign_id, id) in my_carried_definitions(). Under that branch the caller is an
--    active member and owns the character, so the RLS that applied to the old subquery
--    (items_read, characters_read) admitted exactly those rows; the helper reproduces them.
--    The old helpers stay for RPC bodies and write policies (single-row checks, not hot).
--    Write policies (campaigns_update, characters_*, resources_*) and resources_read (one
--    primary-key probe into characters, whose policy is now cheap) are unchanged.
-- 3. Retention. created_at (default now()) is added to the five idempotency tables without it;
--    existing rows take the apply time, so nothing becomes prunable for 30 days.
--    private.prune_stale_rows() (security definer, search_path '', no execute for public, anon,
--    authenticated or service_role) deletes idempotency rows older than 30 days and, for
--    encounters that ended more than 30 days ago, clears before_state/after_state and keeps only
--    the newest 60 events plus the newest 60 visible events (exactly what get_combat_state
--    returns to the DM and to Players). Ended is terminal: undo requires a live encounter and the
--    summary was frozen at the end. character_events (claim/audit reads), inventory_events (undo
--    has no age limit), shop orders, trades, rest requests, proposals and invitations are kept.
--    Scheduled daily through pg_cron only when the extension is installed; otherwise the owner
--    runs `select private.prune_stale_rows()` (and the pre_private copy) on their own schedule.
--
-- Actor matrix (rewritten policies): unchanged by construction. anon: no grants, permission
-- denied as before. Outsider and DM of another campaign: no rows of the campaign. Player: own
-- membership, own characters and their sheets, vitals, items, events, trades and carried or
-- authored definitions; signals of non-draft encounters; rest requests and tabletop_live; glossary
-- when the module is enabled. Campaign DM: every row of the campaign. The new set helpers are
-- granted to authenticated only (policies run as the caller), like the existing helpers.
--
-- Environments: production runs the DDL on public / private. A PRE that already has the RYT-113
-- objects (pre.encounter_signals) and lacks these helpers receives the same DDL through
-- pre_admin.remap, so PRE gets its own pre_private.prune_stale_rows(). The cron job is global and
-- stays outside the remapped DDL; it prunes PRE only when the PRE function exists.

do $m$
declare ddl text := $ddl$
-- ---------------------------------------------------------------------------------------------
-- Foreign key indexes
-- ---------------------------------------------------------------------------------------------
create index if not exists character_resources_character_id_fk on public.character_resources(campaign_id, character_id);
create index if not exists campaign_invitations_campaign_id_fk on public.campaign_invitations(campaign_id);
create index if not exists campaign_invitations_created_by_fk on public.campaign_invitations(created_by);
create index if not exists campaign_invitations_responded_by_fk on public.campaign_invitations(responded_by);
create index if not exists campaign_invitations_character_id_fk on public.campaign_invitations(campaign_id, character_id);
create index if not exists character_events_actor_id_fk on public.character_events(actor_id);
create index if not exists resource_requests_character_id_fk on private.resource_requests(character_id);
create index if not exists character_sheets_character_id_fk on public.character_sheets(campaign_id, character_id);
create index if not exists character_vitals_character_id_fk on public.character_vitals(campaign_id, character_id);
create index if not exists sheet_requests_character_id_fk on private.sheet_requests(character_id);
create index if not exists item_definitions_created_by_fk on public.item_definitions(created_by);
create index if not exists inventory_items_definition_id_fk on public.inventory_items(campaign_id, definition_id);
create index if not exists inventory_events_actor_id_fk on public.inventory_events(actor_id);
create index if not exists inventory_events_item_id_fk on public.inventory_events(campaign_id, item_id);
create index if not exists inventory_events_undone_by_fk on public.inventory_events(undone_by);
create index if not exists shop_access_character_id_fk on public.shop_access(campaign_id, character_id);
create index if not exists shop_access_shop_id_fk on public.shop_access(campaign_id, shop_id);
create index if not exists shop_listings_definition_id_fk on public.shop_listings(campaign_id, definition_id);
create index if not exists shop_listings_shop_id_fk on public.shop_listings(campaign_id, shop_id);
create index if not exists listing_access_character_id_fk on public.listing_access(campaign_id, character_id);
create index if not exists listing_access_listing_id_fk on public.listing_access(campaign_id, listing_id);
create index if not exists shop_modifiers_character_id_fk on public.shop_modifiers(campaign_id, character_id);
create index if not exists shop_modifiers_shop_id_fk on public.shop_modifiers(campaign_id, shop_id);
create index if not exists shop_orders_actor_id_fk on public.shop_orders(actor_id);
create index if not exists shop_orders_shop_id_fk on public.shop_orders(campaign_id, shop_id);
create index if not exists shop_orders_closed_by_fk on public.shop_orders(closed_by);
create index if not exists shop_order_lines_definition_id_fk on public.shop_order_lines(campaign_id, definition_id);
create index if not exists shop_order_lines_order_id_fk on public.shop_order_lines(campaign_id, order_id);
create index if not exists shop_order_lines_listing_id_fk on public.shop_order_lines(listing_id);
create index if not exists trades_initiator_character_fk on public.trades(campaign_id, initiator_character);
create index if not exists trades_partner_character_fk on public.trades(campaign_id, partner_character);
create index if not exists trades_closed_by_fk on public.trades(closed_by);
create index if not exists trades_created_by_fk on public.trades(created_by);
create index if not exists trade_offer_items_item_id_fk on public.trade_offer_items(campaign_id, item_id);
create index if not exists trade_offer_items_trade_id_fk on public.trade_offer_items(campaign_id, trade_id);
create index if not exists glossary_entries_created_by_fk on public.glossary_entries(created_by);
create index if not exists glossary_entries_updated_by_fk on public.glossary_entries(updated_by);
create index if not exists encounters_created_by_fk on public.encounters(created_by);
create index if not exists encounter_combatants_character_id_fk on public.encounter_combatants(campaign_id, character_id);
create index if not exists encounter_combatants_encounter_id_fk on public.encounter_combatants(campaign_id, encounter_id);
create index if not exists encounter_combatants_template_id_fk on public.encounter_combatants(campaign_id, template_id);
create index if not exists encounter_effects_encounter_id_fk on public.encounter_effects(campaign_id, encounter_id);
create index if not exists encounter_effects_target_combatant_fk on public.encounter_effects(campaign_id, target_combatant);
create index if not exists encounter_effects_created_by_fk on public.encounter_effects(created_by);
create index if not exists encounter_effects_source_combatant_fk on public.encounter_effects(source_combatant);
create index if not exists encounter_events_actor_id_fk on public.encounter_events(actor_id);
create index if not exists encounter_events_encounter_id_fk on public.encounter_events(campaign_id, encounter_id);
create index if not exists character_requests_character_id_fk on private.character_requests(character_id);
create index if not exists tabletop_scenes_created_by_fk on public.tabletop_scenes(created_by);
create index if not exists tabletop_items_character_id_fk on public.tabletop_items(campaign_id, character_id);
create index if not exists tabletop_items_combatant_id_fk on public.tabletop_items(campaign_id, combatant_id);
create index if not exists tabletop_items_scene_id_fk on public.tabletop_items(campaign_id, scene_id);
create index if not exists tabletop_live_card_id_fk on public.tabletop_live(campaign_id, card_id);
create index if not exists tabletop_live_scene_id_fk on public.tabletop_live(campaign_id, scene_id);
create index if not exists tabletop_live_track_id_fk on public.tabletop_live(campaign_id, track_id);
create index if not exists rest_requests_requester_character_fk on public.rest_requests(requester_character);
create index if not exists rest_votes_character_id_fk on private.rest_votes(character_id);
create index if not exists content_packs_owner_id_fk on public.content_packs(owner_id);
create index if not exists content_entries_updated_by_fk on public.content_entries(updated_by);
create index if not exists item_proposals_character_id_fk on public.item_proposals(campaign_id, character_id);
create index if not exists item_proposals_resolved_definition_id_fk on public.item_proposals(campaign_id, resolved_definition_id);
create index if not exists item_proposals_proposed_by_fk on public.item_proposals(proposed_by);
create index if not exists item_proposals_resolved_by_fk on public.item_proposals(resolved_by);
create index if not exists encounter_signals_encounter_id_fk on public.encounter_signals(campaign_id, encounter_id);

-- Policy helper lookup: the caller's characters across campaigns.
create index if not exists characters_user_id on public.characters(user_id) where user_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Set helpers for read policies (computed once per statement)
-- ---------------------------------------------------------------------------------------------
create function private.my_campaign_ids() returns setof uuid
language sql stable security definer set search_path = '' as $fn$
  select m.campaign_id from public.campaign_members m
   where m.user_id = (select auth.uid()) and m.active;
$fn$;

create function private.my_dm_campaign_ids() returns setof uuid
language sql stable security definer set search_path = '' as $fn$
  select m.campaign_id from public.campaign_members m
   where m.user_id = (select auth.uid()) and m.active and m.role = 'dm';
$fn$;

create function private.my_character_keys() returns table(campaign_id uuid, character_id uuid)
language sql stable security definer set search_path = '' as $fn$
  select c.campaign_id, c.id from public.characters c
    join public.campaign_members m on m.campaign_id = c.campaign_id and m.user_id = c.user_id and m.active
   where c.user_id = (select auth.uid());
$fn$;

create function private.my_carried_definitions() returns table(campaign_id uuid, definition_id uuid)
language sql stable security definer set search_path = '' as $fn$
  select distinct i.campaign_id, i.definition_id from public.inventory_items i
    join public.characters c on c.campaign_id = i.campaign_id and c.id = i.character_id
   where c.user_id = (select auth.uid());
$fn$;

create function private.my_module_campaign_ids(module_name text) returns setof uuid
language sql stable security definer set search_path = '' as $fn$
  select m.campaign_id from public.campaign_members m
    join public.campaigns c on c.id = m.campaign_id
   where m.user_id = (select auth.uid()) and m.active
     and (m.role = 'dm' or module_name = any(c.player_modules));
$fn$;

revoke all on function private.my_campaign_ids(), private.my_dm_campaign_ids(),
  private.my_character_keys(), private.my_carried_definitions(), private.my_module_campaign_ids(text)
  from public, anon;
grant execute on function private.my_campaign_ids(), private.my_dm_campaign_ids(),
  private.my_character_keys(), private.my_carried_definitions(), private.my_module_campaign_ids(text)
  to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Read policies, same rows as before
-- ---------------------------------------------------------------------------------------------
alter policy campaigns_read on public.campaigns
  using (id in (select private.my_campaign_ids()));
alter policy members_read on public.campaign_members
  using (campaign_id in (select private.my_campaign_ids())
    and (user_id = (select auth.uid()) or campaign_id in (select private.my_dm_campaign_ids())));
alter policy characters_read on public.characters
  using (campaign_id in (select private.my_campaign_ids())
    and (user_id = (select auth.uid()) or campaign_id in (select private.my_dm_campaign_ids())));
alter policy invitations_read on public.campaign_invitations
  using (campaign_id in (select private.my_dm_campaign_ids())
    or (email = (select private.verified_email()) and status = 'pending' and expires_at > now()));

alter policy sheets_read on public.character_sheets
  using (campaign_id in (select private.my_dm_campaign_ids())
    or (campaign_id, character_id) in (select k.campaign_id, k.character_id from private.my_character_keys() k));
alter policy vitals_read on public.character_vitals
  using (campaign_id in (select private.my_dm_campaign_ids())
    or (campaign_id, character_id) in (select k.campaign_id, k.character_id from private.my_character_keys() k));
alter policy items_read on public.inventory_items
  using (campaign_id in (select private.my_dm_campaign_ids())
    or (campaign_id, character_id) in (select k.campaign_id, k.character_id from private.my_character_keys() k));
alter policy inventory_events_read on public.inventory_events
  using (campaign_id in (select private.my_dm_campaign_ids())
    or (campaign_id, character_id) in (select k.campaign_id, k.character_id from private.my_character_keys() k));
alter policy trades_read on public.trades
  using (campaign_id in (select private.my_dm_campaign_ids())
    or (campaign_id, initiator_character) in (select k.campaign_id, k.character_id from private.my_character_keys() k)
    or (campaign_id, partner_character) in (select k.campaign_id, k.character_id from private.my_character_keys() k));
alter policy trade_offers_read on public.trade_offer_items
  using (exists (select 1 from public.trades t
    where t.campaign_id = trade_offer_items.campaign_id and t.id = trade_offer_items.trade_id
      and (t.campaign_id in (select private.my_dm_campaign_ids())
        or (t.campaign_id, t.initiator_character) in (select k.campaign_id, k.character_id from private.my_character_keys() k)
        or (t.campaign_id, t.partner_character) in (select k.campaign_id, k.character_id from private.my_character_keys() k))));

alter policy definitions_read on public.item_definitions
  using (campaign_id in (select private.my_dm_campaign_ids())
    or (campaign_id in (select private.my_campaign_ids())
      and (created_by = (select auth.uid())
        or (campaign_id, id) in (select d.campaign_id, d.definition_id from private.my_carried_definitions() d))));

alter policy glossary_entries_read on public.glossary_entries
  using (campaign_id in (select private.my_module_campaign_ids('glossary')));
alter policy encounter_signals_read on public.encounter_signals
  using (campaign_id in (select private.my_dm_campaign_ids())
    or (status <> 'draft' and campaign_id in (select private.my_campaign_ids())));
alter policy rest_requests_read on public.rest_requests
  using (campaign_id in (select private.my_campaign_ids()));
alter policy tabletop_live_read on public.tabletop_live
  using (campaign_id in (select private.my_campaign_ids()));

alter policy campaign_creature_images_read on public.campaign_creature_images
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy campaign_srd_bestiary_read on public.campaign_srd_bestiary
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy campaign_srd_removed_read on public.campaign_srd_removed
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy events_dm_read on public.character_events
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy combatant_templates_read on public.combatant_templates
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy encounters_read on public.encounters
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy encounter_combatants_read on public.encounter_combatants
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy encounter_effects_read on public.encounter_effects
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy encounter_events_read on public.encounter_events
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy tabletop_scenes_read on public.tabletop_scenes
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy tabletop_items_read on public.tabletop_items
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy tabletop_cards_read on public.tabletop_cards
  using (campaign_id in (select private.my_dm_campaign_ids()));
alter policy tabletop_tracks_read on public.tabletop_tracks
  using (campaign_id in (select private.my_dm_campaign_ids()));

-- ---------------------------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------------------------
alter table private.resource_requests add column if not exists created_at timestamptz not null default now();
alter table private.sheet_requests add column if not exists created_at timestamptz not null default now();
alter table private.inventory_requests add column if not exists created_at timestamptz not null default now();
alter table private.combat_requests add column if not exists created_at timestamptz not null default now();
alter table private.tabletop_requests add column if not exists created_at timestamptz not null default now();
create index if not exists resource_requests_created_at on private.resource_requests(created_at);
create index if not exists sheet_requests_created_at on private.sheet_requests(created_at);
create index if not exists inventory_requests_created_at on private.inventory_requests(created_at);
create index if not exists combat_requests_created_at on private.combat_requests(created_at);
create index if not exists tabletop_requests_created_at on private.tabletop_requests(created_at);
create index if not exists character_requests_created_at on private.character_requests(created_at);
create index if not exists content_requests_created_at on private.content_requests(created_at);

-- Idempotency rows older than 30 days, and snapshots plus unread log rows of encounters that ended
-- more than 30 days ago. Returns the affected row count per table.
create function private.prune_stale_rows() returns jsonb
language plpgsql volatile security definer set search_path = '' as $fn$
declare
  cutoff timestamptz := now() - interval '30 days';
  log_cap constant integer := 60;
  n bigint;
  result jsonb := '{}'::jsonb;
begin
  delete from private.resource_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('resource_requests', n);
  delete from private.sheet_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('sheet_requests', n);
  delete from private.inventory_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('inventory_requests', n);
  delete from private.combat_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('combat_requests', n);
  delete from private.tabletop_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('tabletop_requests', n);
  delete from private.character_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('character_requests', n);
  delete from private.content_requests r where r.created_at < cutoff;
  get diagnostics n = row_count; result := result || jsonb_build_object('content_requests', n);

  -- get_combat_state shows the newest 60 events (DM) or the newest 60 visible events (Players and
  -- the table screen); older rows of an ended encounter are read by nothing.
  delete from public.encounter_events x
   using (select v.id, v.visible,
            row_number() over (partition by v.encounter_id order by v.created_at desc, v.id desc) all_rank,
            row_number() over (partition by v.encounter_id, v.visible order by v.created_at desc, v.id desc) kind_rank
          from public.encounter_events v
          join public.encounters e on e.id = v.encounter_id
         where e.status = 'ended' and coalesce(e.ended_at, e.updated_at) < cutoff) k
   where x.id = k.id and k.all_rank > log_cap and (not k.visible or k.kind_rank > log_cap);
  get diagnostics n = row_count; result := result || jsonb_build_object('encounter_events_deleted', n);
  update public.encounter_events x set before_state = null, after_state = null
    from public.encounters e
   where e.id = x.encounter_id and e.status = 'ended' and coalesce(e.ended_at, e.updated_at) < cutoff
     and (x.before_state is not null or x.after_state is not null);
  get diagnostics n = row_count; result := result || jsonb_build_object('encounter_events_snapshots_cleared', n);
  return result;
end;
$fn$;
revoke all on function private.prune_stale_rows() from public, anon, authenticated;
comment on function private.prune_stale_rows() is
  'RYT-114 retention: idempotency rows older than 30 days; snapshots and unread log rows of encounters ended over 30 days ago. Owner or scheduler only.';
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.encounter_signals') is not null
      and to_regprocedure('pre_private.my_campaign_ids()') is null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function private.prune_stale_rows() from service_role';
    if to_regprocedure('pre_private.prune_stale_rows()') is not null then
      execute 'revoke all on function pre_private.prune_stale_rows() from service_role';
    end if;
  end if;
end;
$m$;

-- ---------------------------------------------------------------------------------------------
-- Schedule (global, outside the remapped DDL): daily at 04:23 UTC when pg_cron is installed.
-- ---------------------------------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rytta-prune-stale-rows', '23 4 * * *', $job$do $run$
begin
  perform private.prune_stale_rows();
  if to_regprocedure('pre_private.prune_stale_rows()') is not null then
    execute 'select pre_private.prune_stale_rows()';
  end if;
end
$run$$job$);
  end if;
end
$cron$;
