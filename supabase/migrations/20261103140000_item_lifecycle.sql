-- RYT-032: storeroom item lifecycle. Soft delete (archive) of item definitions with an impact
-- preview, and a transactional price sync for the shop listings linked to a definition.
-- Actor matrix:
--   anon: no execute on any function (revoked from public and anon).
--   outsider / inactive member / DM of another campaign / Player in the campaign: Forbidden.
--   active campaign DM: reads the impact of archiving a definition, archives it (its live shop
--           listings are archived in the same transaction) and syncs listing prices.
-- Archiving never touches character holdings: stacks stay, keep their ledger and stay readable
-- through definitions_read, but grant_item and save_listing already refuse archived
-- definitions and get_shop_admin / listing_visible already hide them.
-- Every write locks the campaign row first, checks the definition revision, bumps revisions
-- on the rows it changes and records actor, payload and result in private.inventory_requests
-- (the RYT-004 idempotency and audit table), so a retry with the same request id replays.
-- save_item_definition is replaced so an edit keeps the archived flag unless the payload sets
-- it explicitly; before this migration any edit silently un-archived the definition.
--
-- Environments: this file runs on production (public / private). A PRE (pre / pre_private)
-- that already exists receives the same functions through the guarded block at the end, with
-- references remapped by the canonical pre_admin.remap. Apply it to PRE first, validate, then
-- to production. Nothing here deletes rows.

create or replace function public.save_item_definition(target_campaign uuid, target_definition uuid,
  expected_revision bigint, item jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare req jsonb := jsonb_build_array('definition', target_campaign, target_definition, expected_revision, item);
  replay jsonb; dm boolean; current public.item_definitions; result_id uuid; new_origin text;
  price integer := (item ->> 'value_gp')::integer;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_member(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select r.result into replay from private.inventory_requests r
    where r.request_id = save_item_definition.request_id and r.actor_id = auth.uid() and r.payload = req;
  if replay is not null then return replay; end if;
  if exists (select 1 from private.inventory_requests r where r.request_id = save_item_definition.request_id) then
    raise exception 'Request mismatch' using errcode = '22023'; end if;
  dm := private.is_campaign_dm(target_campaign);
  if not dm and price is not null then raise exception 'Forbidden' using errcode = '42501'; end if;
  new_origin := case when not dm then 'player' when item ->> 'origin' = 'srd' then 'srd' else 'dm' end;
  if target_definition is null then
    insert into public.item_definitions(campaign_id, name, category, icon, rarity, weight_tenths, value_gp,
      description, slot_kind, properties, origin, created_by)
    values (target_campaign, trim(item ->> 'name'), item ->> 'category', coalesce(item ->> 'icon', 'package'),
      coalesce(item ->> 'rarity', 'common'), coalesce((item ->> 'weight_tenths')::integer, 0), price,
      coalesce(item ->> 'description', ''), coalesce(item ->> 'slot_kind', 'none'),
      coalesce(item -> 'properties', '{}'::jsonb), new_origin, auth.uid())
    returning id into result_id;
  else
    select * into current from public.item_definitions
      where campaign_id = target_campaign and id = target_definition for update;
    if current.id is null then raise exception 'Item unavailable' using errcode = '42501'; end if;
    if not dm and (current.origin <> 'player' or current.created_by is distinct from auth.uid()) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    if current.revision is distinct from expected_revision then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    update public.item_definitions set name = trim(item ->> 'name'), category = item ->> 'category',
      icon = coalesce(item ->> 'icon', 'package'), rarity = coalesce(item ->> 'rarity', 'common'),
      weight_tenths = coalesce((item ->> 'weight_tenths')::integer, 0),
      value_gp = case when dm then price else null end,
      description = coalesce(item ->> 'description', ''), slot_kind = coalesce(item ->> 'slot_kind', 'none'),
      properties = coalesce(item -> 'properties', '{}'::jsonb),
      archived = case when item ? 'archived' then coalesce((item ->> 'archived')::boolean, false)
        else current.archived end,
      revision = revision + 1
      where campaign_id = target_campaign and id = target_definition;
    result_id := target_definition;
    -- Equipped armor or shield changes can move AC for everyone wearing it.
    perform private.recompute_armor_class(i.campaign_id, i.character_id) from public.inventory_items i
      where i.campaign_id = target_campaign and i.definition_id = target_definition and i.equipped_slot is not null;
  end if;
  return private.inventory_finish(request_id, req, jsonb_build_object('id', result_id));
end;
$$;

-- What archiving (or repricing) a definition touches: live listings in live shops with their
-- current price, characters still holding units, and open orders that would block archiving.
create function public.item_definition_impact(target_campaign uuid, target_definition uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.item_definitions
      where campaign_id = target_campaign and id = target_definition) then
    raise exception 'Item unavailable' using errcode = '42501'; end if;
  return jsonb_build_object(
    'listings', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'shop_id', s.id,
        'shop_name', s.name, 'price', l.price, 'stock', l.stock, 'revision', l.revision)
        order by s.name)
      from public.shop_listings l join public.shops s on s.campaign_id = l.campaign_id and s.id = l.shop_id
      where l.campaign_id = target_campaign and l.definition_id = target_definition
        and not l.archived and not s.archived), '[]'::jsonb),
    'holders', (select count(distinct i.character_id) from public.inventory_items i
      where i.campaign_id = target_campaign and i.definition_id = target_definition and i.quantity > 0),
    'units', (select coalesce(sum(i.quantity), 0) from public.inventory_items i
      where i.campaign_id = target_campaign and i.definition_id = target_definition),
    'open_orders', (select count(distinct o.id) from public.shop_orders o
      join public.shop_order_lines ln on ln.campaign_id = o.campaign_id and ln.order_id = o.id
      where o.campaign_id = target_campaign and ln.definition_id = target_definition
        and o.status in ('pending', 'countered')));
end;
$$;

-- Soft delete. Open purchase/sale requests for the item must be answered first, as with
-- archive_shop, because an archived listing can no longer complete an order.
create function public.archive_item_definition(target_campaign uuid, target_definition uuid,
  expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('archive_definition', target_campaign, target_definition,
    expected_revision);
  prior jsonb; item public.item_definitions; archived_listings integer;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  select * into item from public.item_definitions
    where campaign_id = target_campaign and id = target_definition for update;
  if item.id is null or item.archived then raise exception 'Item unavailable' using errcode = '42501'; end if;
  if item.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if exists (select 1 from public.shop_orders o join public.shop_order_lines ln
      on ln.campaign_id = o.campaign_id and ln.order_id = o.id
      where o.campaign_id = target_campaign and ln.definition_id = target_definition
        and o.status in ('pending', 'countered')) then
    raise exception 'Open orders' using errcode = 'P0001'; end if;
  update public.shop_listings set archived = true, revision = revision + 1
    where campaign_id = target_campaign and definition_id = target_definition and not archived;
  get diagnostics archived_listings = row_count;
  update public.item_definitions set archived = true, revision = revision + 1
    where campaign_id = target_campaign and id = target_definition;
  return private.inventory_finish(request_id, payload, jsonb_build_object('id', target_definition,
    'revision', item.revision + 1, 'archived_listings', archived_listings));
end;
$$;

-- Apply one absolute price to chosen live listings of one definition. Listings already at that
-- price are left untouched (no revision bump), so a repeat is a no-op even with a new key.
create function public.sync_listing_prices(target_campaign uuid, target_definition uuid,
  listing_ids uuid[], new_price integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('sync_prices', target_campaign, target_definition,
    to_jsonb(listing_ids), new_price);
  prior jsonb; wanted uuid[]; updated integer;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  if new_price is null or new_price not between 0 and 100000000 or listing_ids is null
      or cardinality(listing_ids) not between 1 and 200 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select array_agg(distinct x) into wanted from unnest(listing_ids) x;
  if wanted is null or exists (select 1 from unnest(wanted) x where x is null) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  -- Every id must be a live listing of this definition in a live shop of this campaign.
  if (select count(*) from public.shop_listings l join public.shops s
        on s.campaign_id = l.campaign_id and s.id = l.shop_id
      where l.id = any(wanted) and l.campaign_id = target_campaign
        and l.definition_id = target_definition and not l.archived and not s.archived)
      <> cardinality(wanted) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  update public.shop_listings set price = new_price, revision = revision + 1
    where id = any(wanted) and price <> new_price;
  get diagnostics updated = row_count;
  return private.inventory_finish(request_id, payload, jsonb_build_object('updated', updated));
end;
$$;

revoke all on function
  public.item_definition_impact(uuid, uuid),
  public.archive_item_definition(uuid, uuid, bigint, uuid),
  public.sync_listing_prices(uuid, uuid, uuid[], integer, uuid)
  from public, anon;
grant execute on function
  public.item_definition_impact(uuid, uuid),
  public.archive_item_definition(uuid, uuid, bigint, uuid),
  public.sync_listing_prices(uuid, uuid, uuid[], integer, uuid)
  to authenticated;

-- PRE mirror (only when PRE exists): recreate the same functions with remapped references.
do $$
declare signature text; definition text;
begin
  if to_regnamespace('pre') is null or to_regprocedure('pre_admin.remap(text)') is null then return; end if;
  foreach signature in array array[
    'public.save_item_definition(uuid,uuid,bigint,jsonb,uuid)',
    'public.item_definition_impact(uuid,uuid)',
    'public.archive_item_definition(uuid,uuid,bigint,uuid)',
    'public.sync_listing_prices(uuid,uuid,uuid[],integer,uuid)'] loop
    definition := pre_admin.remap(pg_get_functiondef(to_regprocedure(signature)));
    execute definition;
    definition := pre_admin.remap(signature);
    execute format('revoke all on function %s from public, anon', definition);
    execute format('grant execute on function %s to authenticated', definition);
  end loop;
end;
$$;

comment on function public.archive_item_definition(uuid, uuid, bigint, uuid) is
  'RYT-032 DM soft delete of an item definition; archives its live listings, keeps holdings.';
comment on function public.sync_listing_prices(uuid, uuid, uuid[], integer, uuid) is
  'RYT-032 DM price sync for chosen live listings of one definition; idempotent.';
