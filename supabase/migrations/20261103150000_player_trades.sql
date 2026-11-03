-- RYT-034: player trade window (invite, two-sided offers, double confirmation, atomic swap).
-- A Player invites another assigned character of the same campaign. The partner accepts or
-- declines a centered invitation; an open trade holds one offer per side (up to 8 unequipped
-- item stacks and an amount of gold). Every offer change increments the revision and clears
-- BOTH confirmations. When both sides confirm the same revision, items and gold move in one
-- transaction and both characters receive inventory ledger rows and a character audit event.
--
-- Actor matrix:
--   anon: no table access, no RPC execution.
--   outsider / inactive member / DM of another campaign: every RPC raises Forbidden; RLS hides
--           trades and offer rows.
--   other Player of the same campaign (not a participant): cannot read the trade or its offers,
--           cannot respond, edit, confirm or cancel it.
--   participant Player (owner of the initiator or partner character): reads the trade and both
--           offers through get_trade_state; edits only their own side; confirms and cancels.
--   active campaign DM: reads every trade of the campaign (RLS); acts only for an assigned
--           character it can play (the RYT-028 Player preview), with the same rules as its owner.
-- Tables are read-only through the Data API (RLS; the realtime publication applies the same
-- policies). All writes go through security definer RPCs that lock the campaign row first,
-- which serializes trades with inventory, shops and resource edits of the whole campaign.
-- Retried mutations reuse their request id (private.inventory_requests).
-- Invitations expire 2 minutes after they are sent; open trades expire after 10 minutes
-- without changes. Expiry is applied by every mutation (sweep) and by reads (effective status).
--
-- Environments: this file runs on production (public). A PRE (pre / pre_private) that predates
-- this migration receives the same tables, policies and functions through the guarded blocks,
-- remapped with the canonical pre_admin.remap used by the ETL (docs/pre-environment.md).
-- Apply to PRE first, validate, then to production.

do $structure$
declare ddl text := $ddl$
  alter table public.inventory_events drop constraint inventory_events_kind_check;
  alter table public.inventory_events add constraint inventory_events_kind_check check (kind in
    ('grant', 'remove', 'use', 'equip', 'unequip', 'undo', 'purchase', 'sale', 'revert',
     'trade_in', 'trade_out'));

  create table public.trades (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.campaigns(id) on delete cascade,
    initiator_character uuid not null,
    partner_character uuid not null,
    created_by uuid references auth.users(id),
    closed_by uuid references auth.users(id),
    status text not null default 'invited' check (status in
      ('invited', 'open', 'completed', 'cancelled', 'declined', 'expired')),
    revision bigint not null default 0 check (revision between 0 and 9007199254740991),
    initiator_gold bigint not null default 0 check (initiator_gold between 0 and 9007199254740991),
    partner_gold bigint not null default 0 check (partner_gold between 0 and 9007199254740991),
    initiator_confirmed boolean not null default false,
    partner_confirmed boolean not null default false,
    summary jsonb,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    unique (campaign_id, id),
    foreign key (campaign_id, initiator_character) references public.characters(campaign_id, id) on delete cascade,
    foreign key (campaign_id, partner_character) references public.characters(campaign_id, id) on delete cascade,
    check (initiator_character <> partner_character),
    check (status = 'open' or not (initiator_confirmed or partner_confirmed) or status = 'completed')
  );
  -- Backstop for "one active trade per character"; the RPCs also check the opposite role.
  create unique index trades_active_initiator on public.trades(initiator_character)
    where status in ('invited', 'open');
  create unique index trades_active_partner on public.trades(partner_character)
    where status in ('invited', 'open');
  create index trades_campaign on public.trades(campaign_id, updated_at desc);

  create table public.trade_offer_items (
    trade_id uuid not null,
    campaign_id uuid not null,
    side text not null check (side in ('initiator', 'partner')),
    item_id uuid not null,
    quantity integer not null check (quantity between 1 and 100000),
    primary key (trade_id, item_id),
    foreign key (campaign_id, trade_id) references public.trades(campaign_id, id) on delete cascade,
    foreign key (campaign_id, item_id) references public.inventory_items(campaign_id, id) on delete cascade
  );

  alter table public.trades enable row level security;
  alter table public.trade_offer_items enable row level security;
  revoke all on public.trades, public.trade_offer_items from public, anon, authenticated;
  grant select on public.trades, public.trade_offer_items to authenticated;
  create policy trades_read on public.trades for select to authenticated
    using (private.can_play_character(campaign_id, initiator_character)
      or private.can_play_character(campaign_id, partner_character));
  create policy trade_offers_read on public.trade_offer_items for select to authenticated
    using (exists (select 1 from public.trades t where t.campaign_id = trade_offer_items.campaign_id
      and t.id = trade_offer_items.trade_id
      and (private.can_play_character(t.campaign_id, t.initiator_character)
        or private.can_play_character(t.campaign_id, t.partner_character))));
  comment on table public.trades is
    'RYT-034 player trades: invitation, two-sided offer state and completion summary. RPC writes only.';
  comment on table public.trade_offer_items is
    'RYT-034 item stacks offered by one side of an open trade. RPC writes only.';
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.characters') is not null and to_regprocedure('pre_admin.remap(text)') is not null
      and to_regclass('pre.trades') is null then
    execute pre_admin.remap(ddl);
  end if;
end;
$structure$;

-- Expires stale invitations and idle open trades of one campaign (the caller holds its lock).
create function private.trade_sweep(target_campaign uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.trades set status = 'expired', initiator_confirmed = false, partner_confirmed = false,
      revision = revision + 1, updated_at = now()
    where campaign_id = target_campaign and status in ('invited', 'open') and expires_at <= now();
end;
$$;

create function private.trade_busy(target_campaign uuid, target_character uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trades t where t.campaign_id = target_campaign
    and t.status in ('invited', 'open') and t.expires_at > now()
    and target_character in (t.initiator_character, t.partner_character));
$$;

-- Offered stacks of one side with display fields only (never the DM item value).
create function private.trade_items_json(target_trade uuid, target_side text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('item_id', o.item_id, 'definition_id', d.id,
      'name', d.name, 'icon', d.icon, 'rarity', d.rarity, 'category', d.category,
      'quantity', o.quantity) order by d.name, o.item_id), '[]'::jsonb)
    from public.trade_offer_items o
    join public.inventory_items i on i.campaign_id = o.campaign_id and i.id = o.item_id
    join public.item_definitions d on d.campaign_id = i.campaign_id and d.id = i.definition_id
   where o.trade_id = target_trade and o.side = target_side;
$$;

-- The trade as seen from one participant: "you" and "partner" instead of initiator/partner.
create function private.trade_json(target_trade uuid, viewer_character uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.trades; mine text; theirs text; other uuid;
begin
  select * into t from public.trades where id = target_trade;
  if t.id is null then return null; end if;
  mine := case when viewer_character = t.initiator_character then 'initiator' else 'partner' end;
  theirs := case when mine = 'initiator' then 'partner' else 'initiator' end;
  other := case when mine = 'initiator' then t.partner_character else t.initiator_character end;
  return jsonb_build_object(
    'id', t.id,
    'status', case when t.status in ('invited', 'open') and t.expires_at <= now() then 'expired'
      else t.status end,
    'revision', t.revision,
    'initiated_by_you', mine = 'initiator',
    'expires_at', t.expires_at,
    'updated_at', t.updated_at,
    'you', jsonb_build_object('character_id', viewer_character,
      'name', (select c.name from public.characters c where c.id = viewer_character),
      'gold', case when mine = 'initiator' then t.initiator_gold else t.partner_gold end,
      'confirmed', case when mine = 'initiator' then t.initiator_confirmed else t.partner_confirmed end,
      'items', private.trade_items_json(t.id, mine)),
    'partner', jsonb_build_object('character_id', other,
      'name', (select c.name from public.characters c where c.id = other),
      'gold', case when mine = 'initiator' then t.partner_gold else t.initiator_gold end,
      'confirmed', case when mine = 'initiator' then t.partner_confirmed else t.initiator_confirmed end,
      'items', private.trade_items_json(t.id, theirs)));
end;
$$;

-- Participant check shared by mutations: returns the side of acting_character or raises.
create function private.trade_side(initiator uuid, partner uuid, acting_character uuid) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if initiator is null or acting_character is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  if acting_character = initiator then return 'initiator'; end if;
  if acting_character = partner then return 'partner'; end if;
  raise exception 'Forbidden' using errcode = '42501';
end;
$$;

create function public.invite_trade(target_campaign uuid, from_character uuid, to_character uuid,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('trade_invite', target_campaign, from_character, to_character);
  replay jsonb; new_id uuid;
begin
  replay := private.inventory_begin(target_campaign, from_character, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.trade_sweep(target_campaign);
  -- Both characters belong to this campaign and are assigned to active members.
  if from_character = to_character or (select count(*) from public.characters c
      where c.campaign_id = target_campaign and c.id in (from_character, to_character)
        and c.user_id is not null) <> 2 then
    raise exception 'Character unavailable' using errcode = '42501'; end if;
  if private.trade_busy(target_campaign, from_character) then
    raise exception 'Trade busy' using errcode = 'P0001'; end if;
  if private.trade_busy(target_campaign, to_character) then
    raise exception 'Partner busy' using errcode = 'P0001'; end if;
  insert into public.trades(campaign_id, initiator_character, partner_character, created_by, expires_at)
    values (target_campaign, from_character, to_character, auth.uid(), now() + interval '2 minutes')
    returning id into new_id;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('trade_id', new_id, 'status', 'invited', 'revision', 0));
end;
$$;

create function public.respond_trade_invite(target_campaign uuid, target_trade uuid, accept boolean,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('trade_respond', target_campaign, target_trade, accept);
  replay jsonb; t public.trades;
begin
  select * into t from public.trades where campaign_id = target_campaign and id = target_trade;
  -- Only the invited side answers; an unknown trade fails the same way (no existence leak).
  replay := private.inventory_begin(target_campaign, t.partner_character, request_id, payload);
  if replay is not null then return replay; end if;
  if accept is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  perform private.trade_sweep(target_campaign);
  select * into t from public.trades where id = target_trade for update;
  if t.status <> 'invited' then raise exception 'Trade closed' using errcode = 'P0001'; end if;
  update public.trades set status = case when accept then 'open' else 'declined' end,
      closed_by = case when accept then null else auth.uid() end,
      expires_at = case when accept then now() + interval '10 minutes' else expires_at end,
      revision = revision + 1, updated_at = now()
    where id = t.id returning * into t;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('trade_id', t.id, 'status', t.status, 'revision', t.revision));
end;
$$;

create function public.set_trade_offer(target_campaign uuid, target_trade uuid, acting_character uuid,
  expected_revision bigint, offer_items jsonb, offer_gold bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('trade_offer', target_campaign, target_trade, acting_character,
    expected_revision, offer_items, offer_gold);
  replay jsonb; t public.trades; my_side text; entry jsonb; stack public.inventory_items; balance bigint;
  qty numeric; wanted integer; seen uuid[] := array[]::uuid[]; item uuid;
begin
  replay := private.inventory_begin(target_campaign, acting_character, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.trade_sweep(target_campaign);
  select * into t from public.trades where campaign_id = target_campaign and id = target_trade for update;
  my_side := private.trade_side(t.initiator_character, t.partner_character, acting_character);
  if t.status <> 'open' then raise exception 'Trade closed' using errcode = 'P0001'; end if;
  if t.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if offer_items is null or jsonb_typeof(offer_items) <> 'array' or jsonb_array_length(offer_items) > 8
      or offer_gold is null or offer_gold < 0 or offer_gold > 9007199254740991 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select r.gold into balance from public.character_resources r
    where r.campaign_id = target_campaign and r.character_id = acting_character;
  if coalesce(balance, 0) < offer_gold then raise exception 'Insufficient gold' using errcode = 'P0001'; end if;
  delete from public.trade_offer_items o where o.trade_id = t.id and o.side = my_side;
  for entry in select value from jsonb_array_elements(offer_items) loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry -> 'quantity') <> 'number'
        or coalesce(entry ->> 'item_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    item := (entry ->> 'item_id')::uuid;
    qty := (entry ->> 'quantity')::numeric;
    if qty < 1 or qty > 100000 or qty <> trunc(qty) or item = any(seen) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    wanted := qty;
    seen := seen || item;
    select * into stack from public.inventory_items i
      where i.campaign_id = target_campaign and i.id = item and i.character_id = acting_character;
    if stack.id is null then raise exception 'Item unavailable' using errcode = '42501'; end if;
    if stack.equipped_slot is not null then raise exception 'Item equipped' using errcode = 'P0001'; end if;
    if stack.quantity < wanted then raise exception 'Insufficient quantity' using errcode = 'P0001'; end if;
    insert into public.trade_offer_items(trade_id, campaign_id, side, item_id, quantity)
      values (t.id, target_campaign, my_side, item, wanted);
  end loop;
  -- Any change unlocks both sides and keeps the open trade alive.
  update public.trades set
      initiator_gold = case when my_side = 'initiator' then offer_gold else initiator_gold end,
      partner_gold = case when my_side = 'partner' then offer_gold else partner_gold end,
      initiator_confirmed = false, partner_confirmed = false, revision = revision + 1,
      expires_at = now() + interval '10 minutes', updated_at = now()
    where id = t.id returning * into t;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('trade_id', t.id, 'status', t.status, 'revision', t.revision));
end;
$$;

-- Moves both offers. Re-validates every stack and balance under row locks; raises on any change.
create function private.trade_complete(target_trade uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.trades; o record; giver uuid; receiver uuid; stack public.inventory_items;
  target public.inventory_items; before jsonb; definition public.item_definitions;
  gave_initiator jsonb := '[]'::jsonb; gave_partner jsonb := '[]'::jsonb; result_summary jsonb;
  initiator_name text; partner_name text;
begin
  select * into t from public.trades where id = target_trade for update;
  select c.name into initiator_name from public.characters c
    where c.id = t.initiator_character and c.user_id is not null;
  select c.name into partner_name from public.characters c
    where c.id = t.partner_character and c.user_id is not null;
  if initiator_name is null or partner_name is null then
    raise exception 'Character unavailable' using errcode = '42501'; end if;
  perform 1 from public.character_resources r
    where r.campaign_id = t.campaign_id and r.character_id in (t.initiator_character, t.partner_character)
    order by r.character_id for update;
  if coalesce((select r.gold from public.character_resources r
        where r.character_id = t.initiator_character), 0) < t.initiator_gold
      or coalesce((select r.gold from public.character_resources r
        where r.character_id = t.partner_character), 0) < t.partner_gold then
    raise exception 'Insufficient gold' using errcode = 'P0001'; end if;
  for o in select * from public.trade_offer_items where trade_id = t.id order by side, item_id loop
    giver := case when o.side = 'initiator' then t.initiator_character else t.partner_character end;
    receiver := case when o.side = 'initiator' then t.partner_character else t.initiator_character end;
    select * into stack from public.inventory_items
      where campaign_id = t.campaign_id and id = o.item_id and character_id = giver for update;
    if stack.id is null or stack.quantity < o.quantity then
      raise exception 'Insufficient quantity' using errcode = 'P0001'; end if;
    if stack.equipped_slot is not null then raise exception 'Item equipped' using errcode = 'P0001'; end if;
    select * into definition from public.item_definitions
      where campaign_id = t.campaign_id and id = stack.definition_id;
    before := private.item_snapshot(stack);
    update public.inventory_items set quantity = quantity - o.quantity, revision = revision + 1
      where id = stack.id returning * into stack;
    insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
      before_value, after_value, request_id)
      values (t.campaign_id, giver, stack.id, auth.uid(), 'trade_out', -o.quantity, before,
        private.item_snapshot(stack) || jsonb_build_object('trade_id', t.id, 'counterpart', receiver),
        gen_random_uuid());
    -- The receiver's loose stack of the same definition and source absorbs the units.
    select * into target from public.inventory_items
      where campaign_id = t.campaign_id and character_id = receiver and definition_id = stack.definition_id
        and source = stack.source and equipped_slot is null
      order by created_at, id limit 1 for update;
    if target.id is null then
      insert into public.inventory_items(campaign_id, character_id, definition_id, quantity, source, notes)
        values (t.campaign_id, receiver, stack.definition_id, o.quantity, stack.source, stack.notes)
        returning * into target;
      before := jsonb_build_object('quantity', 0, 'equipped_slot', null, 'revision', -1,
        'definition_id', stack.definition_id);
    else
      before := private.item_snapshot(target);
      update public.inventory_items set quantity = quantity + o.quantity, revision = revision + 1
        where id = target.id returning * into target;
    end if;
    insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
      before_value, after_value, request_id)
      values (t.campaign_id, receiver, target.id, auth.uid(), 'trade_in', o.quantity, before,
        private.item_snapshot(target) || jsonb_build_object('trade_id', t.id, 'counterpart', giver),
        gen_random_uuid());
    if o.side = 'initiator' then
      gave_initiator := gave_initiator || jsonb_build_object('name', definition.name, 'icon', definition.icon,
        'rarity', definition.rarity, 'quantity', o.quantity);
    else
      gave_partner := gave_partner || jsonb_build_object('name', definition.name, 'icon', definition.icon,
        'rarity', definition.rarity, 'quantity', o.quantity);
    end if;
  end loop;
  -- Net gold per character; the balances were checked against each side's full offer above.
  perform private.move_gold(t.campaign_id, t.initiator_character, t.partner_gold - t.initiator_gold);
  perform private.move_gold(t.campaign_id, t.partner_character, t.initiator_gold - t.partner_gold);
  result_summary := jsonb_build_object(
    'initiator', jsonb_build_object('name', initiator_name, 'gold', t.initiator_gold, 'items', gave_initiator),
    'partner', jsonb_build_object('name', partner_name, 'gold', t.partner_gold, 'items', gave_partner));
  insert into public.character_events(campaign_id, character_id, actor_id, kind, before_value, after_value)
    values (t.campaign_id, t.initiator_character, auth.uid(), 'trade_completed', null,
        jsonb_build_object('trade_id', t.id, 'partner', partner_name, 'gave', result_summary -> 'initiator',
          'received', result_summary -> 'partner')),
      (t.campaign_id, t.partner_character, auth.uid(), 'trade_completed', null,
        jsonb_build_object('trade_id', t.id, 'partner', initiator_name, 'gave', result_summary -> 'partner',
          'received', result_summary -> 'initiator'));
  update public.trades set status = 'completed', summary = result_summary, completed_at = now(),
      revision = revision + 1, updated_at = now()
    where id = t.id;
  return result_summary;
end;
$$;

create function public.confirm_trade(target_campaign uuid, target_trade uuid, acting_character uuid,
  expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('trade_confirm', target_campaign, target_trade, acting_character,
    expected_revision);
  replay jsonb; t public.trades; my_side text;
begin
  replay := private.inventory_begin(target_campaign, acting_character, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.trade_sweep(target_campaign);
  select * into t from public.trades where campaign_id = target_campaign and id = target_trade for update;
  my_side := private.trade_side(t.initiator_character, t.partner_character, acting_character);
  -- A second confirmation of the revision that completed the trade is a no-op success.
  if t.status = 'completed' and t.revision = expected_revision + 1 then
    return private.inventory_finish(request_id, payload,
      jsonb_build_object('trade_id', t.id, 'status', t.status, 'revision', t.revision));
  end if;
  if t.status <> 'open' then raise exception 'Trade closed' using errcode = 'P0001'; end if;
  if t.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  update public.trades set
      initiator_confirmed = initiator_confirmed or my_side = 'initiator',
      partner_confirmed = partner_confirmed or my_side = 'partner',
      expires_at = now() + interval '10 minutes', updated_at = now()
    where id = t.id returning * into t;
  if t.initiator_confirmed and t.partner_confirmed then
    perform private.trade_complete(t.id);
    select * into t from public.trades where id = t.id;
  end if;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('trade_id', t.id, 'status', t.status, 'revision', t.revision));
end;
$$;

-- Either participant ends an invited or open trade; ending a closed trade returns its status.
create function public.cancel_trade(target_campaign uuid, target_trade uuid, acting_character uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.trades; my_side text;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if acting_character is null or not private.can_play_character(target_campaign, acting_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  perform private.trade_sweep(target_campaign);
  select * into t from public.trades where campaign_id = target_campaign and id = target_trade for update;
  my_side := private.trade_side(t.initiator_character, t.partner_character, acting_character);
  if t.status in ('invited', 'open') then
    update public.trades set status = case when t.status = 'invited' and my_side = 'partner'
        then 'declined' else 'cancelled' end,
        initiator_confirmed = false, partner_confirmed = false, closed_by = auth.uid(),
        revision = revision + 1, updated_at = now()
      where id = t.id returning * into t;
  end if;
  return jsonb_build_object('trade_id', t.id, 'status', t.status, 'revision', t.revision);
end;
$$;

-- Trade state for the caller's character, or for the previewed Player's character (DM only).
create function public.get_trade_state(target_campaign uuid, acting_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid := auth.uid(); me public.characters; active uuid; recent public.trades;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if acting_user is not null and acting_user <> viewer and not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into me from public.characters c
    where c.campaign_id = target_campaign and c.user_id = coalesce(acting_user, viewer);
  if me.id is null then
    return jsonb_build_object('character', null, 'partners', '[]'::jsonb, 'items', '[]'::jsonb,
      'trade', null, 'recent', null, 'history', '[]'::jsonb);
  end if;
  select t.id into active from public.trades t
    where t.campaign_id = target_campaign and t.status in ('invited', 'open') and t.expires_at > now()
      and me.id in (t.initiator_character, t.partner_character)
    order by t.created_at desc limit 1;
  -- Last trade that closed in the past minute, so both sides learn how it ended.
  select * into recent from public.trades t
    where t.campaign_id = target_campaign and me.id in (t.initiator_character, t.partner_character)
      and (t.status not in ('invited', 'open') or t.expires_at <= now())
      and greatest(t.updated_at, case when t.status in ('invited', 'open') then t.expires_at end)
        > now() - interval '1 minute'
    order by greatest(t.updated_at, case when t.status in ('invited', 'open') then t.expires_at end) desc
    limit 1;
  return jsonb_build_object(
    'character', jsonb_build_object('id', me.id, 'name', me.name,
      'gold', (select r.gold from public.character_resources r where r.character_id = me.id)),
    'partners', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'busy', private.trade_busy(target_campaign, c.id)) order by c.name, c.id), '[]'::jsonb)
      from public.characters c
      where c.campaign_id = target_campaign and c.user_id is not null and c.id <> me.id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'definition_id', d.id,
        'name', d.name, 'icon', d.icon, 'rarity', d.rarity, 'category', d.category,
        'quantity', i.quantity) order by d.name, i.id), '[]'::jsonb)
      from public.inventory_items i join public.item_definitions d
        on d.campaign_id = i.campaign_id and d.id = i.definition_id
      where i.campaign_id = target_campaign and i.character_id = me.id and i.quantity > 0
        and i.equipped_slot is null),
    'trade', case when active is null then null else private.trade_json(active, me.id) end,
    'recent', case when recent.id is null then null else private.trade_json(recent.id, me.id)
      || jsonb_build_object('closed_by_you', recent.closed_by is not distinct from viewer,
        'summary', recent.summary) end,
    'history', (select coalesce(jsonb_agg(h.entry order by h.completed_at desc), '[]'::jsonb) from (
      select t.completed_at, jsonb_build_object('id', t.id, 'completed_at', t.completed_at,
          'partner', case when t.initiator_character = me.id then t.summary #>> '{partner,name}'
            else t.summary #>> '{initiator,name}' end,
          'gave', case when t.initiator_character = me.id then t.summary -> 'initiator' else t.summary -> 'partner' end,
          'received', case when t.initiator_character = me.id then t.summary -> 'partner' else t.summary -> 'initiator' end
        ) entry
        from public.trades t
       where t.campaign_id = target_campaign and t.status = 'completed'
         and me.id in (t.initiator_character, t.partner_character)
       order by t.completed_at desc limit 10) h));
end;
$$;

revoke all on function private.trade_sweep(uuid), private.trade_busy(uuid, uuid),
  private.trade_items_json(uuid, text), private.trade_json(uuid, uuid),
  private.trade_side(uuid, uuid, uuid), private.trade_complete(uuid)
  from public, anon, authenticated;
revoke all on function public.invite_trade(uuid, uuid, uuid, uuid),
  public.respond_trade_invite(uuid, uuid, boolean, uuid),
  public.set_trade_offer(uuid, uuid, uuid, bigint, jsonb, bigint, uuid),
  public.confirm_trade(uuid, uuid, uuid, bigint, uuid),
  public.cancel_trade(uuid, uuid, uuid), public.get_trade_state(uuid, uuid)
  from public, anon;
grant execute on function public.invite_trade(uuid, uuid, uuid, uuid),
  public.respond_trade_invite(uuid, uuid, boolean, uuid),
  public.set_trade_offer(uuid, uuid, uuid, bigint, jsonb, bigint, uuid),
  public.confirm_trade(uuid, uuid, uuid, bigint, uuid),
  public.cancel_trade(uuid, uuid, uuid), public.get_trade_state(uuid, uuid)
  to authenticated;

-- Realtime: participants subscribe to postgres_changes on trades; RLS filters each event.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trades;
  end if;
end;
$$;

-- PRE mirror of the functions (only when PRE exists and predates this migration).
do $$
declare fn text;
begin
  if to_regclass('pre.trades') is null or to_regprocedure('pre_admin.remap(text)') is null
      or to_regprocedure('pre.get_trade_state(uuid,uuid)') is not null then
    return;
  end if;
  foreach fn in array array['private.trade_sweep(uuid)', 'private.trade_busy(uuid,uuid)',
      'private.trade_items_json(uuid,text)', 'private.trade_json(uuid,uuid)',
      'private.trade_side(uuid,uuid,uuid)', 'private.trade_complete(uuid)'] loop
    execute pre_admin.remap(pg_get_functiondef(fn::regprocedure));
    execute format('revoke all on function %s from public, anon, authenticated', pre_admin.remap(fn));
  end loop;
  foreach fn in array array['public.invite_trade(uuid,uuid,uuid,uuid)',
      'public.respond_trade_invite(uuid,uuid,boolean,uuid)',
      'public.set_trade_offer(uuid,uuid,uuid,bigint,jsonb,bigint,uuid)',
      'public.confirm_trade(uuid,uuid,uuid,bigint,uuid)', 'public.cancel_trade(uuid,uuid,uuid)',
      'public.get_trade_state(uuid,uuid)'] loop
    execute pre_admin.remap(pg_get_functiondef(fn::regprocedure));
    execute format('revoke all on function %s from public, anon', pre_admin.remap(fn));
    execute format('grant execute on function %s to authenticated', pre_admin.remap(fn));
  end loop;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table pre.trades;
  end if;
end;
$$;
