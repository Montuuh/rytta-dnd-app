-- RYT-005: merchants, stock, per-character visibility and discounts, cart purchases, sales,
-- approval with counter-offers and a revertible order ledger, on top of the RYT-004 inventory.
-- Actor matrix:
--   anon / outsider / inactive member / DM of another campaign: no reads or writes.
--   other Player in the same campaign: never sees this character's orders, discounts or
--           player-specific listings, and cannot act for this character.
--   assigned active Player: reads the shops and listings visible to their character and their
--           own orders; buys, sells dm/shop-sourced unequipped units, answers counter-offers
--           and cancels own open orders. Never edits gold, prices, stock or visibility.
--   active campaign DM: manages shops, listings, visibility and price modifiers; approves,
--           rejects, counters and reverts orders.
-- Shop tables are not readable through the Data API: security definer RPCs return only what
-- the caller may see, so hidden shops and listings are absent rather than flagged, and the
-- DM-only item value never reaches Players. Every mutation locks the campaign row first,
-- serializing gold, stock and inventory per campaign. Retries reuse request ids.
-- Purchased units land in source = 'shop' stacks (ADR 014). Shop events are logged as
-- purchase/sale/revert, which the RYT-004 undo never compensates, so gold cannot be
-- recovered twice. The PRE ETL cannot clone sequences, views or custom types: uuid and text.

alter table public.inventory_events drop constraint inventory_events_kind_check;
alter table public.inventory_events add constraint inventory_events_kind_check check (kind in
  ('grant', 'remove', 'use', 'equip', 'unequip', 'undo', 'purchase', 'sale', 'revert'));

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  visibility text not null default 'hidden' check (visibility in ('hidden', 'party', 'selected')),
  mode text not null default 'auto' check (mode in ('auto', 'approval')),
  resale_percent integer not null default 50 check (resale_percent between 0 and 100),
  is_open boolean not null default true,
  archived boolean not null default false,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (campaign_id, id)
);

create table public.shop_access (
  shop_id uuid not null,
  campaign_id uuid not null,
  character_id uuid not null,
  primary key (shop_id, character_id),
  foreign key (campaign_id, shop_id) references public.shops(campaign_id, id) on delete cascade,
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade
);

create table public.shop_listings (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  shop_id uuid not null,
  definition_id uuid not null,
  price integer not null check (price between 0 and 100000000),
  stock integer check (stock between 0 and 9999),
  visibility text not null default 'shop' check (visibility in ('shop', 'hidden', 'selected')),
  archived boolean not null default false,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (campaign_id, id),
  foreign key (campaign_id, shop_id) references public.shops(campaign_id, id) on delete cascade,
  foreign key (campaign_id, definition_id) references public.item_definitions(campaign_id, id)
);
create unique index shop_listing_definition on public.shop_listings(shop_id, definition_id) where not archived;

create table public.listing_access (
  listing_id uuid not null,
  campaign_id uuid not null,
  character_id uuid not null,
  primary key (listing_id, character_id),
  foreign key (campaign_id, listing_id) references public.shop_listings(campaign_id, id) on delete cascade,
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade
);

-- Percent price adjustment per shop and character: -20 is a 20% discount, 10 a surcharge.
create table public.shop_modifiers (
  shop_id uuid not null,
  campaign_id uuid not null,
  character_id uuid not null,
  percent integer not null check (percent between -100 and 100 and percent <> 0),
  primary key (shop_id, character_id),
  foreign key (campaign_id, shop_id) references public.shops(campaign_id, id) on delete cascade,
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade
);

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  shop_id uuid not null,
  character_id uuid not null,
  actor_id uuid references auth.users(id),
  kind text not null check (kind in ('purchase', 'sale')),
  status text not null check (status in
    ('pending', 'countered', 'completed', 'rejected', 'cancelled', 'reverted')),
  total bigint not null default 0 check (total between 0 and 9007199254740991),
  refunded bigint not null default 0 check (refunded between 0 and 9007199254740991),
  player_note text not null default '' check (char_length(player_note) <= 500),
  dm_note text not null default '' check (char_length(dm_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  unique (campaign_id, id),
  foreign key (campaign_id, shop_id) references public.shops(campaign_id, id),
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade
);
create index shop_orders_campaign on public.shop_orders(campaign_id, created_at desc);
create index shop_orders_character on public.shop_orders(campaign_id, character_id, created_at desc);

create table public.shop_order_lines (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  order_id uuid not null,
  listing_id uuid references public.shop_listings(id),
  definition_id uuid not null,
  quantity integer not null check (quantity between 1 and 999),
  unit_price integer not null check (unit_price between 0 and 100000000),
  offered_price integer check (offered_price between 0 and 100000000),
  countered_price integer check (countered_price between 0 and 100000000),
  final_price integer check (final_price between 0 and 100000000),
  reverted_quantity integer not null default 0 check (reverted_quantity between 0 and quantity),
  foreign key (campaign_id, order_id) references public.shop_orders(campaign_id, id) on delete cascade,
  foreign key (campaign_id, definition_id) references public.item_definitions(campaign_id, id)
);
create unique index shop_order_line_definition on public.shop_order_lines(order_id, definition_id);

alter table public.shops enable row level security;
alter table public.shop_access enable row level security;
alter table public.shop_listings enable row level security;
alter table public.listing_access enable row level security;
alter table public.shop_modifiers enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_lines enable row level security;
revoke all on public.shops, public.shop_access, public.shop_listings, public.listing_access,
  public.shop_modifiers, public.shop_orders, public.shop_order_lines
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private helpers (plpgsql defers body validation for the alphabetical PRE ETL).

-- Idempotent replay in the RYT-004 request table, for calls without a character guard.
create function private.shop_claim(req uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare prior private.inventory_requests;
begin
  if req is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.inventory_requests r where r.request_id = req;
  if prior.request_id is null then return null; end if;
  if prior.actor_id <> auth.uid() or prior.payload <> payload then
    raise exception 'Request mismatch' using errcode = '22023'; end if;
  return prior.result;
end;
$$;

create function private.shop_lock(target_campaign uuid, dm_only boolean, target_character uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if dm_only then
    if not private.is_campaign_dm(target_campaign) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
  elsif target_character is null or not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
end;
$$;

create function private.shop_visible(target_shop uuid, target_character uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.shops s where s.id = target_shop and not s.archived
    and (s.visibility = 'party' or (s.visibility = 'selected' and exists (
      select 1 from public.shop_access a where a.shop_id = s.id and a.character_id = target_character))));
end;
$$;

create function private.listing_visible(target_listing uuid, target_character uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from public.shop_listings l join public.item_definitions d
      on d.campaign_id = l.campaign_id and d.id = l.definition_id
    where l.id = target_listing and not l.archived and not d.archived
      and private.shop_visible(l.shop_id, target_character)
      and (l.visibility = 'shop' or (l.visibility = 'selected' and exists (
        select 1 from public.listing_access a where a.listing_id = l.id and a.character_id = target_character))));
end;
$$;

-- Server price: modifier applied to the list price, rounded half up, never negative.
create function private.modified_price(base integer, percent integer) returns integer
language plpgsql immutable set search_path = '' as $$
begin
  return greatest(0, round(base * (100 + coalesce(percent, 0)) / 100.0)::integer);
end;
$$;

create function private.shop_modifier(target_shop uuid, target_character uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  return coalesce((select m.percent from public.shop_modifiers m
    where m.shop_id = target_shop and m.character_id = target_character), 0);
end;
$$;

-- Resale: the shop's own list price when it stocks the item, else the DM value; floor.
create function private.resale_price(target_shop uuid, target_definition uuid) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare base integer; pct integer;
begin
  select s.resale_percent into pct from public.shops s where s.id = target_shop;
  select coalesce((select l.price from public.shop_listings l
      where l.shop_id = target_shop and l.definition_id = target_definition and not l.archived),
    (select d.value_gp from public.item_definitions d where d.id = target_definition), 0) into base;
  return floor(base * pct / 100.0)::integer;
end;
$$;

create function private.move_gold(target_campaign uuid, target_character uuid, delta bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare balance bigint;
begin
  select gold into balance from public.character_resources
    where campaign_id = target_campaign and character_id = target_character for update;
  if balance is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
  if balance + delta < 0 then raise exception 'Insufficient gold' using errcode = 'P0001'; end if;
  if delta <> 0 then
    update public.character_resources set gold = gold + delta, revision = revision + 1
      where campaign_id = target_campaign and character_id = target_character;
  end if;
  return balance + delta;
end;
$$;

-- Adds purchased (or sale-reverted) units to the character's loose shop stack and logs it.
create function private.shop_add_units(target_campaign uuid, target_character uuid, target_definition uuid,
  amount integer, event_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare stack public.inventory_items; before jsonb;
begin
  select * into stack from public.inventory_items
    where campaign_id = target_campaign and character_id = target_character and definition_id = target_definition
      and source = 'shop' and equipped_slot is null
    order by created_at limit 1 for update;
  if stack.id is null then
    insert into public.inventory_items(campaign_id, character_id, definition_id, quantity, source)
      values (target_campaign, target_character, target_definition, amount, 'shop') returning * into stack;
    before := jsonb_build_object('quantity', 0, 'equipped_slot', null, 'revision', -1,
      'definition_id', target_definition);
  else
    before := private.item_snapshot(stack);
    update public.inventory_items set quantity = quantity + amount, revision = revision + 1
      where id = stack.id returning * into stack;
  end if;
  insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
    before_value, after_value, request_id)
    values (target_campaign, target_character, stack.id, auth.uid(), event_kind, amount,
      before, private.item_snapshot(stack), gen_random_uuid());
end;
$$;

-- Takes up to `wanted` units. Sales take loose dm/shop units only; purchase reverts take
-- shop units, loose first and then equipped ones (unequipping them). Logs every stack touched.
create function private.shop_take_units(target_campaign uuid, target_character uuid, target_definition uuid,
  wanted integer, for_revert boolean, event_kind text) returns integer
language plpgsql security definer set search_path = '' as $$
declare stack public.inventory_items; before jsonb; taken integer := 0; n integer; unequipped boolean := false;
begin
  for stack in select * from public.inventory_items
    where campaign_id = target_campaign and character_id = target_character and definition_id = target_definition
      and quantity > 0
      and (case when for_revert then source = 'shop' else source in ('dm', 'shop') and equipped_slot is null end)
    order by (equipped_slot is not null), created_at, id for update loop
    exit when taken >= wanted;
    n := least(stack.quantity, wanted - taken);
    before := private.item_snapshot(stack);
    unequipped := unequipped or (stack.equipped_slot is not null and n = stack.quantity);
    update public.inventory_items set quantity = quantity - n,
      equipped_slot = case when quantity - n = 0 then null else equipped_slot end, revision = revision + 1
      where id = stack.id returning * into stack;
    insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
      before_value, after_value, request_id)
      values (target_campaign, target_character, stack.id, auth.uid(), event_kind, -n,
        before, private.item_snapshot(stack), gen_random_uuid());
    taken := taken + n;
  end loop;
  if unequipped then perform private.recompute_armor_class(target_campaign, target_character); end if;
  return taken;
end;
$$;

create function private.check_text(value text, max_length integer, allow_empty boolean) returns text
language plpgsql immutable set search_path = '' as $$
declare cleaned text := trim(coalesce(value, ''));
begin
  if char_length(cleaned) > max_length or (not allow_empty and cleaned = '') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  return cleaned;
end;
$$;

-- Character ids from a JSON array; each must belong to the campaign.
create function private.campaign_characters(target_campaign uuid, ids jsonb) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare result uuid[];
begin
  if ids is null or jsonb_typeof(ids) <> 'array' or jsonb_array_length(ids) > 50 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct v::uuid), array[]::uuid[]) into result
    from jsonb_array_elements_text(ids) v;
  if exists (select 1 from unnest(result) x where not exists (
      select 1 from public.characters c where c.campaign_id = target_campaign and c.id = x)) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  return result;
end;
$$;

-- Closes a pending/countered order: moves stock, items and gold atomically, or raises.
create function private.complete_order(target_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.shop_orders; ln record; l public.shop_listings; price integer; sum_total bigint := 0; taken integer;
begin
  select * into o from public.shop_orders where id = target_order for update;
  if o.status not in ('pending', 'countered') then raise exception 'Invalid state' using errcode = 'P0001'; end if;
  for ln in select * from public.shop_order_lines where order_id = o.id order by definition_id loop
    price := coalesce(ln.countered_price, ln.offered_price, ln.unit_price);
    if o.kind = 'purchase' then
      select * into l from public.shop_listings where id = ln.listing_id for update;
      if l.id is null or l.archived then raise exception 'Unavailable listing' using errcode = 'P0001'; end if;
      if l.stock is not null then
        if l.stock < ln.quantity then raise exception 'Out of stock' using errcode = 'P0001'; end if;
        update public.shop_listings set stock = stock - ln.quantity, revision = revision + 1 where id = l.id;
      end if;
      perform private.shop_add_units(o.campaign_id, o.character_id, ln.definition_id, ln.quantity, 'purchase');
    else
      taken := private.shop_take_units(o.campaign_id, o.character_id, ln.definition_id, ln.quantity, false, 'sale');
      if taken < ln.quantity then raise exception 'Insufficient items' using errcode = 'P0001'; end if;
      update public.shop_listings set stock = least(9999, stock + ln.quantity), revision = revision + 1
        where shop_id = o.shop_id and definition_id = ln.definition_id and not archived and stock is not null;
    end if;
    update public.shop_order_lines set final_price = price where id = ln.id;
    sum_total := sum_total + price::bigint * ln.quantity;
  end loop;
  perform private.move_gold(o.campaign_id, o.character_id,
    case when o.kind = 'purchase' then -sum_total else sum_total end);
  update public.shop_orders set status = 'completed', total = sum_total, closed_at = now(),
    closed_by = auth.uid(), updated_at = now() where id = o.id;
end;
$$;

create function private.order_total(target_order uuid) returns bigint
language plpgsql stable security definer set search_path = '' as $$
begin
  return coalesce((select sum(coalesce(countered_price, offered_price, unit_price)::bigint * quantity)
    from public.shop_order_lines where order_id = target_order), 0);
end;
$$;

create function private.order_result(target_order uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare o public.shop_orders;
begin
  select * into o from public.shop_orders where id = target_order;
  return jsonb_build_object('order_id', o.id, 'status', o.status, 'total', o.total, 'refunded', o.refunded,
    'gold', (select r.gold from public.character_resources r where r.character_id = o.character_id));
end;
$$;

-- What Players may know about an item: never the DM-only value_gp.
create function private.shop_item_json(target_definition uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return (select jsonb_build_object('id', d.id, 'name', d.name, 'category', d.category, 'icon', d.icon,
      'rarity', d.rarity, 'weight_tenths', d.weight_tenths, 'description', d.description,
      'slot_kind', d.slot_kind, 'properties', d.properties)
    from public.item_definitions d where d.id = target_definition);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads

-- What one character sees. A DM previewing a Player calls it with that Player's character.
create function public.get_storefront(target_campaign uuid, target_character uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if target_character is null or not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'character_id', target_character,
    'gold', (select r.gold from public.character_resources r
      where r.campaign_id = target_campaign and r.character_id = target_character),
    'shops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name,
        'description', s.description, 'mode', s.mode, 'is_open', s.is_open,
        'resale_percent', s.resale_percent, 'modifier', private.shop_modifier(s.id, target_character),
        -- Server resale quote for each sellable (dm/shop) item the character holds.
        'buyback', coalesce((select jsonb_object_agg(owned.definition_id,
            private.resale_price(s.id, owned.definition_id))
          from (select distinct i.definition_id from public.inventory_items i
            where i.campaign_id = target_campaign and i.character_id = target_character
              and i.quantity > 0 and i.source in ('dm', 'shop')) owned), '{}'::jsonb),
        'listings', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'price', l.price,
            'unit_price', private.modified_price(l.price, private.shop_modifier(s.id, target_character)),
            'stock', l.stock, 'exclusive', l.visibility = 'selected',
            'item', private.shop_item_json(l.definition_id)) order by d.category, d.name)
          from public.shop_listings l join public.item_definitions d on d.id = l.definition_id
          where l.shop_id = s.id and private.listing_visible(l.id, target_character)), '[]'::jsonb))
        order by s.name)
      from public.shops s where s.campaign_id = target_campaign
        and private.shop_visible(s.id, target_character)), '[]'::jsonb));
end;
$$;

create function public.get_shop_admin(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'characters', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'gold', r.gold) order by c.created_at)
      from public.characters c left join public.character_resources r on r.character_id = c.id
      where c.campaign_id = target_campaign), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(private.shop_item_json(d.id)
        || jsonb_build_object('value_gp', d.value_gp, 'origin', d.origin) order by d.name)
      from public.item_definitions d
      where d.campaign_id = target_campaign and not d.archived and d.origin <> 'player'), '[]'::jsonb),
    'shops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name,
        'description', s.description, 'visibility', s.visibility, 'mode', s.mode,
        'resale_percent', s.resale_percent, 'is_open', s.is_open, 'revision', s.revision,
        'access', coalesce((select jsonb_agg(a.character_id) from public.shop_access a where a.shop_id = s.id), '[]'::jsonb),
        'modifiers', coalesce((select jsonb_agg(jsonb_build_object('character_id', m.character_id,
            'percent', m.percent)) from public.shop_modifiers m where m.shop_id = s.id), '[]'::jsonb),
        'listings', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'definition_id', l.definition_id,
            'price', l.price, 'stock', l.stock, 'visibility', l.visibility, 'revision', l.revision,
            'access', coalesce((select jsonb_agg(a.character_id) from public.listing_access a
              where a.listing_id = l.id), '[]'::jsonb)) order by d.category, d.name)
          from public.shop_listings l join public.item_definitions d on d.id = l.definition_id
          where l.shop_id = s.id and not l.archived), '[]'::jsonb)) order by s.name)
      from public.shops s where s.campaign_id = target_campaign and not s.archived), '[]'::jsonb),
    'pending_orders', (select count(*) from public.shop_orders o
      where o.campaign_id = target_campaign and o.status = 'pending'));
end;
$$;

-- DMs read the whole ledger (optionally one character); Players only their character's.
create function public.list_shop_orders(target_campaign uuid, target_character uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if target_character is null then
    if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  elsif not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x.o order by x.created_at desc) from (
    select o.created_at, jsonb_build_object('id', o.id, 'kind', o.kind, 'status', o.status,
      'total', o.total, 'refunded', o.refunded, 'player_note', o.player_note, 'dm_note', o.dm_note,
      'created_at', o.created_at, 'updated_at', o.updated_at, 'closed_at', o.closed_at,
      'shop', jsonb_build_object('id', s.id, 'name', s.name, 'mode', s.mode),
      'character', jsonb_build_object('id', c.id, 'name', c.name),
      'lines', (select jsonb_agg(jsonb_build_object('id', ln.id, 'definition_id', ln.definition_id,
          'item_name', d.name, 'icon', d.icon, 'quantity', ln.quantity, 'unit_price', ln.unit_price,
          'offered_price', ln.offered_price, 'countered_price', ln.countered_price,
          'final_price', ln.final_price, 'reverted_quantity', ln.reverted_quantity) order by d.name)
        from public.shop_order_lines ln join public.item_definitions d on d.id = ln.definition_id
        where ln.order_id = o.id)) o
    from public.shop_orders o join public.shops s on s.id = o.shop_id
      join public.characters c on c.id = o.character_id
    where o.campaign_id = target_campaign
      and (target_character is null or o.character_id = target_character)
    order by o.created_at desc limit 200) x), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- DM shop management

create function public.save_shop(target_campaign uuid, target_shop uuid, expected_revision bigint,
  definition jsonb, request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('shop', target_campaign, target_shop, expected_revision, definition);
  prior jsonb; result uuid; current_revision bigint; access uuid[];
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return (prior->>'id')::uuid; end if;
  if definition is null or jsonb_typeof(definition) <> 'object' then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  access := private.campaign_characters(target_campaign, coalesce(definition->'access', '[]'::jsonb));
  if target_shop is null then
    insert into public.shops(campaign_id, name, description, visibility, mode, resale_percent, is_open)
      values (target_campaign, private.check_text(definition->>'name', 80, false),
        private.check_text(definition->>'description', 2000, true),
        coalesce(definition->>'visibility', 'hidden'), coalesce(definition->>'mode', 'auto'),
        coalesce((definition->>'resale_percent')::integer, 50),
        coalesce((definition->>'is_open')::boolean, true))
      returning id into result;
  else
    select revision into current_revision from public.shops
      where id = target_shop and campaign_id = target_campaign and not archived for update;
    if current_revision is null then raise exception 'Shop unavailable' using errcode = '42501'; end if;
    if current_revision is distinct from expected_revision then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    update public.shops set name = private.check_text(definition->>'name', 80, false),
      description = private.check_text(definition->>'description', 2000, true),
      visibility = coalesce(definition->>'visibility', visibility), mode = coalesce(definition->>'mode', mode),
      resale_percent = coalesce((definition->>'resale_percent')::integer, resale_percent),
      is_open = coalesce((definition->>'is_open')::boolean, is_open), revision = revision + 1
      where id = target_shop;
    result := target_shop;
  end if;
  delete from public.shop_access where shop_id = result and character_id <> all(access);
  insert into public.shop_access(shop_id, campaign_id, character_id)
    select result, target_campaign, x from unnest(access) x on conflict do nothing;
  perform private.inventory_finish(request_id, payload, jsonb_build_object('id', result));
  return result;
end;
$$;

create function public.archive_shop(target_campaign uuid, target_shop uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.shop_lock(target_campaign, true, null);
  if exists (select 1 from public.shop_orders where shop_id = target_shop and status in ('pending', 'countered')) then
    raise exception 'Open orders' using errcode = 'P0001'; end if;
  update public.shops set archived = true, revision = revision + 1
    where id = target_shop and campaign_id = target_campaign and not archived;
end;
$$;

create function public.save_listing(target_campaign uuid, target_shop uuid, target_listing uuid,
  expected_revision bigint, definition jsonb, request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('listing', target_campaign, target_shop, target_listing,
    expected_revision, definition);
  prior jsonb; result uuid; current_revision bigint; access uuid[]; target_definition uuid;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return (prior->>'id')::uuid; end if;
  if definition is null or jsonb_typeof(definition) <> 'object' or not exists (
      select 1 from public.shops where id = target_shop and campaign_id = target_campaign and not archived) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  access := private.campaign_characters(target_campaign, coalesce(definition->'access', '[]'::jsonb));
  if target_listing is null then
    target_definition := (definition->>'definition_id')::uuid;
    -- Player-made definitions carry no price and never enter the economy (ADR 014).
    if not exists (select 1 from public.item_definitions where id = target_definition
        and campaign_id = target_campaign and not archived and origin <> 'player') then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    insert into public.shop_listings(campaign_id, shop_id, definition_id, price, stock, visibility)
      values (target_campaign, target_shop, target_definition,
        coalesce((definition->>'price')::integer,
          (select coalesce(value_gp, 0) from public.item_definitions where id = target_definition)),
        (definition->>'stock')::integer, coalesce(definition->>'visibility', 'shop'))
      returning id into result;
  else
    select revision into current_revision from public.shop_listings
      where id = target_listing and shop_id = target_shop and not archived for update;
    if current_revision is null then raise exception 'Listing unavailable' using errcode = '42501'; end if;
    if current_revision is distinct from expected_revision then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    update public.shop_listings set price = coalesce((definition->>'price')::integer, price),
      stock = (definition->>'stock')::integer, visibility = coalesce(definition->>'visibility', visibility),
      revision = revision + 1 where id = target_listing;
    result := target_listing;
  end if;
  delete from public.listing_access where listing_id = result and character_id <> all(access);
  insert into public.listing_access(listing_id, campaign_id, character_id)
    select result, target_campaign, x from unnest(access) x on conflict do nothing;
  perform private.inventory_finish(request_id, payload, jsonb_build_object('id', result));
  return result;
end;
$$;

create function public.archive_listing(target_campaign uuid, target_listing uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.shop_lock(target_campaign, true, null);
  update public.shop_listings set archived = true, revision = revision + 1
    where id = target_listing and campaign_id = target_campaign and not archived;
end;
$$;

-- Absolute value: retries are naturally idempotent; 0 removes the modifier.
create function public.set_shop_modifier(target_campaign uuid, target_shop uuid,
  target_character uuid, new_percent integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.shop_lock(target_campaign, true, null);
  if new_percent is null or new_percent not between -100 and 100 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if new_percent = 0 then
    delete from public.shop_modifiers where shop_id = target_shop and character_id = target_character;
  else
    insert into public.shop_modifiers(shop_id, campaign_id, character_id, percent)
      values (target_shop, target_campaign, target_character, new_percent)
      on conflict (shop_id, character_id) do update set percent = excluded.percent;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Commerce

-- Cart checkout: one order with many lines. Prices are always recomputed on the server.
-- Auto shops complete immediately; approval shops leave a pending request (nothing moves).
create function public.checkout(target_campaign uuid, target_shop uuid, target_character uuid,
  order_lines jsonb, note text, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('checkout', target_campaign, target_shop, target_character, order_lines, note);
  prior jsonb; shop public.shops; l public.shop_listings; line jsonb; qty integer; offered integer;
  modifier integer; new_order uuid;
begin
  perform private.shop_lock(target_campaign, false, target_character);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  select * into shop from public.shops where id = target_shop and campaign_id = target_campaign;
  if shop.id is null or not private.shop_visible(shop.id, target_character) then
    raise exception 'Unavailable shop' using errcode = '42501'; end if;
  if not shop.is_open then raise exception 'Shop closed' using errcode = 'P0001'; end if;
  if order_lines is null or jsonb_typeof(order_lines) <> 'array'
    or jsonb_array_length(order_lines) not between 1 and 50 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  modifier := private.shop_modifier(shop.id, target_character);
  insert into public.shop_orders(campaign_id, shop_id, character_id, actor_id, kind, status, player_note)
    values (target_campaign, shop.id, target_character, auth.uid(), 'purchase', 'pending',
      private.check_text(note, 500, true))
    returning id into new_order;
  for line in select * from jsonb_array_elements(order_lines) loop
    qty := (line->>'quantity')::integer;
    offered := nullif(line->>'offered_price', '')::integer;
    if qty is null or qty not between 1 and 999 or offered < 0 then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    select * into l from public.shop_listings
      where id = (line->>'listing_id')::uuid and shop_id = shop.id and not archived;
    if l.id is null or not private.listing_visible(l.id, target_character) then
      raise exception 'Unavailable listing' using errcode = 'P0001'; end if;
    insert into public.shop_order_lines(campaign_id, order_id, listing_id, definition_id, quantity,
        unit_price, offered_price)
      values (target_campaign, new_order, l.id, l.definition_id, qty, private.modified_price(l.price, modifier),
        case when shop.mode = 'approval' then offered end);
  end loop;
  update public.shop_orders set total = private.order_total(new_order) where id = new_order;
  if shop.mode = 'auto' then perform private.complete_order(new_order); end if;
  return private.inventory_finish(request_id, payload, private.order_result(new_order));
end;
$$;

-- Sell loose dm/shop-sourced units to a visible shop that buys (resale_percent > 0).
create function public.sell_to_shop(target_campaign uuid, target_shop uuid, target_character uuid,
  order_lines jsonb, note text, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('sell', target_campaign, target_shop, target_character, order_lines, note);
  prior jsonb; shop public.shops; line jsonb; qty integer; offered integer; target_definition uuid;
  new_order uuid;
begin
  perform private.shop_lock(target_campaign, false, target_character);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  select * into shop from public.shops where id = target_shop and campaign_id = target_campaign;
  if shop.id is null or not private.shop_visible(shop.id, target_character) then
    raise exception 'Unavailable shop' using errcode = '42501'; end if;
  if not shop.is_open then raise exception 'Shop closed' using errcode = 'P0001'; end if;
  if shop.resale_percent = 0 then raise exception 'Shop does not buy' using errcode = 'P0001'; end if;
  if order_lines is null or jsonb_typeof(order_lines) <> 'array'
    or jsonb_array_length(order_lines) not between 1 and 50 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  insert into public.shop_orders(campaign_id, shop_id, character_id, actor_id, kind, status, player_note)
    values (target_campaign, shop.id, target_character, auth.uid(), 'sale', 'pending',
      private.check_text(note, 500, true))
    returning id into new_order;
  for line in select * from jsonb_array_elements(order_lines) loop
    qty := (line->>'quantity')::integer;
    offered := nullif(line->>'offered_price', '')::integer;
    target_definition := (line->>'definition_id')::uuid;
    if qty is null or qty not between 1 and 999 or offered < 0 then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    if coalesce((select sum(quantity) from public.inventory_items where campaign_id = target_campaign
        and character_id = target_character and definition_id = target_definition
        and source in ('dm', 'shop') and equipped_slot is null), 0) < qty then
      raise exception 'Insufficient items' using errcode = 'P0001'; end if;
    insert into public.shop_order_lines(campaign_id, order_id, definition_id, quantity, unit_price, offered_price)
      values (target_campaign, new_order, target_definition, qty, private.resale_price(shop.id, target_definition),
        case when shop.mode = 'approval' then offered end);
  end loop;
  update public.shop_orders set total = private.order_total(new_order) where id = new_order;
  if shop.mode = 'auto' then perform private.complete_order(new_order); end if;
  return private.inventory_finish(request_id, payload, private.order_result(new_order));
end;
$$;

-- DM decision on a pending request: approve (offer or list price), reject, or counter per line.
create function public.respond_order(target_campaign uuid, target_order uuid, decision text,
  line_prices jsonb, note text, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('respond', target_campaign, target_order, decision, line_prices, note);
  prior jsonb; o public.shop_orders; entry jsonb;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  select * into o from public.shop_orders where id = target_order and campaign_id = target_campaign for update;
  if o.id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  update public.shop_orders set dm_note = private.check_text(note, 500, true), updated_at = now() where id = o.id;
  if decision = 'approve' and o.status = 'pending' then
    perform private.complete_order(o.id);
  elsif decision = 'reject' and o.status in ('pending', 'countered') then
    update public.shop_orders set status = 'rejected', closed_at = now(), closed_by = auth.uid() where id = o.id;
  elsif decision = 'counter' and o.status = 'pending' then
    if line_prices is null or jsonb_typeof(line_prices) <> 'array' then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    for entry in select * from jsonb_array_elements(line_prices) loop
      if (entry->>'price')::integer < 0 then raise exception 'Invalid request' using errcode = '22023'; end if;
      update public.shop_order_lines set countered_price = (entry->>'price')::integer
        where id = (entry->>'line_id')::uuid and order_id = o.id;
    end loop;
    update public.shop_order_lines set countered_price = coalesce(offered_price, unit_price)
      where order_id = o.id and countered_price is null;
    update public.shop_orders set status = 'countered', total = private.order_total(o.id) where id = o.id;
  else
    raise exception 'Invalid state' using errcode = 'P0001';
  end if;
  return private.inventory_finish(request_id, payload, private.order_result(o.id));
end;
$$;

-- The Player (or a DM on their behalf) accepts or declines a counter-offer.
create function public.answer_counter_offer(target_campaign uuid, target_order uuid, accept boolean,
  request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('answer', target_campaign, target_order, accept);
  prior jsonb; o public.shop_orders;
begin
  select * into o from public.shop_orders where id = target_order and campaign_id = target_campaign;
  perform private.shop_lock(target_campaign, false, o.character_id);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  select * into o from public.shop_orders where id = target_order for update;
  if o.status <> 'countered' or accept is null then raise exception 'Invalid state' using errcode = 'P0001'; end if;
  if accept then perform private.complete_order(o.id);
  else update public.shop_orders set status = 'cancelled', closed_at = now(), closed_by = auth.uid(),
    updated_at = now() where id = o.id;
  end if;
  return private.inventory_finish(request_id, payload, private.order_result(o.id));
end;
$$;

create function public.cancel_order(target_campaign uuid, target_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.shop_orders;
begin
  select * into o from public.shop_orders where id = target_order and campaign_id = target_campaign;
  perform private.shop_lock(target_campaign, false, o.character_id);
  select * into o from public.shop_orders where id = target_order for update;
  if o.status = 'cancelled' then return; end if;
  if o.status not in ('pending', 'countered') then raise exception 'Invalid state' using errcode = 'P0001'; end if;
  update public.shop_orders set status = 'cancelled', closed_at = now(), closed_by = auth.uid(),
    updated_at = now() where id = o.id;
end;
$$;

-- DM revert of a completed order. Purchases: take back the shop units still owned
-- (unequipping them), refund their final price and restock limited listings. Sales: return
-- the items and recover the paid gold (rejected if the character no longer has it).
create function public.revert_order(target_campaign uuid, target_order uuid, note text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('revert', target_campaign, target_order, note);
  prior jsonb; o public.shop_orders; ln record; taken integer; refund bigint := 0;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  select * into o from public.shop_orders where id = target_order and campaign_id = target_campaign for update;
  if o.id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  if o.status <> 'completed' then raise exception 'Invalid state' using errcode = 'P0001'; end if;
  for ln in select * from public.shop_order_lines where order_id = o.id order by definition_id loop
    if o.kind = 'purchase' then
      taken := private.shop_take_units(o.campaign_id, o.character_id, ln.definition_id,
        ln.quantity - ln.reverted_quantity, true, 'revert');
      if taken > 0 then
        update public.shop_listings set stock = least(9999, stock + taken), revision = revision + 1
          where id = ln.listing_id and not archived and stock is not null;
      end if;
    else
      taken := ln.quantity;
      perform private.shop_add_units(o.campaign_id, o.character_id, ln.definition_id, taken, 'revert');
      update public.shop_listings set stock = greatest(0, stock - taken), revision = revision + 1
        where shop_id = o.shop_id and definition_id = ln.definition_id and not archived and stock is not null;
    end if;
    update public.shop_order_lines set reverted_quantity = reverted_quantity + taken where id = ln.id;
    refund := refund + taken::bigint * ln.final_price;
  end loop;
  perform private.move_gold(o.campaign_id, o.character_id, case when o.kind = 'purchase' then refund else -refund end);
  update public.shop_orders set status = 'reverted', refunded = refund, updated_at = now(),
    closed_by = auth.uid(), dm_note = case when coalesce(trim(note), '') = '' then dm_note
      else private.check_text(note, 500, true) end
    where id = o.id;
  return private.inventory_finish(request_id, payload, private.order_result(o.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: helpers are private; only the RPC surface is executable by signed-in users.

revoke all on function
  private.shop_claim(uuid, jsonb), private.shop_lock(uuid, boolean, uuid),
  private.shop_visible(uuid, uuid), private.listing_visible(uuid, uuid),
  private.modified_price(integer, integer), private.shop_modifier(uuid, uuid), private.resale_price(uuid, uuid),
  private.move_gold(uuid, uuid, bigint),
  private.shop_add_units(uuid, uuid, uuid, integer, text),
  private.shop_take_units(uuid, uuid, uuid, integer, boolean, text),
  private.check_text(text, integer, boolean), private.campaign_characters(uuid, jsonb),
  private.complete_order(uuid), private.order_total(uuid), private.order_result(uuid),
  private.shop_item_json(uuid)
  from public, anon, authenticated;

revoke all on function
  public.get_storefront(uuid, uuid), public.get_shop_admin(uuid), public.list_shop_orders(uuid, uuid),
  public.save_shop(uuid, uuid, bigint, jsonb, uuid), public.archive_shop(uuid, uuid),
  public.save_listing(uuid, uuid, uuid, bigint, jsonb, uuid), public.archive_listing(uuid, uuid),
  public.set_shop_modifier(uuid, uuid, uuid, integer),
  public.checkout(uuid, uuid, uuid, jsonb, text, uuid), public.sell_to_shop(uuid, uuid, uuid, jsonb, text, uuid),
  public.respond_order(uuid, uuid, text, jsonb, text, uuid), public.answer_counter_offer(uuid, uuid, boolean, uuid),
  public.cancel_order(uuid, uuid), public.revert_order(uuid, uuid, text, uuid)
  from public, anon;
grant execute on function
  public.get_storefront(uuid, uuid), public.get_shop_admin(uuid), public.list_shop_orders(uuid, uuid),
  public.save_shop(uuid, uuid, bigint, jsonb, uuid), public.archive_shop(uuid, uuid),
  public.save_listing(uuid, uuid, uuid, bigint, jsonb, uuid), public.archive_listing(uuid, uuid),
  public.set_shop_modifier(uuid, uuid, uuid, integer),
  public.checkout(uuid, uuid, uuid, jsonb, text, uuid), public.sell_to_shop(uuid, uuid, uuid, jsonb, text, uuid),
  public.respond_order(uuid, uuid, text, jsonb, text, uuid), public.answer_counter_offer(uuid, uuid, boolean, uuid),
  public.cancel_order(uuid, uuid), public.revert_order(uuid, uuid, text, uuid)
  to authenticated;

comment on table public.shops is 'RYT-005 merchants with visibility, purchase mode and resale rate. RPC reads/writes only.';
comment on table public.shop_listings is 'RYT-005 shop stock over RYT-004 item definitions; price and optional limited stock.';
comment on table public.shop_orders is 'RYT-005 purchase/sale ledger with approval, counter-offer and revert states.';
