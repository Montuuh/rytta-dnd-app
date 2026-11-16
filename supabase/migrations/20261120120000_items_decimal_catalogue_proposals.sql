-- RYT-104, RYT-105 and RYT-107 (part 1 of 2): additive and backward compatible.
--
-- Money. Every amount of gold is gp with two decimals (0.01 gp = 1 cp), stored as numeric(12,2):
-- character_resources.gold, item_definitions.value_gp, shop_listings.price, shop_orders.total and
-- refunded, shop_order_lines.unit_price, offered_price, countered_price and final_price, and
-- trades.initiator_gold and partner_gold. The columns change type in place (no data changes; whole
-- values stay whole) and keep their checks. The accepted precision is private.money_scale(): 0 in
-- this file, so every RPC refuses a fractional amount and the deployed frontend, which parses
-- integers, never receives one; part 2 (20261121120000) sets it to 2. RPCs accept JSON numbers or
-- numeric strings and refuse more precision than the scale, negative amounts and values over the
-- column limit ('Invalid request', detail 'amount'); nothing is rounded silently.
-- set_character_resources, set_trade_offer and sync_listing_prices keep their argument names; only
-- the money argument becomes numeric. Derived prices follow the same scale: the per-character
-- shop modifier rounds half up and the resale quote rounds down (whole gold now, 0.01 gp after
-- part 2). import_basic_items raises 'Invalid item N' (detail 'amount') for a cent price until
-- part 2 runs; the catalogue import ships with the frontend that releases with part 2.
--
-- Weight. item_definitions.weight_lb numeric(9,3) is the source of truth (0..10000 lb). The
-- legacy weight_tenths column stays and a trigger keeps it equal to round(weight_lb * 10); a write
-- that only changes weight_tenths sets weight_lb = weight_tenths / 10. RPC drafts accept weight_lb
-- (three decimals) or the legacy weight_tenths. kg is presentation only (1 lb = 0.5 kg).
--
-- Items. item_definitions gains translations ({"en"|"es": {"name", "description"}}, optional, the
-- same length limits as name and description; name/description stay the original and fallback),
-- basic_key (catalogue key, unique per campaign when set) and is_template. properties now validate
-- the new optional keys mastery (text <= 40), rations and water (0..100 with one decimal, the
-- supplies one unit gives when used; the integer counters receive floor(quantity x value)) and container ({capacityLb 0..10000, loadReductionPercent integer 0..90});
-- other keys keep their previous free shape. A Player-origin definition may now carry a price set
-- by the DM (accepted proposals); Players still never send one.
--
-- New RPCs: import_basic_items, set_item_template, search_campaign_items, propose_item,
-- list_item_proposals, cancel_item_proposal, resolve_item_proposal, merge_item_definitions,
-- set_shop_image and add_listings. use_item on a consumable with rations or water from a dm or
-- shop stack (never a Player-sourced one) adds them to character_resources in the same
-- transaction; undo_inventory_event removes exactly what was added, or raises 'Undo conflict' when
-- the counters no longer hold it. grant_item also lets a Player add a basic catalogue item (basic_key set) to their own
-- character as a source = 'player' stack. Shops gain kind and image_path (private shop-images
-- bucket). Every read that returns definitions also returns translations and weight_lb.
--
-- Actor matrix (new and changed RPCs):
--   anon: no execute on any function.
--   outsider / inactive member / DM of another campaign: Forbidden (or the campaign's rows are
--           simply not found through their own campaign); storage objects refused.
--   Player: search_campaign_items (basic items, own creations and items their characters carry;
--           value_gp only for basic items); propose_item, list_item_proposals and
--           cancel_item_proposal for their own characters (cancel: own pending proposals only);
--           grant_item of basic items to their own character; use/undo as before; reads the image of
--           a shop one of their characters can see. Every other new RPC: Forbidden.
--   campaign DM: everything above for the campaign, plus import, templates, proposal resolution,
--           merges, shop images and bulk listings.
-- Every write locks the campaign row first, authorizes with auth.uid(), checks revisions where a
-- row is edited and records actor, payload and result in private.inventory_requests, so a retry
-- with the same request id replays and a different payload is refused.
--
-- Environments: this file runs on production (public / private). A PRE (pre / pre_private) that
-- predates it receives the same DDL remapped with pre_admin.remap. The storage router and bucket
-- are global and stay outside the remapped DDL. Apply to PRE first, validate, then production.
-- Locks: the type changes rewrite character_resources, item_definitions, shop_listings,
-- shop_orders, shop_order_lines and trades under ACCESS EXCLUSIVE locks (small campaign tables).

do $m1$
declare ddl text := $ddl$
-- ---------------------------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------------------------
-- The type changes below take ACCESS EXCLUSIVE locks; give up quickly instead of queueing
-- behind (and in front of) live requests.
set local lock_timeout = '5s';

do $guard$
begin
  if exists (select 1 from public.character_resources where gold > 9999999999.99)
      or exists (select 1 from public.shop_orders where total > 9999999999.99 or refunded > 9999999999.99)
      or exists (select 1 from public.trades where initiator_gold > 9999999999.99 or partner_gold > 9999999999.99) then
    raise exception 'Existing amounts exceed numeric(12,2); resolve them before this migration';
  end if;
end;
$guard$;

alter table public.character_resources alter column gold type numeric(12,2);
alter table public.item_definitions alter column value_gp type numeric(12,2);
alter table public.shop_listings alter column price type numeric(12,2);
alter table public.shop_orders alter column total type numeric(12,2), alter column refunded type numeric(12,2);
alter table public.shop_order_lines alter column unit_price type numeric(12,2),
  alter column offered_price type numeric(12,2), alter column countered_price type numeric(12,2),
  alter column final_price type numeric(12,2);
alter table public.trades alter column initiator_gold type numeric(12,2),
  alter column partner_gold type numeric(12,2);
comment on column public.character_resources.gold is 'Gold in gp with two decimals (0.01 gp = 1 cp). RPC writes only.';

-- The DM may price a Player-origin definition (accepted proposals); Players never send a price.
do $price_check$
declare con text;
begin
  for con in select c.conname from pg_constraint c
      where c.conrelid = 'public.item_definitions'::regclass and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%origin <> ''player''%value_gp IS NULL%' loop
    execute format('alter table public.item_definitions drop constraint %I', con);
  end loop;
end;
$price_check$;
alter table public.item_definitions
  add column if not exists weight_lb numeric(9,3) not null default 0,
  add column if not exists translations jsonb,
  add column if not exists basic_key text,
  add column if not exists is_template boolean not null default false;
update public.item_definitions set weight_lb = weight_tenths / 10.0 where weight_lb <> weight_tenths / 10.0;
alter table public.item_definitions
  add constraint item_definitions_weight_lb_check check (weight_lb between 0 and 10000),
  add constraint item_definitions_translations_check check (translations is null
    or (jsonb_typeof(translations) = 'object' and pg_column_size(translations) <= 8192)),
  add constraint item_definitions_basic_key_check check (basic_key is null
    or basic_key ~ '^[a-z][A-Za-z0-9_-]{0,79}$');
create unique index if not exists item_definitions_basic_key on public.item_definitions(campaign_id, basic_key)
  where basic_key is not null;
comment on column public.item_definitions.weight_lb is 'Weight of one unit in lb (three decimals); source of truth.';
comment on column public.item_definitions.weight_tenths is 'Legacy weight in tenths of a lb, kept equal to round(weight_lb * 10) by trigger.';
comment on column public.item_definitions.translations is 'Optional {"en"|"es": {"name","description"}}; name/description stay the fallback.';
comment on column public.item_definitions.basic_key is 'Basic catalogue key (import_basic_items); unique per campaign.';

create or replace function private.item_weight_sync() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if tg_op = 'INSERT' then
    if new.weight_lb = 0 and new.weight_tenths <> 0 then new.weight_lb := new.weight_tenths / 10.0; end if;
  elsif new.weight_lb is not distinct from old.weight_lb and new.weight_tenths is distinct from old.weight_tenths then
    new.weight_lb := new.weight_tenths / 10.0;
  end if;
  new.weight_tenths := round(new.weight_lb * 10)::integer;
  return new;
end;
$fn$;
revoke all on function private.item_weight_sync() from public, anon, authenticated;
drop trigger if exists item_definitions_weight on public.item_definitions;
create trigger item_definitions_weight before insert or update on public.item_definitions
  for each row execute function private.item_weight_sync();

alter table public.inventory_events drop constraint inventory_events_kind_check;
alter table public.inventory_events add constraint inventory_events_kind_check check (kind in
  ('grant', 'remove', 'use', 'equip', 'unequip', 'undo', 'purchase', 'sale', 'revert',
   'trade_in', 'trade_out', 'merge')) not valid;
alter table public.inventory_events validate constraint inventory_events_kind_check;

alter table public.shops
  add column if not exists kind text check (kind is null or char_length(kind) between 1 and 40),
  add column if not exists image_path text check (image_path is null or image_path ~
    '^(public|pre)/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](webp|png|jpg)$');
comment on column public.shops.kind is 'Shop archetype key chosen by the DM (free text, 1..40).';
comment on column public.shops.image_path is 'Private shop-images object {env}/{campaign}/{shop}/{uuid}.{ext}.';

create table public.item_proposals (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null,
  proposed_by uuid not null references auth.users(id),
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) <= 16384),
  quantity integer not null check (quantity between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'merged', 'rejected', 'cancelled')),
  dm_note text not null default '' check (char_length(dm_note) <= 500),
  resolved_definition_id uuid,
  resolved_by uuid references auth.users(id),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (campaign_id, id),
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade,
  foreign key (campaign_id, resolved_definition_id) references public.item_definitions(campaign_id, id),
  check ((status in ('accepted', 'merged')) = (resolved_definition_id is not null))
);
create index item_proposals_campaign on public.item_proposals(campaign_id, status, created_at desc);
create index item_proposals_character on public.item_proposals(character_id, status);
alter table public.item_proposals enable row level security;
revoke all on public.item_proposals from public, anon, authenticated;
comment on table public.item_proposals is
  'RYT-105 item proposals for DM review. No client grants: read through list_item_proposals, written by RPCs.';

-- ---------------------------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------------------------
-- Decimals of gp the economy accepts and derives. Part 1: 0 (whole gold, what the deployed
-- frontend parses); part 2: 2 (0.01 gp = 1 cp). Every money input and derived price follows it.
create or replace function private.money_scale() returns integer
language plpgsql stable set search_path = '' as $fn$
begin
  return 0;
end;
$fn$;

-- A JSON amount of gp: number or numeric string, 0..max_value, at most money_scale() decimals.
-- Null stays null.
create or replace function private.money_value(value jsonb, max_value numeric) returns numeric
language plpgsql stable set search_path = '' as $fn$
declare amount numeric;
begin
  if value is null or jsonb_typeof(value) = 'null' then return null; end if;
  if jsonb_typeof(value) not in ('number', 'string') then
    raise exception 'Invalid request' using errcode = '22023', detail = 'amount'; end if;
  begin
    amount := (value #>> '{}')::numeric;
  exception when others then
    raise exception 'Invalid request' using errcode = '22023', detail = 'amount';
  end;
  return private.money_arg(amount, max_value);
end;
$fn$;

create or replace function private.money_arg(amount numeric, max_value numeric) returns numeric
language plpgsql stable set search_path = '' as $fn$
declare scale integer := private.money_scale();
begin
  if amount is null then return null; end if;
  if amount = 'NaN'::numeric or amount < 0 or amount > max_value or amount <> round(amount, scale) then
    raise exception 'Invalid request' using errcode = '22023', detail = 'amount'; end if;
  return round(amount, scale);
end;
$fn$;

-- Derived prices at money_scale(): the shop modifier rounds half up, resale rounds down.
create or replace function private.price_round(amount numeric) returns numeric
language plpgsql stable set search_path = '' as $fn$
begin
  return round(amount, private.money_scale());
end;
$fn$;

create or replace function private.resale_round(amount numeric) returns numeric
language plpgsql stable set search_path = '' as $fn$
begin
  return trunc(amount, private.money_scale());
end;
$fn$;

-- Whether Players may still create, edit and grant their own definitions. Part 2 closes it.
create or replace function private.items_player_authoring() returns boolean
language plpgsql stable set search_path = '' as $fn$
begin
  return true;
end;
$fn$;

-- Weight of one unit in lb from a draft: weight_lb (three decimals) or legacy weight_tenths.
create or replace function private.item_weight_lb(item jsonb) returns numeric
language plpgsql immutable set search_path = '' as $fn$
declare lb numeric;
begin
  begin
    if item ? 'weight_lb' and jsonb_typeof(item -> 'weight_lb') <> 'null' then
      lb := (item ->> 'weight_lb')::numeric;
      if jsonb_typeof(item -> 'weight_lb') not in ('number', 'string') or lb <> round(lb, 3) then
        raise exception 'bad'; end if;
    elsif item ? 'weight_tenths' and jsonb_typeof(item -> 'weight_tenths') <> 'null' then
      lb := (item ->> 'weight_tenths')::integer / 10.0;
    else
      lb := 0;
    end if;
  exception when others then
    raise exception 'Invalid request' using errcode = '22023', detail = 'weight';
  end;
  if lb = 'NaN'::numeric or lb < 0 or lb > 10000 then
    raise exception 'Invalid request' using errcode = '22023', detail = 'weight'; end if;
  return round(lb, 3);
end;
$fn$;

-- Optional translations: {"en"|"es": {"name": 1..100 trimmed, "description": <= 2000}}.
-- Null or {} is stored as null.
create or replace function private.item_translations(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $fn$
declare lang text; entry jsonb; result jsonb := '{}'::jsonb; label text; body text;
begin
  if value is null or jsonb_typeof(value) = 'null' then return null; end if;
  if jsonb_typeof(value) <> 'object' then
    raise exception 'Invalid request' using errcode = '22023', detail = 'translations'; end if;
  for lang, entry in select e.key, e.value from jsonb_each(value) e loop
    if lang not in ('en', 'es') or jsonb_typeof(entry) <> 'object'
        or exists (select 1 from jsonb_object_keys(entry) k where k not in ('name', 'description'))
        or jsonb_typeof(entry -> 'name') is distinct from 'string'
        or (entry ? 'description' and jsonb_typeof(entry -> 'description') not in ('string', 'null')) then
      raise exception 'Invalid request' using errcode = '22023', detail = 'translations'; end if;
    label := trim(entry ->> 'name');
    body := coalesce(entry ->> 'description', '');
    if char_length(label) not between 1 and 100 or char_length(body) > 2000 then
      raise exception 'Invalid request' using errcode = '22023', detail = 'translations'; end if;
    result := result || jsonb_build_object(lang, jsonb_build_object('name', label, 'description', body));
  end loop;
  return nullif(result, '{}'::jsonb);
end;
$fn$;

-- Properties: an object of at most 4096 bytes; the RYT-104 keys are type-checked.
create or replace function private.item_properties(value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $fn$
declare box jsonb; n numeric;
begin
  if value is null or jsonb_typeof(value) = 'null' then return '{}'::jsonb; end if;
  if jsonb_typeof(value) <> 'object' or pg_column_size(value) > 4096 then
    raise exception 'Invalid request' using errcode = '22023', detail = 'properties'; end if;
  if value ? 'mastery' and (jsonb_typeof(value -> 'mastery') <> 'string'
      or char_length(trim(value ->> 'mastery')) not between 1 and 40) then
    raise exception 'Invalid request' using errcode = '22023', detail = 'properties.mastery'; end if;
  if value ? 'rations' and (jsonb_typeof(value -> 'rations') <> 'number'
      or (value ->> 'rations')::numeric not between 0 and 100
      or (value ->> 'rations')::numeric <> round((value ->> 'rations')::numeric, 1)) then
    raise exception 'Invalid request' using errcode = '22023', detail = 'properties.rations'; end if;
  if value ? 'water' and (jsonb_typeof(value -> 'water') <> 'number'
      or (value ->> 'water')::numeric not between 0 and 100
      or (value ->> 'water')::numeric <> round((value ->> 'water')::numeric, 1)) then
    raise exception 'Invalid request' using errcode = '22023', detail = 'properties.water'; end if;
  if value ? 'container' then
    box := value -> 'container';
    if jsonb_typeof(box) <> 'object'
        or exists (select 1 from jsonb_object_keys(box) k where k not in ('capacityLb', 'loadReductionPercent'))
        or jsonb_typeof(box -> 'capacityLb') is distinct from 'number'
        or jsonb_typeof(box -> 'loadReductionPercent') is distinct from 'number'
        or (box ->> 'capacityLb')::numeric not between 0 and 10000 then
      raise exception 'Invalid request' using errcode = '22023', detail = 'properties.container'; end if;
    n := (box ->> 'loadReductionPercent')::numeric;
    if n not between 0 and 90 or n <> trunc(n) then
      raise exception 'Invalid request' using errcode = '22023', detail = 'properties.container'; end if;
  end if;
  return value;
end;
$fn$;

-- The definition fields of a draft, validated and normalized (no price, origin or flags).
create or replace function private.item_draft(item jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $fn$
declare label text; body text; category text; icon text; rarity text; slot text;
begin
  if item is null or jsonb_typeof(item) <> 'object' then
    raise exception 'Invalid request' using errcode = '22023', detail = 'item'; end if;
  if jsonb_typeof(item -> 'name') is distinct from 'string'
      or (item ? 'description' and jsonb_typeof(item -> 'description') not in ('string', 'null')) then
    raise exception 'Invalid request' using errcode = '22023', detail = 'name'; end if;
  label := trim(item ->> 'name');
  body := coalesce(item ->> 'description', '');
  category := item ->> 'category';
  icon := coalesce(item ->> 'icon', 'package');
  rarity := coalesce(item ->> 'rarity', 'common');
  slot := coalesce(item ->> 'slot_kind', 'none');
  if char_length(label) not between 1 and 100 or char_length(body) > 2000
      or category is null or category not in
        ('weapon', 'armor', 'shield', 'gear', 'consumable', 'ammo', 'tool', 'treasure', 'quest')
      or icon !~ '^[a-z0-9-]{1,40}$'
      or rarity not in ('common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact')
      or slot not in ('head', 'neck', 'cloak', 'body', 'hands', 'belt', 'feet', 'ring', 'one_hand',
        'two_hands', 'shield', 'none') then
    raise exception 'Invalid request' using errcode = '22023', detail = 'item'; end if;
  -- Without translations the key is absent, so draft -> 'translations' is SQL null.
  return jsonb_strip_nulls(jsonb_build_object('translations', private.item_translations(item -> 'translations')))
    || jsonb_build_object('name', label, 'description', body, 'category', category,
      'icon', icon, 'rarity', rarity, 'slot_kind', slot,
      'properties', private.item_properties(item -> 'properties'),
      'weight_lb', private.item_weight_lb(item));
end;
$fn$;

-- Same rule as equip_item: which equipment slots a slot kind fits.
create or replace function private.slot_allows(kind text, slot text) returns boolean
language plpgsql immutable set search_path = '' as $fn$
begin
  return coalesce(case kind
    when 'ring' then slot in ('ring_1', 'ring_2')
    when 'one_hand' then slot in ('main_hand', 'off_hand')
    when 'two_hands' then slot = 'main_hand'
    when 'shield' then slot = 'off_hand'
    when 'none' then false
    else slot = kind end, false);
end;
$fn$;

revoke all on function private.money_value(jsonb, numeric), private.money_arg(numeric, numeric),
  private.money_scale(), private.price_round(numeric), private.resale_round(numeric), private.items_player_authoring(),
  private.item_weight_lb(jsonb), private.item_translations(jsonb), private.item_properties(jsonb),
  private.item_draft(jsonb), private.slot_allows(text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Money helpers and shop internals (numeric)
-- ---------------------------------------------------------------------------------------------
drop function if exists private.modified_price(integer, integer);
create or replace function private.modified_price(base numeric, percent integer) returns numeric
language plpgsql stable set search_path = '' as $fn$
begin
  if coalesce(percent, 0) = 0 then return greatest(0, base); end if;
  return greatest(0, private.price_round(base * (100 + percent) / 100.0));
end;
$fn$;

drop function if exists private.resale_price(uuid, uuid);
create or replace function private.resale_price(target_shop uuid, target_definition uuid) returns numeric
language plpgsql stable security definer set search_path = '' as $fn$
declare base numeric; pct integer;
begin
  select s.resale_percent into pct from public.shops s where s.id = target_shop;
  select coalesce((select l.price from public.shop_listings l
      where l.shop_id = target_shop and l.definition_id = target_definition and not l.archived),
    (select d.value_gp from public.item_definitions d where d.id = target_definition), 0) into base;
  return greatest(0, private.resale_round(base * coalesce(pct, 0) / 100.0));
end;
$fn$;

drop function if exists private.move_gold(uuid, uuid, bigint);
create or replace function private.move_gold(target_campaign uuid, target_character uuid, delta numeric) returns numeric
language plpgsql security definer set search_path = '' as $fn$
declare balance numeric;
begin
  select gold into balance from public.character_resources
    where campaign_id = target_campaign and character_id = target_character for update;
  if balance is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
  if balance + delta < 0 then raise exception 'Insufficient gold' using errcode = 'P0001'; end if;
  if balance + delta > 9999999999.99 then raise exception 'Gold limit' using errcode = 'P0001'; end if;
  if delta <> 0 then
    update public.character_resources set gold = gold + delta, revision = revision + 1
      where campaign_id = target_campaign and character_id = target_character;
  end if;
  return balance + delta;
end;
$fn$;

drop function if exists private.order_total(uuid);
create or replace function private.order_total(target_order uuid) returns numeric
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return coalesce((select sum(coalesce(countered_price, offered_price, unit_price) * quantity)
    from public.shop_order_lines where order_id = target_order), 0);
end;
$fn$;

create or replace function private.complete_order(target_order uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
declare o public.shop_orders; ln record; l public.shop_listings; price numeric; sum_total numeric := 0; taken integer;
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
    sum_total := sum_total + price * ln.quantity;
  end loop;
  perform private.move_gold(o.campaign_id, o.character_id,
    case when o.kind = 'purchase' then -sum_total else sum_total end);
  update public.shop_orders set status = 'completed', total = sum_total, closed_at = now(),
    closed_by = auth.uid(), updated_at = now() where id = o.id;
end;
$fn$;

-- What Players may know about an item: never the DM-only value_gp.
create or replace function private.shop_item_json(target_definition uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select jsonb_build_object('id', d.id, 'name', d.name, 'category', d.category, 'icon', d.icon,
      'image_path', d.image_path, 'rarity', d.rarity, 'weight_tenths', d.weight_tenths,
      'weight_lb', d.weight_lb, 'description', d.description, 'translations', d.translations,
      'slot_kind', d.slot_kind, 'properties', d.properties)
    from public.item_definitions d where d.id = target_definition);
end;
$fn$;

revoke all on function private.modified_price(numeric, integer), private.resale_price(uuid, uuid),
  private.move_gold(uuid, uuid, numeric), private.order_total(uuid), private.complete_order(uuid),
  private.shop_item_json(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Resources and trades (money arguments become numeric; names unchanged)
-- ---------------------------------------------------------------------------------------------
drop function if exists public.set_character_resources(uuid, uuid, bigint, bigint, integer, integer, integer, uuid);
create function public.set_character_resources(target_campaign uuid, target_character uuid,
  expected_revision bigint, new_gold numeric, new_water integer, new_rations integer, new_exhaustion integer, request_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $fn$
declare current_revision bigint; payload jsonb := jsonb_build_array(target_campaign, target_character,
  expected_revision, new_gold, new_water, new_rations, new_exhaustion); prior private.resource_requests;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.resource_requests r where r.request_id = set_character_resources.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result_revision;
  end if;
  if new_gold is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  perform private.money_arg(new_gold, 9999999999.99);
  select revision into current_revision from public.character_resources
    where campaign_id = target_campaign and character_id = target_character for update;
  if current_revision is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
  if current_revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  update public.character_resources set gold = new_gold, water_units = new_water,
    rations = new_rations, exhaustion = new_exhaustion, revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character;
  insert into private.resource_requests values (request_id, auth.uid(), target_character, payload, current_revision + 1);
  return current_revision + 1;
end;
$fn$;
revoke all on function public.set_character_resources(uuid, uuid, bigint, numeric, integer, integer, integer, uuid) from public, anon;
grant execute on function public.set_character_resources(uuid, uuid, bigint, numeric, integer, integer, integer, uuid) to authenticated;

drop function if exists public.set_trade_offer(uuid, uuid, uuid, bigint, jsonb, bigint, uuid);
create function public.set_trade_offer(target_campaign uuid, target_trade uuid, acting_character uuid,
  expected_revision bigint, offer_items jsonb, offer_gold numeric, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('trade_offer', target_campaign, target_trade, acting_character,
    expected_revision, offer_items, offer_gold);
  replay jsonb; t public.trades; my_side text; entry jsonb; stack public.inventory_items; balance numeric;
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
      or offer_gold is null then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  perform private.money_arg(offer_gold, 9999999999.99);
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
  update public.trades set
      initiator_gold = case when my_side = 'initiator' then offer_gold else initiator_gold end,
      partner_gold = case when my_side = 'partner' then offer_gold else partner_gold end,
      initiator_confirmed = false, partner_confirmed = false, revision = revision + 1,
      expires_at = now() + interval '10 minutes', updated_at = now()
    where id = t.id returning * into t;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('trade_id', t.id, 'status', t.status, 'revision', t.revision));
end;
$fn$;
revoke all on function public.set_trade_offer(uuid, uuid, uuid, bigint, jsonb, numeric, uuid) from public, anon;
grant execute on function public.set_trade_offer(uuid, uuid, uuid, bigint, jsonb, numeric, uuid) to authenticated;

create or replace function private.trade_items_json(target_trade uuid, target_side text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('item_id', o.item_id, 'definition_id', d.id,
      'name', d.name, 'icon', d.icon, 'rarity', d.rarity, 'category', d.category,
      'translations', d.translations, 'quantity', o.quantity) order by d.name, o.item_id), '[]'::jsonb)
    from public.trade_offer_items o
    join public.inventory_items i on i.campaign_id = o.campaign_id and i.id = o.item_id
    join public.item_definitions d on d.campaign_id = i.campaign_id and d.id = i.definition_id
   where o.trade_id = target_trade and o.side = target_side);
end;
$fn$;
revoke all on function private.trade_items_json(uuid, text) from public, anon, authenticated;

create or replace function public.get_trade_state(target_campaign uuid, acting_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); me public.characters; active uuid; recent public.trades;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if acting_user is not null and acting_user <> viewer and not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into me from public.characters c
    where c.campaign_id = target_campaign and c.user_id = coalesce(acting_user, viewer) and c.is_active;
  if me.id is null then
    return jsonb_build_object('character', null, 'partners', '[]'::jsonb, 'items', '[]'::jsonb,
      'trade', null, 'recent', null, 'history', '[]'::jsonb);
  end if;
  select t.id into active from public.trades t
    where t.campaign_id = target_campaign and t.status in ('invited', 'open') and t.expires_at > now()
      and me.id in (t.initiator_character, t.partner_character)
    order by t.created_at desc limit 1;
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
      where c.campaign_id = target_campaign and c.user_id is not null and c.is_active and c.id <> me.id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'definition_id', d.id,
        'name', d.name, 'icon', d.icon, 'rarity', d.rarity, 'category', d.category,
        'translations', d.translations, 'quantity', i.quantity) order by d.name, i.id), '[]'::jsonb)
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
$fn$;
revoke all on function public.get_trade_state(uuid, uuid) from public, anon;
grant execute on function public.get_trade_state(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Item definitions, grants and supplies
-- ---------------------------------------------------------------------------------------------
create or replace function public.save_item_definition(target_campaign uuid, target_definition uuid,
  expected_revision bigint, item jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare req jsonb := jsonb_build_array('definition', target_campaign, target_definition, expected_revision, item);
  replay jsonb; dm boolean; current public.item_definitions; saved public.item_definitions; new_origin text;
  price numeric; draft jsonb; lb numeric;
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
  if not dm and not private.items_player_authoring() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if item is null or jsonb_typeof(item) <> 'object' then raise exception 'Invalid request' using errcode = '22023'; end if;
  price := private.money_value(item -> 'value_gp', 100000000);
  if not dm and (price is not null or coalesce(item ->> 'is_template', 'false') <> 'false') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  draft := private.item_draft(item);
  -- Supplies and containers change the economy and encumbrance: DM only.
  if not dm and (draft -> 'properties' ?| array['rations', 'water', 'container']) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  lb := (draft ->> 'weight_lb')::numeric;
  new_origin := case when not dm then 'player' when item ->> 'origin' = 'srd' then 'srd' else 'dm' end;
  if target_definition is null then
    insert into public.item_definitions(campaign_id, name, category, icon, rarity, weight_lb, value_gp,
      description, translations, slot_kind, properties, origin, is_template, created_by)
    values (target_campaign, draft ->> 'name', draft ->> 'category', draft ->> 'icon', draft ->> 'rarity',
      lb, price, draft ->> 'description', draft -> 'translations', draft ->> 'slot_kind',
      draft -> 'properties', new_origin, dm and coalesce((item ->> 'is_template')::boolean, false), auth.uid())
    returning * into saved;
  else
    select * into current from public.item_definitions
      where campaign_id = target_campaign and id = target_definition for update;
    if current.id is null then raise exception 'Item unavailable' using errcode = '42501'; end if;
    if not dm and (current.origin <> 'player' or current.created_by is distinct from auth.uid()) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    -- Once the DM priced, granted, sold or listed it, a Player's own item is frozen for them.
    if not dm and (current.value_gp is not null
        or exists (select 1 from public.inventory_items i where i.campaign_id = target_campaign
          and i.definition_id = current.id and i.source in ('dm', 'shop'))
        or exists (select 1 from public.shop_listings l where l.campaign_id = target_campaign
          and l.definition_id = current.id and not l.archived)) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    if current.revision is distinct from expected_revision then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    -- A legacy payload that repeats the stored weight in tenths keeps the precise weight_lb.
    if not item ? 'weight_lb' and item ? 'weight_tenths'
        and (item ->> 'weight_tenths')::integer = current.weight_tenths then
      lb := current.weight_lb;
    end if;
    update public.item_definitions set name = draft ->> 'name', category = draft ->> 'category',
      icon = draft ->> 'icon', rarity = draft ->> 'rarity', weight_lb = lb,
      value_gp = case when dm then price else current.value_gp end,
      description = draft ->> 'description',
      translations = case when item ? 'translations' then draft -> 'translations' else current.translations end,
      slot_kind = draft ->> 'slot_kind', properties = draft -> 'properties',
      is_template = case when dm and item ? 'is_template' then coalesce((item ->> 'is_template')::boolean, false)
        else current.is_template end,
      archived = case when item ? 'archived' then coalesce((item ->> 'archived')::boolean, false)
        else current.archived end,
      revision = revision + 1
      where campaign_id = target_campaign and id = target_definition
      returning * into saved;
    perform private.recompute_armor_class(i.campaign_id, i.character_id) from public.inventory_items i
      where i.campaign_id = target_campaign and i.definition_id = target_definition and i.equipped_slot is not null;
  end if;
  return private.inventory_finish(request_id, req, jsonb_build_object('id', saved.id, 'revision', saved.revision));
end;
$fn$;

-- Adds units to the character's loose stack of that definition and source, with a grant event.
create or replace function private.grant_units(target_campaign uuid, target_character uuid,
  target_definition uuid, amount integer, new_source text, event_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare stack public.inventory_items; before jsonb; event_id uuid;
begin
  select * into stack from public.inventory_items
    where campaign_id = target_campaign and character_id = target_character and definition_id = target_definition
      and source = new_source and equipped_slot is null
    order by created_at limit 1 for update;
  if stack.id is null then
    insert into public.inventory_items(campaign_id, character_id, definition_id, quantity, source)
      values (target_campaign, target_character, target_definition, amount, new_source) returning * into stack;
    before := jsonb_build_object('quantity', 0, 'equipped_slot', null, 'revision', -1, 'definition_id', target_definition);
  else
    before := private.item_snapshot(stack);
    update public.inventory_items set quantity = quantity + amount, revision = revision + 1
      where id = stack.id returning * into stack;
  end if;
  insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
    before_value, after_value, request_id)
    values (target_campaign, target_character, stack.id, auth.uid(), 'grant', amount,
      before, private.item_snapshot(stack), event_request) returning id into event_id;
  return jsonb_build_object('item_id', stack.id, 'event_id', event_id, 'revision', stack.revision);
end;
$fn$;
revoke all on function private.grant_units(uuid, uuid, uuid, integer, text, uuid) from public, anon, authenticated;

create or replace function public.grant_item(target_campaign uuid, target_character uuid, target_definition uuid,
  amount integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('grant', target_campaign, target_character, target_definition, amount);
  replay jsonb; dm boolean; def public.item_definitions;
begin
  replay := private.inventory_begin(target_campaign, target_character, request_id, payload);
  if replay is not null then return replay; end if;
  if amount is null or amount < 1 or amount > 1000 then raise exception 'Invalid quantity' using errcode = '22023'; end if;
  dm := private.is_campaign_dm(target_campaign);
  select * into def from public.item_definitions where campaign_id = target_campaign and id = target_definition;
  if def.id is null or def.archived then raise exception 'Item unavailable' using errcode = '42501'; end if;
  -- Players add basic catalogue items or (until part 2) their own price-free definitions,
  -- always into player-sourced stacks that never sell.
  if not dm and def.basic_key is null and (not private.items_player_authoring()
      or def.origin <> 'player' or def.created_by is distinct from auth.uid()) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  return private.inventory_finish(request_id, payload, private.grant_units(target_campaign, target_character,
    target_definition, amount, case when dm then 'dm' else 'player' end, request_id));
end;
$fn$;

-- use_item and remove_item subtract quantity; use is limited to consumables and ammo. Using a
-- consumable from a dm or shop stack with properties.rations / properties.water adds
-- floor(quantity x value) to the character's rations / water_units (capped at the integer limit)
-- and records what was added.
create or replace function private.inventory_subtract(target_campaign uuid, target_item uuid, expected_revision bigint,
  amount integer, event_kind text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare stack public.inventory_items; before jsonb; category text; props jsonb; event_id uuid; was_equipped boolean;
  payload jsonb := jsonb_build_array(event_kind, target_campaign, target_item, expected_revision, amount);
  replay jsonb; res public.character_resources; add_rations bigint := 0; add_water bigint := 0;
  supplies jsonb; result jsonb;
begin
  select * into stack from public.inventory_items where campaign_id = target_campaign and id = target_item;
  replay := private.inventory_begin(target_campaign, stack.character_id, request_id, payload);
  if replay is not null then return replay; end if;
  select * into stack from public.inventory_items where id = target_item for update;
  if amount is null or amount < 1 then raise exception 'Invalid quantity' using errcode = '22023'; end if;
  if stack.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if stack.quantity < amount then raise exception 'Insufficient quantity' using errcode = 'P0001'; end if;
  select d.category, d.properties into category, props from public.item_definitions d
    where d.campaign_id = stack.campaign_id and d.id = stack.definition_id;
  if event_kind = 'use' and category not in ('consumable', 'ammo') then
    raise exception 'Not usable' using errcode = '22023'; end if;
  before := private.item_snapshot(stack);
  was_equipped := stack.equipped_slot is not null;
  update public.inventory_items set quantity = quantity - amount,
    equipped_slot = case when quantity - amount = 0 then null else equipped_slot end, revision = revision + 1
    where id = target_item returning * into stack;
  -- Only DM-given or bought units feed supplies; Player-sourced stacks (including self-added
  -- basic items) never mint rations or water.
  if event_kind = 'use' and category = 'consumable' and stack.source in ('dm', 'shop') then
    -- The counters are whole units: floor(quantity x value), so two 0.5 rations add 1.
    if jsonb_typeof(props -> 'rations') = 'number' then
      add_rations := floor(amount * greatest(0, least(100, (props ->> 'rations')::numeric)))::bigint; end if;
    if jsonb_typeof(props -> 'water') = 'number' then
      add_water := floor(amount * greatest(0, least(100, (props ->> 'water')::numeric)))::bigint; end if;
    if add_rations > 0 or add_water > 0 then
      select * into res from public.character_resources
        where campaign_id = stack.campaign_id and character_id = stack.character_id for update;
      if res.character_id is not null then
        add_rations := least(add_rations, 2147483647 - res.rations);
        add_water := least(add_water, 2147483647 - res.water_units);
        update public.character_resources set rations = rations + add_rations,
          water_units = water_units + add_water, revision = revision + 1
          where campaign_id = stack.campaign_id and character_id = stack.character_id;
        supplies := jsonb_build_object('rations', add_rations, 'water', add_water);
      end if;
    end if;
  end if;
  insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
    before_value, after_value, request_id)
    values (stack.campaign_id, stack.character_id, stack.id, auth.uid(), event_kind, -amount,
      before, private.item_snapshot(stack) || case when supplies is null then '{}'::jsonb else jsonb_build_object('supplies', supplies) end,
      request_id) returning id into event_id;
  if was_equipped and stack.equipped_slot is null then
    perform private.recompute_armor_class(stack.campaign_id, stack.character_id); end if;
  result := jsonb_build_object('item_id', stack.id, 'event_id', event_id, 'revision', stack.revision);
  if supplies is not null then result := result || jsonb_build_object('supplies', supplies); end if;
  return private.inventory_finish(request_id, payload, result);
end;
$fn$;
revoke all on function private.inventory_subtract(uuid, uuid, bigint, integer, text, uuid) from public, anon, authenticated;

-- Compensates one grant/use/remove event. A use that added rations or water removes the same
-- amounts; when the character already spent them the undo raises 'Undo conflict'.
create or replace function public.undo_inventory_event(target_campaign uuid, target_event uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('undo', target_campaign, target_event);
  replay jsonb; original public.inventory_events; stack public.inventory_items; before jsonb; event_id uuid;
  res public.character_resources; take_rations bigint := 0; take_water bigint := 0; supplies jsonb; result jsonb;
begin
  select * into original from public.inventory_events where campaign_id = target_campaign and id = target_event;
  replay := private.inventory_begin(target_campaign, original.character_id, request_id, payload);
  if replay is not null then return replay; end if;
  select * into original from public.inventory_events where id = target_event for update;
  if original.kind not in ('grant', 'use', 'remove') or original.undone_by is not null then
    raise exception 'Not undoable' using errcode = 'P0001'; end if;
  if not private.is_campaign_dm(target_campaign) and (original.actor_id is distinct from auth.uid()
      or original.created_at < now() - interval '10 minutes') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into stack from public.inventory_items where id = original.item_id for update;
  if stack.revision is distinct from (original.after_value ->> 'revision')::bigint then
    raise exception 'Undo conflict' using errcode = 'P0001'; end if;
  if stack.quantity - original.quantity_delta < 0 then raise exception 'Undo conflict' using errcode = 'P0001'; end if;
  before := private.item_snapshot(stack);
  update public.inventory_items set quantity = quantity - original.quantity_delta, revision = revision + 1
    where id = stack.id returning * into stack;
  if original.after_value ? 'supplies' then
    select * into res from public.character_resources
      where campaign_id = stack.campaign_id and character_id = stack.character_id for update;
    if res.character_id is not null then
      take_rations := coalesce((original.after_value #>> '{supplies,rations}')::bigint, 0);
      take_water := coalesce((original.after_value #>> '{supplies,water}')::bigint, 0);
      -- Supplies already spent cannot be taken back: the whole undo is refused.
      if res.rations < take_rations or res.water_units < take_water then
        raise exception 'Undo conflict' using errcode = 'P0001'; end if;
      if take_rations > 0 or take_water > 0 then
        update public.character_resources set rations = rations - take_rations,
          water_units = water_units - take_water, revision = revision + 1
          where campaign_id = stack.campaign_id and character_id = stack.character_id;
      end if;
      supplies := jsonb_build_object('rations', -take_rations, 'water', -take_water);
    end if;
  end if;
  insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
    before_value, after_value, request_id, undo_of)
    values (stack.campaign_id, stack.character_id, stack.id, auth.uid(), 'undo', -original.quantity_delta,
      before, private.item_snapshot(stack) || case when supplies is null then '{}'::jsonb else jsonb_build_object('supplies', supplies) end,
      request_id, original.id) returning id into event_id;
  update public.inventory_events set undone_by = event_id where id = original.id;
  result := jsonb_build_object('item_id', stack.id, 'event_id', event_id, 'revision', stack.revision);
  if supplies is not null then result := result || jsonb_build_object('supplies', supplies); end if;
  return private.inventory_finish(request_id, payload, result);
end;
$fn$;

-- What archiving, repricing or merging a definition touches.
create or replace function public.item_definition_impact(target_campaign uuid, target_definition uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
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
        and o.status in ('pending', 'countered')),
    'open_trades', private.definition_open_trades(target_campaign, target_definition));
end;
$fn$;

-- Live trades (invited or open, not expired) offering a stack of the definition.
create or replace function private.definition_open_trades(target_campaign uuid, target_definition uuid) returns integer
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select count(distinct t.id) from public.trades t
    join public.trade_offer_items o on o.campaign_id = t.campaign_id and o.trade_id = t.id
    join public.inventory_items i on i.campaign_id = o.campaign_id and i.id = o.item_id
    where t.campaign_id = target_campaign and t.status in ('invited', 'open') and t.expires_at > now()
      and i.definition_id = target_definition);
end;
$fn$;
revoke all on function private.definition_open_trades(uuid, uuid) from public, anon, authenticated;

create or replace function public.sync_listing_prices(target_campaign uuid, target_definition uuid,
  listing_ids uuid[], new_price numeric, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('sync_prices', target_campaign, target_definition,
    to_jsonb(listing_ids), new_price);
  prior jsonb; wanted uuid[]; updated integer;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  if new_price is null or new_price not between 0 and 100000000 or new_price <> round(new_price, private.money_scale())
      or listing_ids is null or cardinality(listing_ids) not between 1 and 200 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select array_agg(distinct x) into wanted from unnest(listing_ids) x;
  if wanted is null or exists (select 1 from unnest(wanted) x where x is null) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
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
$fn$;
drop function if exists public.sync_listing_prices(uuid, uuid, uuid[], integer, uuid);

-- DM flag: a definition offered as a starting point in the creation helper.
create function public.set_item_template(target_campaign uuid, target_definition uuid, make_template boolean,
  expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('item_template', target_campaign, target_definition, make_template,
    expected_revision);
  prior jsonb; item public.item_definitions;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  if make_template is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into item from public.item_definitions
    where campaign_id = target_campaign and id = target_definition for update;
  if item.id is null or item.archived then raise exception 'Item unavailable' using errcode = '42501'; end if;
  if item.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if item.is_template is distinct from make_template then
    update public.item_definitions set is_template = make_template, revision = revision + 1
      where id = item.id returning * into item;
  end if;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('id', item.id, 'is_template', item.is_template, 'revision', item.revision));
end;
$fn$;

-- DM import of basic catalogue items as campaign definitions (origin srd, basic_key = key).
-- Existing keys (archived ones too) are skipped; with update_existing a live one whose catalogue
-- fields differ is updated instead (its price, image and template flag are kept). A price with
-- more decimals than private.money_scale() allows (any fraction while part 1 is the latest)
-- raises 'Invalid item N' with detail 'amount'; the catalogue's cent prices import once part 2 runs.
create function public.import_basic_items(target_campaign uuid, items jsonb, request_id uuid,
  update_existing boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb; prior jsonb; entry jsonb; item_position bigint; item_key text; draft jsonb; price numeric;
  existing public.item_definitions; new_id uuid; keys text[] := array[]::text[]; problem text;
  created jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb; updated jsonb := '[]'::jsonb;
begin
  perform private.shop_lock(target_campaign, true, null);
  payload := jsonb_build_array('import_basic', target_campaign,
    encode(sha256(convert_to(coalesce(items::text, ''), 'UTF8')), 'hex'),
    coalesce(update_existing, false));
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 500 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  for entry, item_position in select a.value, a.ordinality from jsonb_array_elements(items) with ordinality a loop
    begin
      if jsonb_typeof(entry) <> 'object' then
        raise exception 'Invalid request' using errcode = '22023', detail = 'item'; end if;
      item_key := entry ->> 'key';
      if jsonb_typeof(entry -> 'key') is distinct from 'string' or item_key !~ '^[a-z][A-Za-z0-9_-]{0,79}$'
          or item_key = any(keys) then
        raise exception 'Invalid request' using errcode = '22023', detail = 'key'; end if;
      draft := private.item_draft(entry);
      price := private.money_value(entry -> 'value_gp', 100000000);
    exception when invalid_parameter_value then
      get stacked diagnostics problem = pg_exception_detail;
      raise exception 'Invalid item %', item_position using errcode = '22023', detail = problem;
    end;
    keys := keys || item_key;
    select * into existing from public.item_definitions
      where campaign_id = target_campaign and basic_key = item_key for update;
    if existing.id is null then
      insert into public.item_definitions(campaign_id, name, category, icon, rarity, weight_lb, value_gp,
        description, translations, slot_kind, properties, origin, basic_key, created_by)
      values (target_campaign, draft ->> 'name', draft ->> 'category', draft ->> 'icon', draft ->> 'rarity',
        (draft ->> 'weight_lb')::numeric, price, draft ->> 'description', draft -> 'translations',
        draft ->> 'slot_kind', draft -> 'properties', 'srd', item_key, auth.uid())
      returning id into new_id;
      created := created || jsonb_build_object('key', item_key, 'id', new_id);
    elsif coalesce(update_existing, false) and not existing.archived
        and (existing.name, existing.description, existing.translations, existing.category, existing.icon,
          existing.rarity, existing.slot_kind, existing.properties, existing.weight_lb)
        is distinct from (draft ->> 'name', draft ->> 'description', draft -> 'translations',
          draft ->> 'category', draft ->> 'icon', draft ->> 'rarity', draft ->> 'slot_kind',
          draft -> 'properties', (draft ->> 'weight_lb')::numeric) then
      update public.item_definitions set name = draft ->> 'name', description = draft ->> 'description',
        translations = draft -> 'translations', category = draft ->> 'category', icon = draft ->> 'icon',
        rarity = draft ->> 'rarity', slot_kind = draft ->> 'slot_kind', properties = draft -> 'properties',
        weight_lb = (draft ->> 'weight_lb')::numeric, revision = revision + 1
        where id = existing.id;
      perform private.recompute_armor_class(i.campaign_id, i.character_id) from public.inventory_items i
        where i.campaign_id = target_campaign and i.definition_id = existing.id and i.equipped_slot is not null;
      updated := updated || jsonb_build_object('key', item_key, 'id', existing.id);
    else
      skipped := skipped || jsonb_build_object('key', item_key, 'id', existing.id, 'archived', existing.archived);
    end if;
  end loop;
  return private.inventory_finish(request_id, payload, jsonb_build_object(
    'created_count', jsonb_array_length(created), 'updated_count', jsonb_array_length(updated),
    'skipped_count', jsonb_array_length(skipped),
    'created', created, 'updated', updated, 'skipped', skipped));
end;
$fn$;

-- Catalogue search. DM: every live definition of the campaign. Player: live basic items, their own
-- creations and definitions one of their characters carries; value_gp only for basic items.
create function public.search_campaign_items(target_campaign uuid, search_query text, max_results integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean; needle text := trim(coalesce(search_query, '')); pattern text;
  lim integer := least(greatest(coalesce(max_results, 50), 1), 200);
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if char_length(needle) > 100 then raise exception 'Invalid request' using errcode = '22023'; end if;
  dm := private.is_campaign_dm(target_campaign);
  pattern := '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((select jsonb_agg(x.entry order by x.sort_name, x.id) from (
    select d.id, lower(d.name) sort_name, private.shop_item_json(d.id) || jsonb_build_object(
        'origin', d.origin, 'basic_key', d.basic_key, 'is_template', d.is_template,
        'value_gp', case when dm or d.basic_key is not null then d.value_gp end,
        'revision', d.revision, 'created_by_you', d.created_by is not distinct from viewer) entry
      from public.item_definitions d
      where d.campaign_id = target_campaign and not d.archived
        and (dm or d.basic_key is not null or d.created_by = viewer or exists (
          select 1 from public.inventory_items i join public.characters c
            on c.campaign_id = i.campaign_id and c.id = i.character_id
          where i.campaign_id = d.campaign_id and i.definition_id = d.id and i.quantity > 0
            and c.user_id = viewer))
        and (needle = '' or d.name ilike pattern escape '\'
          or d.translations #>> '{en,name}' ilike pattern escape '\'
          or d.translations #>> '{es,name}' ilike pattern escape '\')
      order by lower(d.name), d.id limit lim) x), '[]'::jsonb);
end;
$fn$;

-- ---------------------------------------------------------------------------------------------
-- Proposals
-- ---------------------------------------------------------------------------------------------
create or replace function private.proposal_json(p public.item_proposals, dm boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return jsonb_build_object('id', p.id, 'character_id', p.character_id,
    'character_name', (select c.name from public.characters c where c.id = p.character_id),
    'proposed_by_you', p.proposed_by is not distinct from auth.uid(),
    'proposer_name', case when dm then private.member_name(p.proposed_by) end,
    'draft', p.draft, 'quantity', p.quantity, 'status', p.status, 'dm_note', p.dm_note,
    'resolved_definition_id', p.resolved_definition_id, 'revision', p.revision,
    'created_at', p.created_at, 'updated_at', p.updated_at, 'resolved_at', p.resolved_at);
end;
$fn$;
revoke all on function private.proposal_json(public.item_proposals, boolean) from public, anon, authenticated;

-- The assigned Player (or a DM) proposes a new item for a character. Players never set a price;
-- suggested_value_gp is only a hint for the DM. Bounds: 20 pending and 100 created in the last
-- 24 hours per character. The request audit keeps the normalized draft, never unknown keys.
create function public.propose_item(target_campaign uuid, target_character uuid, draft jsonb,
  quantity integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb; replay jsonb; normalized jsonb; suggested numeric; saved public.item_proposals;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if target_character is null or not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if draft is null or jsonb_typeof(draft) <> 'object' then raise exception 'Invalid request' using errcode = '22023'; end if;
  if draft ? 'value_gp' or draft ? 'is_template' or draft ? 'basic_key' or draft ? 'origin' then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  normalized := private.item_draft(draft);
  suggested := private.money_value(draft -> 'suggested_value_gp', 100000000);
  if suggested is not null then normalized := normalized || jsonb_build_object('suggested_value_gp', suggested); end if;
  payload := jsonb_build_array('propose_item', target_campaign, target_character, normalized, quantity);
  replay := private.inventory_begin(target_campaign, target_character, request_id, payload);
  if replay is not null then return replay; end if;
  if not exists (select 1 from public.characters c where c.campaign_id = target_campaign
      and c.id = target_character and c.archived_at is null) then
    raise exception 'Character unavailable' using errcode = '42501'; end if;
  if quantity is null or quantity not between 1 and 1000 then
    raise exception 'Invalid quantity' using errcode = '22023'; end if;
  if (select count(*) from public.item_proposals p where p.campaign_id = target_campaign
      and p.character_id = target_character and p.status = 'pending') >= 20
      or (select count(*) from public.item_proposals p where p.campaign_id = target_campaign
      and p.character_id = target_character and p.created_at > now() - interval '24 hours') >= 100 then
    raise exception 'Too many proposals' using errcode = 'P0001'; end if;
  insert into public.item_proposals(campaign_id, character_id, proposed_by, draft, quantity)
    values (target_campaign, target_character, auth.uid(), normalized, quantity) returning * into saved;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('id', saved.id, 'status', saved.status, 'revision', saved.revision));
end;
$fn$;

-- DM: the campaign's proposals (optionally one character); Player: those of their own characters.
-- Every pending proposal comes first (newest first); with include_closed the 50 most recently
-- closed ones follow, so closed history never pushes pending ones out.
create function public.list_item_proposals(target_campaign uuid, target_character uuid default null,
  include_closed boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if target_character is not null and not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  return coalesce((select jsonb_agg(private.proposal_json(x, dm)
      order by (x.status <> 'pending'), coalesce(x.resolved_at, x.created_at) desc, x.id)
    from public.item_proposals x
    where x.campaign_id = target_campaign
      and (target_character is null or x.character_id = target_character)
      and (dm or exists (select 1 from public.characters c where c.campaign_id = x.campaign_id
        and c.id = x.character_id and c.user_id = viewer))
      and (x.status = 'pending' or (coalesce(include_closed, false) and x.id in (
        select p.id from public.item_proposals p
        where p.campaign_id = target_campaign and p.status <> 'pending'
          and (target_character is null or p.character_id = target_character)
          and (dm or exists (select 1 from public.characters c where c.campaign_id = p.campaign_id
            and c.id = p.character_id and c.user_id = viewer))
        order by coalesce(p.resolved_at, p.updated_at) desc, p.id limit 50)))), '[]'::jsonb);
end;
$fn$;

-- The proposer withdraws a pending proposal. Cancelling a cancelled proposal returns it.
create function public.cancel_item_proposal(target_campaign uuid, target_proposal uuid, expected_revision bigint,
  request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('cancel_proposal', target_campaign, target_proposal, expected_revision);
  replay jsonb; p public.item_proposals;
begin
  select * into p from public.item_proposals where campaign_id = target_campaign and id = target_proposal;
  replay := private.inventory_begin(target_campaign, p.character_id, request_id, payload);
  if replay is not null then return replay; end if;
  select * into p from public.item_proposals where id = target_proposal for update;
  if p.proposed_by is distinct from auth.uid() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p.status <> 'cancelled' then
    if p.status <> 'pending' then raise exception 'Proposal closed' using errcode = 'P0001'; end if;
    if p.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
    update public.item_proposals set status = 'cancelled', revision = revision + 1, updated_at = now(),
      resolved_at = now() where id = p.id returning * into p;
  end if;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('id', p.id, 'status', p.status, 'revision', p.revision));
end;
$fn$;

-- DM decision: accept (create the edited definition, origin player, created by the DM, and grant
-- it), merge (grant an existing live definition instead) or reject (with a note). Accept and merge
-- need an explicit quantity (1..1000). The proposer stays recorded on the proposal row only; they
-- see the new item because their character carries it.
create function public.resolve_item_proposal(target_campaign uuid, target_proposal uuid, resolution text,
  draft jsonb, target_definition uuid, quantity integer, note text, expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb; prior jsonb; p public.item_proposals; normalized jsonb; price numeric; definition uuid;
  amount integer := quantity; granted jsonb; cleaned text;
begin
  perform private.shop_lock(target_campaign, true, null);
  -- A DM draft is validated first so the request audit keeps only normalized fields.
  if resolution = 'accept' and draft is not null then
    normalized := private.item_draft(draft);
    price := private.money_value(draft -> 'value_gp', 100000000);
    if price is not null then normalized := normalized || jsonb_build_object('value_gp', price); end if;
  end if;
  payload := jsonb_build_array('resolve_proposal', target_campaign, target_proposal, resolution,
    normalized, target_definition, quantity, note, expected_revision);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  select * into p from public.item_proposals where campaign_id = target_campaign and id = target_proposal for update;
  if p.id is null then raise exception 'Proposal unavailable' using errcode = '42501'; end if;
  if p.status <> 'pending' then raise exception 'Proposal closed' using errcode = 'P0001'; end if;
  if p.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if resolution is null or resolution not in ('accept', 'merge', 'reject') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  cleaned := private.check_text(note, 500, true);
  if resolution <> 'reject' and (amount is null or amount not between 1 and 1000) then
    raise exception 'Invalid quantity' using errcode = '22023'; end if;
  if resolution = 'accept' then
    normalized := coalesce(normalized, private.item_draft(p.draft));
    insert into public.item_definitions(campaign_id, name, category, icon, rarity, weight_lb, value_gp,
      description, translations, slot_kind, properties, origin, created_by)
    values (target_campaign, normalized ->> 'name', normalized ->> 'category', normalized ->> 'icon',
      normalized ->> 'rarity', (normalized ->> 'weight_lb')::numeric, price, normalized ->> 'description',
      normalized -> 'translations', normalized ->> 'slot_kind', normalized -> 'properties', 'player', auth.uid())
    returning id into definition;
  elsif resolution = 'merge' then
    select d.id into definition from public.item_definitions d
      where d.campaign_id = target_campaign and d.id = target_definition and not d.archived;
    if definition is null then raise exception 'Item unavailable' using errcode = '42501'; end if;
  end if;
  if definition is not null then
    granted := private.grant_units(target_campaign, p.character_id, definition, amount, 'dm', request_id);
  end if;
  update public.item_proposals set status = case resolution when 'accept' then 'accepted'
      when 'merge' then 'merged' else 'rejected' end,
    dm_note = cleaned, resolved_definition_id = definition, resolved_by = auth.uid(), resolved_at = now(),
    updated_at = now(), revision = revision + 1
    where id = p.id returning * into p;
  return private.inventory_finish(request_id, payload, jsonb_build_object('id', p.id, 'status', p.status,
    'revision', p.revision, 'definition_id', definition, 'item_id', granted ->> 'item_id',
    'event_id', granted ->> 'event_id', 'quantity', case when definition is not null then amount end));
end;
$fn$;

-- ---------------------------------------------------------------------------------------------
-- Merge duplicate definitions
-- ---------------------------------------------------------------------------------------------
-- Moves every stack of source to target (loose stacks join the character's loose target stack of
-- the same source; equipped rows stay separate when the target fits that slot, else they join the
-- loose stack), repoints shop listings (archiving the source listing where the shop already lists
-- target) and closed order lines, then archives source. Refused while open orders or live trades
-- reference source. Every moved stack gets a 'merge' ledger event; history stays readable.
create function public.merge_item_definitions(target_campaign uuid, source_definition uuid,
  target_definition uuid, source_revision bigint, target_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('merge_definitions', target_campaign, source_definition,
    target_definition, source_revision, target_revision);
  prior jsonb; src public.item_definitions; dst public.item_definitions; stack public.inventory_items;
  joined public.inventory_items; before jsonb; moved_stacks integer := 0; merged_stacks integer := 0;
  moved_units bigint := 0; unequipped integer := 0; repointed integer := 0; archived_listings integer := 0;
  repointed_lines integer := 0; touched uuid[] := array[]::uuid[]; who uuid; units integer; keep_slot boolean;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  if source_definition is null or target_definition is null or source_definition = target_definition then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into src from public.item_definitions
    where campaign_id = target_campaign and id = source_definition for update;
  select * into dst from public.item_definitions
    where campaign_id = target_campaign and id = target_definition for update;
  if src.id is null or dst.id is null or src.archived or dst.archived then
    raise exception 'Item unavailable' using errcode = '42501'; end if;
  if src.revision is distinct from source_revision or dst.revision is distinct from target_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if exists (select 1 from public.shop_orders o join public.shop_order_lines ln
      on ln.campaign_id = o.campaign_id and ln.order_id = o.id
      where o.campaign_id = target_campaign and ln.definition_id = source_definition
        and o.status in ('pending', 'countered')) then
    raise exception 'Open orders' using errcode = 'P0001'; end if;
  perform private.trade_sweep(target_campaign);
  if private.definition_open_trades(target_campaign, source_definition) > 0 then
    raise exception 'Open trades' using errcode = 'P0001'; end if;

  for stack in select * from public.inventory_items
      where campaign_id = target_campaign and definition_id = source_definition and quantity > 0
      order by character_id, (equipped_slot is not null), created_at, id for update loop
    before := private.item_snapshot(stack);
    moved_units := moved_units + stack.quantity;
    -- An equipped row stays equipped only where the kept item fits: its slot kind allows the slot
    -- and a two-handed item finds the off hand free.
    keep_slot := stack.equipped_slot is not null and private.slot_allows(dst.slot_kind, stack.equipped_slot)
      and not (dst.slot_kind = 'two_hands' and exists (select 1 from public.inventory_items o
        where o.character_id = stack.character_id and o.equipped_slot = 'off_hand' and o.id <> stack.id));
    if stack.equipped_slot is not null and not keep_slot then
      unequipped := unequipped + 1;
    end if;
    if keep_slot then
      update public.inventory_items set definition_id = target_definition, revision = revision + 1
        where id = stack.id returning * into stack;
      insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
        before_value, after_value, request_id)
        values (target_campaign, stack.character_id, stack.id, auth.uid(), 'merge', 0, before,
          private.item_snapshot(stack) || jsonb_build_object('merged_from', source_definition), gen_random_uuid());
      moved_stacks := moved_stacks + 1;
    else
      select * into joined from public.inventory_items
        where campaign_id = target_campaign and character_id = stack.character_id
          and definition_id = target_definition and source = stack.source and equipped_slot is null
        order by created_at, id limit 1 for update;
      if joined.id is null then
        update public.inventory_items set definition_id = target_definition, equipped_slot = null,
            revision = revision + 1
          where id = stack.id returning * into stack;
        insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
          before_value, after_value, request_id)
          values (target_campaign, stack.character_id, stack.id, auth.uid(), 'merge', 0, before,
            private.item_snapshot(stack) || jsonb_build_object('merged_from', source_definition), gen_random_uuid());
        moved_stacks := moved_stacks + 1;
      else
        units := stack.quantity;
        update public.inventory_items set quantity = 0, equipped_slot = null, revision = revision + 1
          where id = stack.id returning * into stack;
        insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
          before_value, after_value, request_id)
          values (target_campaign, stack.character_id, stack.id, auth.uid(), 'merge', -units,
            before, private.item_snapshot(stack) || jsonb_build_object('merged_into', joined.id,
              'merged_to', target_definition), gen_random_uuid());
        before := private.item_snapshot(joined);
        update public.inventory_items set quantity = quantity + units, revision = revision + 1
          where id = joined.id returning * into joined;
        insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
          before_value, after_value, request_id)
          values (target_campaign, joined.character_id, joined.id, auth.uid(), 'merge', units, before,
            private.item_snapshot(joined) || jsonb_build_object('merged_from', source_definition), gen_random_uuid());
        merged_stacks := merged_stacks + 1;
      end if;
    end if;
    if not stack.character_id = any(touched) then touched := touched || stack.character_id; end if;
  end loop;
  foreach who in array touched loop
    perform private.recompute_armor_class(target_campaign, who);
  end loop;

  update public.shop_listings l set archived = true, revision = revision + 1
    where l.campaign_id = target_campaign and l.definition_id = source_definition and not l.archived
      and exists (select 1 from public.shop_listings t where t.shop_id = l.shop_id
        and t.definition_id = target_definition and not t.archived);
  get diagnostics archived_listings = row_count;
  update public.shop_listings set definition_id = target_definition, revision = revision + 1
    where campaign_id = target_campaign and definition_id = source_definition and not archived;
  get diagnostics repointed = row_count;
  -- Closed order lines follow the kept item so a later revert finds its units; an order that
  -- already has a line for target keeps the source line as it was.
  update public.shop_order_lines ln set definition_id = target_definition
    where ln.campaign_id = target_campaign and ln.definition_id = source_definition
      and not exists (select 1 from public.shop_order_lines t where t.order_id = ln.order_id
        and t.definition_id = target_definition);
  get diagnostics repointed_lines = row_count;
  update public.item_definitions set archived = true, revision = revision + 1
    where id = source_definition returning * into src;
  return private.inventory_finish(request_id, payload, jsonb_build_object(
    'source_id', source_definition, 'target_id', target_definition, 'source_revision', src.revision,
    'target_revision', dst.revision, 'moved_stacks', moved_stacks, 'merged_stacks', merged_stacks,
    'unequipped_stacks', unequipped, 'moved_units', moved_units, 'characters', cardinality(touched),
    'repointed_listings', repointed, 'archived_listings', archived_listings,
    'repointed_order_lines', repointed_lines));
end;
$fn$;

-- ---------------------------------------------------------------------------------------------
-- Item images: basic items and own creations are readable by members too
-- ---------------------------------------------------------------------------------------------
create or replace function private.can_read_item_image(target_campaign uuid, target_definition uuid, object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
begin
  return exists (select 1 from public.item_definitions d
    where d.campaign_id = target_campaign and d.id = target_definition and d.image_path = object_name
      and (private.is_campaign_dm(target_campaign) or (
        private.is_campaign_member(target_campaign) and (
          (d.basic_key is not null and not d.archived)
          or d.created_by = auth.uid()
          or exists (select 1 from public.inventory_items i join public.characters c on c.id = i.character_id
            where i.campaign_id = target_campaign and i.definition_id = d.id and i.quantity > 0
              and c.user_id = auth.uid())
          or exists (select 1 from public.shop_listings l join public.characters c on c.campaign_id = l.campaign_id
            where l.campaign_id = target_campaign and l.definition_id = d.id and c.user_id = auth.uid()
              and private.listing_visible(l.id, c.id))
        )
      )));
end;
$fn$;
revoke all on function private.can_read_item_image(uuid, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Shops: kind, image, bulk listings, numeric prices
-- ---------------------------------------------------------------------------------------------
create or replace function private.shop_kind(value jsonb) returns text
language plpgsql immutable set search_path = '' as $fn$
declare cleaned text;
begin
  if value is null or jsonb_typeof(value) = 'null' then return null; end if;
  if jsonb_typeof(value) <> 'string' then raise exception 'Invalid request' using errcode = '22023'; end if;
  cleaned := trim(value #>> '{}');
  if char_length(cleaned) > 40 then raise exception 'Invalid request' using errcode = '22023'; end if;
  return nullif(cleaned, '');
end;
$fn$;
revoke all on function private.shop_kind(jsonb) from public, anon, authenticated;

create or replace function public.save_shop(target_campaign uuid, target_shop uuid, expected_revision bigint,
  definition jsonb, request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $fn$
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
    insert into public.shops(campaign_id, name, description, visibility, mode, resale_percent, is_open, kind)
      values (target_campaign, private.check_text(definition->>'name', 80, false),
        private.check_text(definition->>'description', 2000, true),
        coalesce(definition->>'visibility', 'hidden'), coalesce(definition->>'mode', 'auto'),
        coalesce((definition->>'resale_percent')::integer, 50),
        coalesce((definition->>'is_open')::boolean, true), private.shop_kind(definition->'kind'))
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
      is_open = coalesce((definition->>'is_open')::boolean, is_open),
      kind = case when definition ? 'kind' then private.shop_kind(definition->'kind') else kind end,
      revision = revision + 1
      where id = target_shop;
    result := target_shop;
  end if;
  delete from public.shop_access where shop_id = result and character_id <> all(access);
  insert into public.shop_access(shop_id, campaign_id, character_id)
    select result, target_campaign, x from unnest(access) x on conflict do nothing;
  perform private.inventory_finish(request_id, payload, jsonb_build_object('id', result));
  return result;
end;
$fn$;

-- A definition may enter the economy when it is not Player-made or the DM priced it.
create or replace function public.save_listing(target_campaign uuid, target_shop uuid, target_listing uuid,
  expected_revision bigint, definition jsonb, request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('listing', target_campaign, target_shop, target_listing,
    expected_revision, definition);
  prior jsonb; result uuid; current_revision bigint; access uuid[]; target_definition uuid; listed_price numeric;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return (prior->>'id')::uuid; end if;
  if definition is null or jsonb_typeof(definition) <> 'object' or not exists (
      select 1 from public.shops where id = target_shop and campaign_id = target_campaign and not archived) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  access := private.campaign_characters(target_campaign, coalesce(definition->'access', '[]'::jsonb));
  listed_price := private.money_value(definition->'price', 100000000);
  if target_listing is null then
    target_definition := (definition->>'definition_id')::uuid;
    if not exists (select 1 from public.item_definitions where id = target_definition
        and campaign_id = target_campaign and not archived and (origin <> 'player' or value_gp is not null)) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    insert into public.shop_listings(campaign_id, shop_id, definition_id, price, stock, visibility)
      values (target_campaign, target_shop, target_definition,
        coalesce(listed_price, (select coalesce(value_gp, 0) from public.item_definitions where id = target_definition)),
        (definition->>'stock')::integer, coalesce(definition->>'visibility', 'shop'))
      returning id into result;
  else
    select revision into current_revision from public.shop_listings
      where id = target_listing and shop_id = target_shop and not archived for update;
    if current_revision is null then raise exception 'Listing unavailable' using errcode = '42501'; end if;
    if current_revision is distinct from expected_revision then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    update public.shop_listings set price = coalesce(listed_price, shop_listings.price),
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
$fn$;

-- Bulk stocking: [{definition_id, price?, stock?}] up to 200, atomic. Definitions the shop already
-- lists are skipped (so a retried shop-type pre-stock never duplicates). Price defaults to value_gp.
create function public.add_listings(target_campaign uuid, target_shop uuid, items jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('add_listings', target_campaign, target_shop, items);
  prior jsonb; entry jsonb; def public.item_definitions; existing uuid; new_id uuid; price numeric; stock integer;
  seen uuid[] := array[]::uuid[]; created jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb; definition uuid;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;
  if not exists (select 1 from public.shops where id = target_shop and campaign_id = target_campaign and not archived)
      or items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 200 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  for entry in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(entry) <> 'object'
        or coalesce(entry ->> 'definition_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (entry ? 'stock' and jsonb_typeof(entry -> 'stock') not in ('number', 'null')) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    definition := (entry ->> 'definition_id')::uuid;
    if definition = any(seen) then raise exception 'Invalid request' using errcode = '22023'; end if;
    seen := seen || definition;
    select * into def from public.item_definitions where campaign_id = target_campaign and id = definition;
    if def.id is null or def.archived or (def.origin = 'player' and def.value_gp is null) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    price := coalesce(private.money_value(entry -> 'price', 100000000), def.value_gp, 0);
    if jsonb_typeof(entry -> 'stock') = 'number' then
      if (entry ->> 'stock')::numeric not between 0 and 9999
          or (entry ->> 'stock')::numeric <> trunc((entry ->> 'stock')::numeric) then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      stock := (entry ->> 'stock')::integer;
    else
      stock := null;
    end if;
    select l.id into existing from public.shop_listings l
      where l.shop_id = target_shop and l.definition_id = definition and not l.archived;
    if existing is not null then
      skipped := skipped || jsonb_build_object('definition_id', definition, 'listing_id', existing);
    else
      insert into public.shop_listings(campaign_id, shop_id, definition_id, price, stock, visibility)
        values (target_campaign, target_shop, definition, price, stock, 'shop') returning id into new_id;
      created := created || jsonb_build_object('definition_id', definition, 'listing_id', new_id);
    end if;
  end loop;
  return private.inventory_finish(request_id, payload, jsonb_build_object('created', created, 'skipped', skipped,
    'created_count', jsonb_array_length(created), 'skipped_count', jsonb_array_length(skipped)));
end;
$fn$;

-- Shop image readers: the DM, or a member with a character that currently sees the shop.
create or replace function private.can_read_shop_image(target_campaign uuid, target_shop uuid, object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
begin
  return exists (select 1 from public.shops s
    where s.campaign_id = target_campaign and s.id = target_shop and s.image_path = object_name and not s.archived
      and (private.is_campaign_dm(target_campaign) or (private.is_campaign_member(target_campaign)
        and exists (select 1 from public.characters c where c.campaign_id = target_campaign
          and c.user_id = auth.uid() and c.archived_at is null and private.shop_visible(s.id, c.id)))));
end;
$fn$;
revoke all on function private.can_read_shop_image(uuid, uuid, text) from public, anon, authenticated;

create function public.set_shop_image(target_campaign uuid, target_shop uuid, expected_revision bigint,
  new_path text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare req jsonb := jsonb_build_array('shop_image', target_campaign, target_shop, expected_revision, new_path);
  prior jsonb; s public.shops; found_object boolean; environment text;
begin
  -- search_path is empty: derive the environment from this function's own table reference.
  environment := case when 'public.shops'::regclass::text like 'pre.%' then 'pre' else 'public' end;
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id, req);
  if prior is not null then return prior; end if;
  select * into s from public.shops where campaign_id = target_campaign and id = target_shop and not archived for update;
  if s.id is null then raise exception 'Shop unavailable' using errcode = '42501'; end if;
  if s.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if new_path is not null then
    if new_path !~ ('^' || environment || '/' || target_campaign || '/' || target_shop || '/[0-9a-f-]{36}[.](webp|png|jpg)$') then
      raise exception 'Invalid image path' using errcode = '22023'; end if;
    if to_regclass('storage.objects') is null then raise exception 'Image unavailable' using errcode = '22023'; end if;
    execute 'select exists (select 1 from storage.objects where bucket_id = ''shop-images'' and name = $1)'
      into found_object using new_path;
    if not found_object then raise exception 'Image unavailable' using errcode = '22023'; end if;
  end if;
  update public.shops set image_path = new_path, revision = revision + 1 where id = s.id returning * into s;
  return private.inventory_finish(request_id, req,
    jsonb_build_object('id', s.id, 'image_path', s.image_path, 'revision', s.revision));
end;
$fn$;

create or replace function public.checkout(target_campaign uuid, target_shop uuid, target_character uuid,
  order_lines jsonb, note text, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('checkout', target_campaign, target_shop, target_character, order_lines, note);
  prior jsonb; shop public.shops; l public.shop_listings; line jsonb; qty integer; offered numeric;
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
    offered := private.money_value(case when line->>'offered_price' = '' then null else line->'offered_price' end,
      100000000);
    if qty is null or qty not between 1 and 999 then
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
$fn$;

create or replace function public.sell_to_shop(target_campaign uuid, target_shop uuid, target_character uuid,
  order_lines jsonb, note text, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('sell', target_campaign, target_shop, target_character, order_lines, note);
  prior jsonb; shop public.shops; line jsonb; qty integer; offered numeric; target_definition uuid;
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
    offered := private.money_value(case when line->>'offered_price' = '' then null else line->'offered_price' end,
      100000000);
    target_definition := (line->>'definition_id')::uuid;
    if qty is null or qty not between 1 and 999 then
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
$fn$;

create or replace function public.respond_order(target_campaign uuid, target_order uuid, decision text,
  line_prices jsonb, note text, request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('respond', target_campaign, target_order, decision, line_prices, note);
  prior jsonb; o public.shop_orders; entry jsonb; counter_price numeric;
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
      -- Validated before the update so a bad amount is refused even for an unknown line.
      counter_price := private.money_value(entry->'price', 100000000);
      update public.shop_order_lines set countered_price = counter_price
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
$fn$;

create or replace function public.revert_order(target_campaign uuid, target_order uuid, note text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('revert', target_campaign, target_order, note);
  prior jsonb; o public.shop_orders; ln record; taken integer; refund numeric := 0;
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
    refund := refund + taken * ln.final_price;
  end loop;
  perform private.move_gold(o.campaign_id, o.character_id, case when o.kind = 'purchase' then refund else -refund end);
  update public.shop_orders set status = 'reverted', refunded = refund, updated_at = now(),
    closed_by = auth.uid(), dm_note = case when coalesce(trim(note), '') = '' then dm_note
      else private.check_text(note, 500, true) end
    where id = o.id;
  return private.inventory_finish(request_id, payload, private.order_result(o.id));
end;
$fn$;

create or replace function public.get_storefront(target_campaign uuid, target_character uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if target_character is null or not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'character_id', target_character,
    'gold', (select r.gold from public.character_resources r
      where r.campaign_id = target_campaign and r.character_id = target_character),
    'shops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name,
        'description', s.description, 'kind', s.kind, 'image_path', s.image_path, 'mode', s.mode,
        'is_open', s.is_open, 'resale_percent', s.resale_percent,
        'modifier', private.shop_modifier(s.id, target_character),
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
$fn$;

create or replace function public.get_shop_admin(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'characters', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
        'gold', r.gold) order by c.created_at)
      from public.characters c left join public.character_resources r on r.character_id = c.id
      where c.campaign_id = target_campaign and c.is_active), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(private.shop_item_json(d.id)
        || jsonb_build_object('value_gp', d.value_gp, 'origin', d.origin, 'basic_key', d.basic_key,
          'is_template', d.is_template) order by d.name)
      from public.item_definitions d
      where d.campaign_id = target_campaign and not d.archived
        and (d.origin <> 'player' or d.value_gp is not null)), '[]'::jsonb),
    'shops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name,
        'description', s.description, 'kind', s.kind, 'image_path', s.image_path,
        'visibility', s.visibility, 'mode', s.mode,
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
$fn$;

create or replace function public.list_shop_orders(target_campaign uuid, target_character uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
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
      'shop', jsonb_build_object('id', s.id, 'name', s.name, 'mode', s.mode, 'kind', s.kind),
      'character', jsonb_build_object('id', c.id, 'name', c.name),
      'lines', (select jsonb_agg(jsonb_build_object('id', ln.id, 'definition_id', ln.definition_id,
          'item_name', d.name, 'translations', d.translations, 'icon', d.icon, 'quantity', ln.quantity,
          'unit_price', ln.unit_price, 'offered_price', ln.offered_price, 'countered_price', ln.countered_price,
          'final_price', ln.final_price, 'reverted_quantity', ln.reverted_quantity) order by d.name)
        from public.shop_order_lines ln join public.item_definitions d on d.id = ln.definition_id
        where ln.order_id = o.id)) o
    from public.shop_orders o join public.shops s on s.id = o.shop_id
      join public.characters c on c.id = o.character_id
    where o.campaign_id = target_campaign
      and (target_character is null or o.character_id = target_character)
    order by o.created_at desc limit 200) x), '[]'::jsonb);
end;
$fn$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------
revoke all on function
  public.save_item_definition(uuid, uuid, bigint, jsonb, uuid), public.grant_item(uuid, uuid, uuid, integer, uuid),
  public.undo_inventory_event(uuid, uuid, uuid), public.item_definition_impact(uuid, uuid),
  public.sync_listing_prices(uuid, uuid, uuid[], numeric, uuid),
  public.set_item_template(uuid, uuid, boolean, bigint, uuid),
  public.import_basic_items(uuid, jsonb, uuid, boolean),
  public.search_campaign_items(uuid, text, integer),
  public.propose_item(uuid, uuid, jsonb, integer, uuid),
  public.list_item_proposals(uuid, uuid, boolean),
  public.cancel_item_proposal(uuid, uuid, bigint, uuid),
  public.resolve_item_proposal(uuid, uuid, text, jsonb, uuid, integer, text, bigint, uuid),
  public.merge_item_definitions(uuid, uuid, uuid, bigint, bigint, uuid),
  public.save_shop(uuid, uuid, bigint, jsonb, uuid),
  public.save_listing(uuid, uuid, uuid, bigint, jsonb, uuid),
  public.add_listings(uuid, uuid, jsonb, uuid),
  public.set_shop_image(uuid, uuid, bigint, text, uuid),
  public.checkout(uuid, uuid, uuid, jsonb, text, uuid), public.sell_to_shop(uuid, uuid, uuid, jsonb, text, uuid),
  public.respond_order(uuid, uuid, text, jsonb, text, uuid), public.revert_order(uuid, uuid, text, uuid),
  public.get_storefront(uuid, uuid), public.get_shop_admin(uuid), public.list_shop_orders(uuid, uuid)
  from public, anon;
grant execute on function
  public.save_item_definition(uuid, uuid, bigint, jsonb, uuid), public.grant_item(uuid, uuid, uuid, integer, uuid),
  public.undo_inventory_event(uuid, uuid, uuid), public.item_definition_impact(uuid, uuid),
  public.sync_listing_prices(uuid, uuid, uuid[], numeric, uuid),
  public.set_item_template(uuid, uuid, boolean, bigint, uuid),
  public.import_basic_items(uuid, jsonb, uuid, boolean),
  public.search_campaign_items(uuid, text, integer),
  public.propose_item(uuid, uuid, jsonb, integer, uuid),
  public.list_item_proposals(uuid, uuid, boolean),
  public.cancel_item_proposal(uuid, uuid, bigint, uuid),
  public.resolve_item_proposal(uuid, uuid, text, jsonb, uuid, integer, text, bigint, uuid),
  public.merge_item_definitions(uuid, uuid, uuid, bigint, bigint, uuid),
  public.save_shop(uuid, uuid, bigint, jsonb, uuid),
  public.save_listing(uuid, uuid, uuid, bigint, jsonb, uuid),
  public.add_listings(uuid, uuid, jsonb, uuid),
  public.set_shop_image(uuid, uuid, bigint, text, uuid),
  public.checkout(uuid, uuid, uuid, jsonb, text, uuid), public.sell_to_shop(uuid, uuid, uuid, jsonb, text, uuid),
  public.respond_order(uuid, uuid, text, jsonb, text, uuid), public.revert_order(uuid, uuid, text, uuid),
  public.get_storefront(uuid, uuid), public.get_shop_admin(uuid), public.list_shop_orders(uuid, uuid)
  to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.item_definitions') is not null and to_regclass('pre.trades') is not null
      and to_regclass('pre.item_proposals') is null and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$m1$;

-- GLOBAL STORAGE: shared router for the private shop-images bucket, deliberately outside PRE
-- remapping. The prefix chooses the helper schema; dynamic SQL avoids a storage dependency on
-- pre_private, which the PRE ETL replaces. Objects are immutable (no update policy).
create or replace function private.shop_image_access(object_name text, writing boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare env text := split_part(object_name, '/', 1); helper text; campaign uuid; shop uuid; allowed boolean;
begin
  if object_name !~ '^(public|pre)/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](webp|png|jpg)$' then return false; end if;
  begin
    campaign := split_part(object_name, '/', 2)::uuid;
    shop := split_part(object_name, '/', 3)::uuid;
  exception when invalid_text_representation then return false; end;
  helper := case env when 'pre' then 'pre_private' else 'private' end;
  if to_regprocedure(format('%I.can_read_shop_image(uuid,uuid,text)', helper)) is null then return false; end if;
  if writing then
    execute format('select %I.is_campaign_dm($1) and exists (select 1 from %I.shops where campaign_id=$1 and id=$2 and not archived)', helper, env)
      into allowed using campaign, shop;
  else
    -- DMs may read unattached uploads for preview and cleanup; Players only the current image.
    execute format('select %I.is_campaign_dm($1) or %I.can_read_shop_image($1,$2,$3)', helper, helper)
      into allowed using campaign, shop, object_name;
  end if;
  return coalesce(allowed, false);
end;
$$;
revoke all on function private.shop_image_access(text, boolean) from public, anon;
grant execute on function private.shop_image_access(text, boolean) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('shop-images', 'shop-images', false, 1048576, array['image/webp','image/png','image/jpeg'])
    on conflict (id) do nothing;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='shop_images_read') then
    execute $p$create policy shop_images_read on storage.objects for select to authenticated
      using (bucket_id = 'shop-images' and private.shop_image_access(name, false))$p$;
    execute $p$create policy shop_images_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'shop-images' and private.shop_image_access(name, true))$p$;
    execute $p$create policy shop_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'shop-images' and private.shop_image_access(name, true))$p$;
  end if;
end
$storage$;
