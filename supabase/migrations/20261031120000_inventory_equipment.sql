-- RYT-004: inventory, equipment, use/undo and character portraits.
-- Actor matrix:
--   anon / outsider / inactive member / cross-campaign DM: no reads or writes.
--   other Player in the same campaign: cannot read or write this character's items or ledger.
--   assigned active Player: reads own stacks, ledger and the definitions they hold or created;
--           creates price-free player definitions; adds player-sourced stacks to own character;
--           uses, discards, equips and unequips own items; undoes own quantity events within
--           10 minutes when the stack has not changed since; sets own portrait.
--   active campaign DM: reads and writes everything in the campaign; undoes any quantity event.
-- Equipment and sheet saves recompute character_sheets.armor_class unless the build sets acOverride.

create table public.item_definitions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  category text not null check (category in
    ('weapon', 'armor', 'shield', 'gear', 'consumable', 'ammo', 'tool', 'treasure', 'quest')),
  icon text not null default 'package' check (icon ~ '^[a-z0-9-]{1,40}$'),
  rarity text not null default 'common' check (rarity in
    ('common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact')),
  weight_tenths integer not null default 0 check (weight_tenths between 0 and 100000),
  value_gp integer check (value_gp between 0 and 100000000),
  description text not null default '' check (char_length(description) <= 2000),
  slot_kind text not null default 'none' check (slot_kind in
    ('head', 'neck', 'cloak', 'body', 'hands', 'belt', 'feet', 'ring', 'one_hand', 'two_hands', 'shield', 'none')),
  properties jsonb not null default '{}'::jsonb check (
    jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 4096),
  origin text not null check (origin in ('dm', 'player', 'srd')),
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (campaign_id, id),
  -- Player-made definitions never carry a price; only DMs value items for the economy.
  check (origin <> 'player' or value_gp is null)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  character_id uuid not null,
  definition_id uuid not null,
  quantity integer not null check (quantity between 0 and 100000),
  equipped_slot text check (equipped_slot in
    ('head', 'neck', 'cloak', 'body', 'hands', 'belt', 'feet', 'ring_1', 'ring_2', 'main_hand', 'off_hand')),
  source text not null check (source in ('dm', 'player', 'shop')),
  notes text not null default '' check (char_length(notes) <= 500),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  unique (campaign_id, id),
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade,
  foreign key (campaign_id, definition_id) references public.item_definitions(campaign_id, id),
  check (equipped_slot is null or quantity = 1)
);
create unique index inventory_slot_unique on public.inventory_items(character_id, equipped_slot)
  where equipped_slot is not null;
create index inventory_items_character on public.inventory_items(campaign_id, character_id);

create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  character_id uuid not null,
  item_id uuid not null,
  actor_id uuid references auth.users(id),
  kind text not null check (kind in ('grant', 'remove', 'use', 'equip', 'unequip', 'undo')),
  quantity_delta integer not null default 0,
  before_value jsonb,
  after_value jsonb not null,
  request_id uuid not null unique,
  undo_of uuid unique references public.inventory_events(id),
  undone_by uuid references public.inventory_events(id),
  created_at timestamptz not null default now(),
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade,
  foreign key (campaign_id, item_id) references public.inventory_items(campaign_id, id) on delete cascade
);
create index inventory_events_character on public.inventory_events(campaign_id, character_id, created_at desc);

alter table public.character_sheets add column portrait_path text check (
  portrait_path is null or portrait_path ~ '^(public|pre)/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png|jpe?g)$');

alter table public.item_definitions enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_events enable row level security;
revoke all on public.item_definitions, public.inventory_items, public.inventory_events from public, anon, authenticated;
grant select on public.item_definitions, public.inventory_items, public.inventory_events to authenticated;

create policy items_read on public.inventory_items for select to authenticated
  using (private.can_play_character(campaign_id, character_id));
create policy inventory_events_read on public.inventory_events for select to authenticated
  using (private.can_play_character(campaign_id, character_id));
create policy definitions_read on public.item_definitions for select to authenticated
  using (private.is_campaign_dm(campaign_id) or (private.is_campaign_member(campaign_id) and (
    created_by = (select auth.uid()) or exists (
      select 1 from public.inventory_items i join public.characters c
        on c.campaign_id = i.campaign_id and c.id = i.character_id
       where i.campaign_id = item_definitions.campaign_id and i.definition_id = item_definitions.id
         and c.user_id = (select auth.uid())))));

create table private.inventory_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  payload jsonb not null,
  result jsonb not null
);
revoke all on private.inventory_requests from public, anon, authenticated;
alter table private.inventory_requests enable row level security;

-- Shared guard: campaign lock, authorization and idempotent replay lookup.
create function private.inventory_begin(target_campaign uuid, target_character uuid, request_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare prior private.inventory_requests;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if target_character is null or not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.inventory_requests r where r.request_id = inventory_begin.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result;
  end if;
  return null;
end;
$$;
revoke all on function private.inventory_begin(uuid, uuid, uuid, jsonb) from public, anon, authenticated;

create function private.inventory_finish(request_id uuid, payload jsonb, result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.inventory_requests values (request_id, auth.uid(), payload, result);
  return result;
end;
$$;
revoke all on function private.inventory_finish(uuid, jsonb, jsonb) from public, anon, authenticated;

-- AC follows equipped armor and shield unless the sheet sets a manual override.
create function private.recompute_armor_class(target_campaign uuid, target_character uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare sheet public.character_sheets; dex integer; mod integer; armor jsonb; shield jsonb; ac integer;
begin
  select * into sheet from public.character_sheets
    where campaign_id = target_campaign and character_id = target_character for update;
  if sheet.character_id is null or sheet.build -> 'baseAbilities' is null then return; end if;
  if jsonb_typeof(sheet.build -> 'acOverride') = 'number' then return; end if;
  dex := least(30, coalesce((sheet.build #>> '{baseAbilities,dex}')::integer, 10)
    + coalesce((sheet.build #>> '{bonuses,dex}')::integer, 0));
  mod := floor((dex - 10) / 2.0);
  select d.properties into armor from public.inventory_items i join public.item_definitions d
    on d.campaign_id = i.campaign_id and d.id = i.definition_id
   where i.campaign_id = target_campaign and i.character_id = target_character
     and i.equipped_slot = 'body' and d.category = 'armor';
  select d.properties into shield from public.inventory_items i join public.item_definitions d
    on d.campaign_id = i.campaign_id and d.id = i.definition_id
   where i.campaign_id = target_campaign and i.character_id = target_character
     and i.equipped_slot = 'off_hand' and d.category = 'shield';
  if armor is null then ac := 10 + mod;
  else ac := coalesce((armor ->> 'base')::integer, 10) + case
    when jsonb_typeof(armor -> 'dexCap') = 'number' then least(mod, (armor ->> 'dexCap')::integer) else mod end;
  end if;
  if shield is not null then ac := ac + coalesce((shield ->> 'acBonus')::integer, 2); end if;
  ac := greatest(0, least(99, ac));
  -- Derived value: no revision bump, so open sheet edits do not go stale.
  if ac <> sheet.armor_class then
    update public.character_sheets set armor_class = ac
      where campaign_id = target_campaign and character_id = target_character;
  end if;
end;
$$;
revoke all on function private.recompute_armor_class(uuid, uuid) from public, anon, authenticated;

create function private.item_snapshot(item public.inventory_items) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('quantity', item.quantity, 'equipped_slot', item.equipped_slot,
    'revision', item.revision, 'definition_id', item.definition_id);
$$;
revoke all on function private.item_snapshot(public.inventory_items) from public, anon, authenticated;

create function public.save_item_definition(target_campaign uuid, target_definition uuid,
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
      archived = coalesce((item ->> 'archived')::boolean, false), revision = revision + 1
      where campaign_id = target_campaign and id = target_definition;
    result_id := target_definition;
    -- Equipped armor or shield changes can move AC for everyone wearing it.
    perform private.recompute_armor_class(i.campaign_id, i.character_id) from public.inventory_items i
      where i.campaign_id = target_campaign and i.definition_id = target_definition and i.equipped_slot is not null;
  end if;
  return private.inventory_finish(request_id, req, jsonb_build_object('id', result_id));
end;
$$;

create function public.grant_item(target_campaign uuid, target_character uuid, target_definition uuid,
  amount integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('grant', target_campaign, target_character, target_definition, amount);
  replay jsonb; dm boolean; def public.item_definitions; stack public.inventory_items; new_source text; event_id uuid;
begin
  replay := private.inventory_begin(target_campaign, target_character, request_id, payload);
  if replay is not null then return replay; end if;
  if amount is null or amount < 1 or amount > 1000 then raise exception 'Invalid quantity' using errcode = '22023'; end if;
  dm := private.is_campaign_dm(target_campaign);
  select * into def from public.item_definitions where campaign_id = target_campaign and id = target_definition;
  if def.id is null or def.archived then raise exception 'Item unavailable' using errcode = '42501'; end if;
  -- Players only add their own price-free definitions, into player-sourced stacks.
  if not dm and (def.origin <> 'player' or def.created_by is distinct from auth.uid()) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  new_source := case when dm then 'dm' else 'player' end;
  select * into stack from public.inventory_items
    where campaign_id = target_campaign and character_id = target_character and definition_id = target_definition
      and source = new_source and equipped_slot is null
    order by created_at limit 1 for update;
  if stack.id is null then
    insert into public.inventory_items(campaign_id, character_id, definition_id, quantity, source)
      values (target_campaign, target_character, target_definition, amount, new_source) returning * into stack;
    insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
      before_value, after_value, request_id)
      values (target_campaign, target_character, stack.id, auth.uid(), 'grant', amount,
        jsonb_build_object('quantity', 0, 'equipped_slot', null, 'revision', -1, 'definition_id', target_definition),
        private.item_snapshot(stack), request_id) returning id into event_id;
  else
    update public.inventory_items set quantity = quantity + amount, revision = revision + 1
      where id = stack.id returning * into stack;
    insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
      before_value, after_value, request_id)
      values (target_campaign, target_character, stack.id, auth.uid(), 'grant', amount,
        jsonb_build_object('quantity', stack.quantity - amount, 'equipped_slot', null,
          'revision', stack.revision - 1, 'definition_id', target_definition),
        private.item_snapshot(stack), request_id) returning id into event_id;
  end if;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('item_id', stack.id, 'event_id', event_id, 'revision', stack.revision));
end;
$$;

-- use_item and remove_item both subtract quantity; use is restricted to consumables and ammo.
create function private.inventory_subtract(target_campaign uuid, target_item uuid, expected_revision bigint,
  amount integer, event_kind text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare stack public.inventory_items; before jsonb; category text; event_id uuid; was_equipped boolean;
  payload jsonb := jsonb_build_array(event_kind, target_campaign, target_item, expected_revision, amount);
  replay jsonb;
begin
  select * into stack from public.inventory_items where campaign_id = target_campaign and id = target_item;
  replay := private.inventory_begin(target_campaign, stack.character_id, request_id, payload);
  if replay is not null then return replay; end if;
  select * into stack from public.inventory_items where id = target_item for update;
  if amount is null or amount < 1 then raise exception 'Invalid quantity' using errcode = '22023'; end if;
  if stack.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if stack.quantity < amount then raise exception 'Insufficient quantity' using errcode = 'P0001'; end if;
  select d.category into category from public.item_definitions d
    where d.campaign_id = stack.campaign_id and d.id = stack.definition_id;
  if event_kind = 'use' and category not in ('consumable', 'ammo') then
    raise exception 'Not usable' using errcode = '22023'; end if;
  before := private.item_snapshot(stack);
  was_equipped := stack.equipped_slot is not null;
  update public.inventory_items set quantity = quantity - amount,
    equipped_slot = case when quantity - amount = 0 then null else equipped_slot end, revision = revision + 1
    where id = target_item returning * into stack;
  insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
    before_value, after_value, request_id)
    values (stack.campaign_id, stack.character_id, stack.id, auth.uid(), event_kind, -amount,
      before, private.item_snapshot(stack), request_id) returning id into event_id;
  if was_equipped and stack.equipped_slot is null then
    perform private.recompute_armor_class(stack.campaign_id, stack.character_id); end if;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('item_id', stack.id, 'event_id', event_id, 'revision', stack.revision));
end;
$$;
revoke all on function private.inventory_subtract(uuid, uuid, bigint, integer, text, uuid) from public, anon, authenticated;

create function public.use_item(target_campaign uuid, target_item uuid, expected_revision bigint,
  amount integer, request_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.inventory_subtract(target_campaign, target_item, expected_revision, amount, 'use', request_id);
$$;
create function public.remove_item(target_campaign uuid, target_item uuid, expected_revision bigint,
  amount integer, request_id uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select private.inventory_subtract(target_campaign, target_item, expected_revision, amount, 'remove', request_id);
$$;

-- Equipping takes one unit into its own stack row; unequipping returns it to a matching stack.
create function public.equip_item(target_campaign uuid, target_item uuid, expected_revision bigint,
  target_slot text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('equip', target_campaign, target_item, expected_revision, target_slot);
  replay jsonb; stack public.inventory_items; equipped public.inventory_items; kind text; before jsonb;
  allowed boolean; event_id uuid;
begin
  select * into stack from public.inventory_items where campaign_id = target_campaign and id = target_item;
  replay := private.inventory_begin(target_campaign, stack.character_id, request_id, payload);
  if replay is not null then return replay; end if;
  select * into stack from public.inventory_items where id = target_item for update;
  if stack.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if stack.quantity < 1 or stack.equipped_slot is not null then raise exception 'Not equippable' using errcode = '22023'; end if;
  select d.slot_kind into kind from public.item_definitions d
    where d.campaign_id = stack.campaign_id and d.id = stack.definition_id;
  allowed := case kind
    when 'ring' then target_slot in ('ring_1', 'ring_2')
    when 'one_hand' then target_slot in ('main_hand', 'off_hand')
    when 'two_hands' then target_slot = 'main_hand'
    when 'shield' then target_slot = 'off_hand'
    when 'none' then false
    else target_slot = kind end;
  if not coalesce(allowed, false) then raise exception 'Wrong slot' using errcode = '22023'; end if;
  if exists (select 1 from public.inventory_items where character_id = stack.character_id and equipped_slot = target_slot) then
    raise exception 'Slot occupied' using errcode = 'P0001'; end if;
  -- A two-handed weapon needs a free off hand; nothing goes in the off hand beside one.
  if kind = 'two_hands' and exists (select 1 from public.inventory_items
      where character_id = stack.character_id and equipped_slot = 'off_hand') then
    raise exception 'Slot occupied' using errcode = 'P0001'; end if;
  if target_slot = 'off_hand' and exists (select 1 from public.inventory_items i join public.item_definitions d
      on d.campaign_id = i.campaign_id and d.id = i.definition_id
      where i.character_id = stack.character_id and i.equipped_slot = 'main_hand' and d.slot_kind = 'two_hands') then
    raise exception 'Slot occupied' using errcode = 'P0001'; end if;
  before := private.item_snapshot(stack);
  if stack.quantity = 1 then
    update public.inventory_items set equipped_slot = target_slot, revision = revision + 1
      where id = stack.id returning * into equipped;
  else
    update public.inventory_items set quantity = quantity - 1, revision = revision + 1 where id = stack.id;
    insert into public.inventory_items(campaign_id, character_id, definition_id, quantity, equipped_slot, source, notes)
      values (stack.campaign_id, stack.character_id, stack.definition_id, 1, target_slot, stack.source, stack.notes)
      returning * into equipped;
  end if;
  insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
    before_value, after_value, request_id)
    values (stack.campaign_id, stack.character_id, equipped.id, auth.uid(), 'equip', 0,
      before, private.item_snapshot(equipped), request_id) returning id into event_id;
  perform private.recompute_armor_class(stack.campaign_id, stack.character_id);
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('item_id', equipped.id, 'event_id', event_id, 'revision', equipped.revision));
end;
$$;

create function public.unequip_item(target_campaign uuid, target_item uuid, expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('unequip', target_campaign, target_item, expected_revision);
  replay jsonb; stack public.inventory_items; merged public.inventory_items; before jsonb; event_id uuid; result_item uuid;
begin
  select * into stack from public.inventory_items where campaign_id = target_campaign and id = target_item;
  replay := private.inventory_begin(target_campaign, stack.character_id, request_id, payload);
  if replay is not null then return replay; end if;
  select * into stack from public.inventory_items where id = target_item for update;
  if stack.revision is distinct from expected_revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if stack.equipped_slot is null then raise exception 'Not equipped' using errcode = '22023'; end if;
  before := private.item_snapshot(stack);
  select * into merged from public.inventory_items
    where character_id = stack.character_id and definition_id = stack.definition_id and source = stack.source
      and equipped_slot is null and id <> stack.id order by created_at limit 1 for update;
  if merged.id is null then
    update public.inventory_items set equipped_slot = null, revision = revision + 1
      where id = stack.id returning * into merged;
  else
    update public.inventory_items set quantity = quantity + 1, revision = revision + 1
      where id = merged.id returning * into merged;
    update public.inventory_items set quantity = 0, equipped_slot = null, revision = revision + 1 where id = stack.id;
  end if;
  insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
    before_value, after_value, request_id)
    values (stack.campaign_id, stack.character_id, stack.id, auth.uid(), 'unequip', 0,
      before, jsonb_build_object('merged_into', merged.id) || private.item_snapshot(merged), request_id)
    returning id into event_id;
  perform private.recompute_armor_class(stack.campaign_id, stack.character_id);
  result_item := merged.id;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('item_id', result_item, 'event_id', event_id, 'revision', merged.revision));
end;
$$;

-- Compensates one grant/use/remove event. Players: own events within 10 minutes. DMs: any.
-- Rejected once a later change touched the stack (its revision moved past the event).
create function public.undo_inventory_event(target_campaign uuid, target_event uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('undo', target_campaign, target_event);
  replay jsonb; original public.inventory_events; stack public.inventory_items; before jsonb; event_id uuid;
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
  insert into public.inventory_events(campaign_id, character_id, item_id, actor_id, kind, quantity_delta,
    before_value, after_value, request_id, undo_of)
    values (stack.campaign_id, stack.character_id, stack.id, auth.uid(), 'undo', -original.quantity_delta,
      before, private.item_snapshot(stack), request_id, original.id) returning id into event_id;
  update public.inventory_events set undone_by = event_id where id = original.id;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('item_id', stack.id, 'event_id', event_id, 'revision', stack.revision));
end;
$$;

create function public.set_character_portrait(target_campaign uuid, target_character uuid, new_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if new_path is not null and (split_part(new_path, '/', 2) <> target_campaign::text
      or split_part(new_path, '/', 3) <> target_character::text) then
    raise exception 'Invalid portrait' using errcode = '22023'; end if;
  update public.character_sheets set portrait_path = new_path
    where campaign_id = target_campaign and character_id = target_character;
end;
$$;

-- Sheet saves keep AC in step with equipment when no manual override is set.
create function private.sheet_armor_class_follows_equipment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.recompute_armor_class(new.campaign_id, new.character_id);
  return null;
end;
$$;
revoke all on function private.sheet_armor_class_follows_equipment() from public, anon, authenticated;
create trigger sheets_armor_class after update of build on public.character_sheets
  for each row execute function private.sheet_armor_class_follows_equipment();

revoke all on function
  public.save_item_definition(uuid, uuid, bigint, jsonb, uuid),
  public.grant_item(uuid, uuid, uuid, integer, uuid),
  public.use_item(uuid, uuid, bigint, integer, uuid),
  public.remove_item(uuid, uuid, bigint, integer, uuid),
  public.equip_item(uuid, uuid, bigint, text, uuid),
  public.unequip_item(uuid, uuid, bigint, uuid),
  public.undo_inventory_event(uuid, uuid, uuid),
  public.set_character_portrait(uuid, uuid, text)
  from public, anon;
grant execute on function
  public.save_item_definition(uuid, uuid, bigint, jsonb, uuid),
  public.grant_item(uuid, uuid, uuid, integer, uuid),
  public.use_item(uuid, uuid, bigint, integer, uuid),
  public.remove_item(uuid, uuid, bigint, integer, uuid),
  public.equip_item(uuid, uuid, bigint, text, uuid),
  public.unequip_item(uuid, uuid, bigint, uuid),
  public.undo_inventory_event(uuid, uuid, uuid),
  public.set_character_portrait(uuid, uuid, text)
  to authenticated;

-- Portrait objects live in one private bucket: '{public|pre}/{campaign}/{character}/{uuid}.{ext}'.
-- The prefix selects the schema whose authorization applies; dynamic SQL avoids a storage
-- dependency on pre_private, which the PRE ETL replaces.
create function private.can_access_portrait(object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare env text := split_part(object_name, '/', 1); campaign uuid; character uuid; allowed boolean;
begin
  begin
    campaign := split_part(object_name, '/', 2)::uuid;
    character := split_part(object_name, '/', 3)::uuid;
  exception when others then return false;
  end;
  if env = 'public' then return private.can_play_character(campaign, character); end if;
  if env = 'pre' and to_regprocedure('pre_private.can_play_character(uuid,uuid)') is not null then
    execute 'select pre_private.can_play_character($1, $2)' into allowed using campaign, character;
    return coalesce(allowed, false);
  end if;
  return false;
end;
$$;
revoke all on function private.can_access_portrait(text) from public, anon;
grant execute on function private.can_access_portrait(text) to authenticated;

do $storage$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('character-portraits', 'character-portraits', false, 1048576,
      array['image/webp', 'image/png', 'image/jpeg'])
    on conflict (id) do nothing;
  execute $p$create policy portraits_read on storage.objects for select to authenticated
    using (bucket_id = 'character-portraits' and private.can_access_portrait(name))$p$;
  execute $p$create policy portraits_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'character-portraits' and private.can_access_portrait(name))$p$;
  execute $p$create policy portraits_delete on storage.objects for delete to authenticated
    using (bucket_id = 'character-portraits' and private.can_access_portrait(name))$p$;
end
$storage$;

comment on table public.item_definitions is 'RYT-004 campaign item catalog. RPC writes only; players create price-free definitions.';
comment on table public.inventory_items is 'RYT-004 character item stacks; equipped rows hold one unit. RPC writes only.';
comment on table public.inventory_events is 'RYT-004 immutable inventory ledger with compensating undo events.';
