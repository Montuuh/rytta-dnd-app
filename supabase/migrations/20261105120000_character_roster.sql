-- RYT-044: Player character roster with one active character (ADR 026).
-- A Player owns up to 4 characters per campaign and plays exactly one of them: the active one.
-- Only active characters take part in campaign lists (Party overview, trades, shop pickers);
-- inactive ones stay readable and editable by their owner (existing RLS) and by campaign DMs.
--
-- Invariants (database-enforced):
--   * characters.is_active: unassigned characters are always active (check constraint), so DM
--     characters waiting for a Player keep appearing in DM lists.
--   * At most one active character per (campaign, Player): partial unique index.
--   * At least one active character whenever a Player owns any, and at most 4 per Player and
--     campaign: deferred constraint trigger checked at commit, so RPCs can swap in two steps.
--
-- Data migration: the column defaults to true. Before this migration a Player could own at most
-- one character per campaign (characters_one_player), so every existing assigned character
-- becomes that Player's active character and unassigned ones stay in play. No row is deleted.
--
-- Actor matrix:
--   anon: no execution of any RPC below.
--   outsider / inactive member / DM of another campaign: create_own_character and
--           set_active_character raise Forbidden or Character unavailable; RLS hides rows.
--   active Player: create_own_character (own roster, limit 4, idempotent request id);
--           set_active_character on an own character only (not another Player's); refused
--           while the current active character is in an open trade or a running encounter.
--   active campaign DM: unchanged DM tools. create_character makes unassigned characters;
--           assign_character / invitations link a character to a Player below the limit (it
--           becomes active only when the Player has none); unassign_character promotes the
--           Player's oldest remaining character when the active one is unlinked. DMs do not
--           switch a Player's active character.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) exists
-- and predates this migration, the same DDL runs remapped with pre_admin.remap (the ETL's
-- canonical remapping). Apply to PRE first, validate, then to production.

do $roster$
declare ddl text := $ddl$
  alter table public.characters add column is_active boolean not null default true;
  comment on column public.characters.is_active is
    'RYT-044: the Player''s character in play. Exactly one per Player and campaign; unassigned characters are always active. RPC writes only.';

  -- The one-character-per-Player unique constraint is replaced by the roster rules. Its name
  -- differs between production and an ETL-cloned PRE, so it is found by definition.
  do $drop$
  declare con text;
  begin
    for con in select conname from pg_constraint
      where conrelid = 'public.characters'::regclass and contype = 'u'
        and pg_get_constraintdef(oid) = 'UNIQUE (campaign_id, user_id)' loop
      execute format('alter table public.characters drop constraint %I', con);
    end loop;
  end;
  $drop$;

  alter table public.characters add constraint characters_unassigned_active
    check (user_id is not null or is_active);
  create unique index characters_one_active on public.characters(campaign_id, user_id)
    where is_active and user_id is not null;

  -- Deferred so a switch (deactivate, then activate) is checked once, at commit.
  create function private.check_character_roster() returns trigger
  language plpgsql security definer set search_path = '' as $$
  declare pair record; total integer; active_count integer;
  begin
    for pair in
      select distinct x.campaign_id, x.user_id from (values
        (case when tg_op <> 'INSERT' then old.campaign_id end, case when tg_op <> 'INSERT' then old.user_id end),
        (case when tg_op <> 'DELETE' then new.campaign_id end, case when tg_op <> 'DELETE' then new.user_id end)
      ) x(campaign_id, user_id) where x.user_id is not null
    loop
      select count(*), count(*) filter (where c.is_active) into total, active_count
        from public.characters c where c.campaign_id = pair.campaign_id and c.user_id = pair.user_id;
      if total > 4 then raise exception 'Character limit' using errcode = 'P0001'; end if;
      if total > 0 and active_count <> 1 then
        raise exception 'Active character required' using errcode = 'P0001'; end if;
    end loop;
    return null;
  end;
  $$;
  revoke all on function private.check_character_roster() from public, anon, authenticated;
  create constraint trigger characters_roster
    after insert or delete or update of user_id, is_active on public.characters
    deferrable initially deferred for each row execute function private.check_character_roster();

  create table private.character_requests (
    request_id uuid primary key,
    actor_id uuid not null,
    payload jsonb not null,
    character_id uuid not null references public.characters(id) on delete cascade,
    created_at timestamptz not null default now()
  );
  revoke all on private.character_requests from public, anon, authenticated;
  alter table private.character_requests enable row level security;

  -- A Player adds a character to the own roster. The first one becomes active.
  create function public.create_own_character(target_campaign uuid, character_name text, request_id uuid)
  returns uuid language plpgsql security definer set search_path = '' as $$
  declare viewer uuid := auth.uid(); result uuid; prior private.character_requests;
    payload jsonb := jsonb_build_array('create_own', target_campaign, character_name);
  begin
    if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
    perform 1 from public.campaigns where id = target_campaign for update;
    if not exists (select 1 from public.campaign_members m where m.campaign_id = target_campaign
        and m.user_id = viewer and m.active and m.role = 'player') then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
    select * into prior from private.character_requests r
      where r.request_id = create_own_character.request_id;
    if prior.request_id is not null then
      if prior.actor_id <> viewer or prior.payload <> payload then
        raise exception 'Request mismatch' using errcode = '22023'; end if;
      return prior.character_id;
    end if;
    if character_name is null or char_length(trim(character_name)) not between 1 and 100 then
      raise exception 'Invalid name' using errcode = '22023'; end if;
    if (select count(*) from public.characters c
        where c.campaign_id = target_campaign and c.user_id = viewer) >= 4 then
      raise exception 'Character limit' using errcode = 'P0001'; end if;
    insert into public.characters(campaign_id, user_id, name, is_active)
      values (target_campaign, viewer, trim(character_name), not exists (
        select 1 from public.characters c
         where c.campaign_id = target_campaign and c.user_id = viewer and c.is_active))
      returning id into result;
    insert into public.character_resources(campaign_id, character_id) values (target_campaign, result);
    insert into private.character_requests(request_id, actor_id, payload, character_id)
      values (create_own_character.request_id, viewer, payload, result);
    return result;
  end;
  $$;

  -- The owner switches the active character. Repeating the call is a no-op.
  create function public.set_active_character(target_campaign uuid, target_character uuid)
  returns uuid language plpgsql security definer set search_path = '' as $$
  declare viewer uuid := auth.uid(); target public.characters; current_active uuid;
  begin
    if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_member(target_campaign) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    select * into target from public.characters c
      where c.campaign_id = target_campaign and c.id = target_character and c.user_id = viewer
      for update;
    if target.id is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
    if target.is_active then return target.id; end if;
    select c.id into current_active from public.characters c
      where c.campaign_id = target_campaign and c.user_id = viewer and c.is_active for update;
    if current_active is not null then
      if private.trade_busy(target_campaign, current_active) then
        raise exception 'Trade busy' using errcode = 'P0001'; end if;
      if exists (select 1 from public.encounter_combatants x
          join public.encounters e on e.campaign_id = x.campaign_id and e.id = x.encounter_id
          where x.campaign_id = target_campaign and x.character_id = current_active
            and e.status in ('initiative', 'active')) then
        raise exception 'Character in combat' using errcode = 'P0001'; end if;
      update public.characters set is_active = false where id = current_active;
    end if;
    update public.characters set is_active = true where id = target.id;
    return target.id;
  end;
  $$;

  revoke all on function public.create_own_character(uuid, text, uuid),
    public.set_active_character(uuid, uuid) from public, anon;
  grant execute on function public.create_own_character(uuid, text, uuid),
    public.set_active_character(uuid, uuid) to authenticated;

  -- DM link: below the limit; active only when the Player has no active character yet.
  create or replace function public.assign_character(target_campaign uuid, target_character uuid, target_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
  begin
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
    if not exists(select 1 from public.campaign_members where campaign_id=target_campaign and user_id=target_user and active and role='player') then
      raise exception 'Player unavailable' using errcode = '42501';
    end if;
    if (select count(*) from public.characters where campaign_id=target_campaign and user_id=target_user) >= 4 then
      raise exception 'Character limit' using errcode = 'P0001';
    end if;
    update public.characters set user_id=target_user, is_active = not exists (
        select 1 from public.characters c
         where c.campaign_id = target_campaign and c.user_id = target_user and c.is_active)
      where campaign_id=target_campaign and id=target_character and user_id is null;
    if not found then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
    update public.campaign_invitations set status='revoked' where character_id=target_character and status='pending';
  end;
  $$;

  -- DM unlink: the character returns to the DM (active); a remaining one takes over if needed.
  create or replace function public.unassign_character(target_campaign uuid, target_character uuid, expected_user uuid) returns void
  language plpgsql security definer set search_path = '' as $$
  declare was_active boolean;
  begin
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
    select c.is_active into was_active from public.characters c
      where c.campaign_id = target_campaign and c.id = target_character and c.user_id = expected_user for update;
    if not found then raise exception 'Assignment changed' using errcode = 'P0001'; end if;
    update public.characters set user_id = null, is_active = true
      where campaign_id = target_campaign and id = target_character;
    if was_active then
      update public.characters set is_active = true where id = (
        select c.id from public.characters c where c.campaign_id = target_campaign
          and c.user_id = expected_user order by c.created_at, c.id limit 1);
    end if;
    update public.campaign_invitations set status = 'revoked'
      where character_id = target_character and status = 'pending';
  end;
  $$;

  create or replace function public.invite_character_player(target_campaign uuid, target_character uuid, invite_email text) returns uuid
  language plpgsql security definer set search_path = '' as $$
  declare result uuid; normalized text := lower(trim(invite_email)); recipient uuid;
  begin
    perform 1 from public.campaigns where id = target_campaign for update;
    if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
    if not exists (select 1 from public.characters where id = target_character and campaign_id = target_campaign and user_id is null)
      then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
    select id into recipient from auth.users where lower(email) = normalized;
    if exists (select 1 from public.campaign_members where campaign_id = target_campaign and user_id = recipient and active and role = 'dm')
      then raise exception 'Recipient is DM' using errcode = 'P0001'; end if;
    if (select count(*) from public.characters where campaign_id = target_campaign and user_id = recipient) >= 4
      then raise exception 'Character limit' using errcode = 'P0001'; end if;
    update public.campaign_invitations set status = 'revoked' where campaign_id = target_campaign
      and (email = normalized or character_id = target_character) and status = 'pending';
    insert into public.campaign_invitations(campaign_id, character_id, email, created_by)
      values (target_campaign, target_character, normalized, auth.uid()) returning id into result;
    return result;
  end;
  $$;

  create or replace function public.respond_campaign_invitation(invitation_id uuid, accept_invitation boolean) returns uuid
  language plpgsql security definer set search_path = '' as $$
  declare invite public.campaign_invitations; target uuid;
  begin
    select campaign_id into target from public.campaign_invitations where id = invitation_id;
    perform 1 from public.campaigns where id = target for update;
    select * into invite from public.campaign_invitations where id = invitation_id for update;
    if invite.id is null or invite.email is distinct from private.verified_email() or auth.uid() is null
      or invite.status <> 'pending' or invite.expires_at <= now()
      then raise exception 'Invitation unavailable' using errcode = '42501'; end if;
    if accept_invitation then
      if invite.character_id is not null then
        if exists (select 1 from public.campaign_members where campaign_id = target and user_id = auth.uid() and active and role = 'dm')
          then raise exception 'Recipient is DM' using errcode = 'P0001'; end if;
        if (select count(*) from public.characters where campaign_id = target and user_id = auth.uid()) >= 4
          then raise exception 'Character limit' using errcode = 'P0001'; end if;
        if not exists (select 1 from public.characters where id = invite.character_id and campaign_id = target and user_id is null)
          then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
        insert into public.campaign_members(campaign_id, user_id, role, active)
          values (target, auth.uid(), 'player', true)
          on conflict (campaign_id, user_id) do update set role = 'player', active = true;
        update public.characters set user_id = auth.uid(), is_active = not exists (
            select 1 from public.characters c
             where c.campaign_id = target and c.user_id = auth.uid() and c.is_active)
          where id = invite.character_id and campaign_id = target;
      else
        insert into public.campaign_members(campaign_id, user_id, role, active)
          values (target, auth.uid(), 'player', true)
          on conflict (campaign_id, user_id) do update set role = 'player', active = true, joined_at = now()
          where not public.campaign_members.active;
      end if;
    end if;
    update public.campaign_invitations set status = case when accept_invitation then 'accepted' else 'declined' end,
      responded_by = auth.uid() where id = invitation_id;
    return target;
  end;
  $$;

  -- Removal or leave unlinks every character of the member; unlinked characters are active.
  create or replace function public.change_campaign_member(target_campaign uuid, target_user uuid, new_role text) returns void
  language plpgsql security definer set search_path = '' as $$
  declare old_role text;
  begin
    perform 1 from public.campaigns where id = target_campaign for update;
    if new_role is not null and new_role not in ('dm', 'player') then raise exception 'Invalid role' using errcode = '22023'; end if;
    if not private.is_campaign_dm(target_campaign) and not
      (new_role is null and target_user = auth.uid() and private.is_campaign_member(target_campaign))
      then raise exception 'Forbidden' using errcode = '42501'; end if;
    select role into old_role from public.campaign_members
      where campaign_id = target_campaign and user_id = target_user and active;
    if old_role is null then raise exception 'Member unavailable' using errcode = '42501'; end if;
    if old_role = 'dm' and new_role is distinct from 'dm' and
      (select count(*) from public.campaign_members where campaign_id = target_campaign and active and role = 'dm') <= 1
      then raise exception 'Keep at least one DM' using errcode = 'P0001'; end if;
    update public.campaign_members set active = (new_role is not null), role = coalesce(new_role, role)
      where campaign_id = target_campaign and user_id = target_user;
    if new_role is null then
      update public.characters set user_id = null, is_active = true
        where campaign_id = target_campaign and user_id = target_user;
      update public.campaign_invitations set status = 'revoked' where campaign_id = target_campaign
        and email = (select lower(email) from auth.users where id = target_user) and status = 'pending';
    end if;
  end;
  $$;

  -- Party overview: only characters in play (RYT-031 projection otherwise unchanged).
  create or replace function public.get_party_overview(target_campaign uuid)
  returns table(id uuid, name text, is_own boolean, is_assigned boolean, shares_live boolean, sheet_status text,
    class_key text, class_label text, level integer, current_hp integer, max_hp integer,
    temp_hp integer, armor_class integer, exhaustion integer, conditions text[])
  language plpgsql stable security definer set search_path = '' as $$
  declare viewer uuid := auth.uid(); dm boolean;
  begin
    if viewer is null or not private.is_campaign_member(target_campaign) then
      raise exception 'Forbidden' using errcode = '42501'; end if;
    dm := private.is_campaign_dm(target_campaign);
    return query
      select c.id, c.name, c.user_id is not distinct from viewer, c.user_id is not null, c.shares_live, s.status,
        s.build->>'classKey', s.build->>'classLabel', s.level, v.current_hp, s.max_hp, v.temp_hp,
        s.armor_class, r.exhaustion::integer, v.conditions
      from public.characters c
      left join public.character_sheets s on s.campaign_id = c.campaign_id and s.character_id = c.id
      left join public.character_vitals v on v.campaign_id = c.campaign_id and v.character_id = c.id
      left join public.character_resources r on r.campaign_id = c.campaign_id and r.character_id = c.id
      where c.campaign_id = target_campaign and c.is_active
        and (dm or c.user_id = viewer or (c.user_id is not null and c.shares_live))
      order by c.created_at, c.id;
  end;
  $$;

  -- Trades start only between active characters (RYT-034 otherwise unchanged).
  create or replace function public.invite_trade(target_campaign uuid, from_character uuid, to_character uuid,
    request_id uuid)
  returns jsonb language plpgsql security definer set search_path = '' as $$
  declare payload jsonb := jsonb_build_array('trade_invite', target_campaign, from_character, to_character);
    replay jsonb; new_id uuid;
  begin
    replay := private.inventory_begin(target_campaign, from_character, request_id, payload);
    if replay is not null then return replay; end if;
    perform private.trade_sweep(target_campaign);
    -- Both characters belong to this campaign, are assigned to active members and are in play.
    if from_character = to_character or (select count(*) from public.characters c
        where c.campaign_id = target_campaign and c.id in (from_character, to_character)
          and c.user_id is not null and c.is_active) <> 2 then
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

  -- Trade state for the caller's (or previewed Player's) active character.
  create or replace function public.get_trade_state(target_campaign uuid, acting_user uuid default null)
  returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
        where c.campaign_id = target_campaign and c.user_id is not null and c.is_active and c.id <> me.id),
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

  -- Shop pickers (access, modifiers, ledger filter) list only characters in play.
  create or replace function public.get_shop_admin(target_campaign uuid) returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
  begin
    if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
    return jsonb_build_object(
      'characters', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
          'gold', r.gold) order by c.created_at)
        from public.characters c left join public.character_resources r on r.character_id = c.id
        where c.campaign_id = target_campaign and c.is_active), '[]'::jsonb),
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
$ddl$;
begin
  execute ddl;
  -- The data migration above relied on the old one-character rule; verify it held.
  if exists (select 1 from public.characters c where c.user_id is not null
      group by c.campaign_id, c.user_id having count(*) filter (where c.is_active) <> 1) then
    raise exception 'Existing characters violate the one-active rule';
  end if;
  if to_regclass('pre.characters') is not null and to_regprocedure('pre_admin.remap(text)') is not null
      and to_regclass('pre.trades') is not null and to_regclass('pre.encounter_combatants') is not null
      and not exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'characters' and column_name = 'is_active') then
    execute pre_admin.remap(ddl);
  end if;
end;
$roster$;
