-- RYT-109 (part one): the two members of a trade see the picture and description of every item on
-- the table, their own and their partner's.
--
-- What.
-- 1. private.trade_items_json (latest definition 20261120120000): each offered item also carries
--    image_path and description from its definition. It feeds get_trade_state's 'trade' and
--    'recent', which return only trades the caller's character takes part in.
-- 2. private.can_read_item_image (latest definition 20261120120000, the storage read rule for
--    item-images): a campaign member may also sign the picture of a definition whose item is
--    offered in an invited or open, unexpired trade in which one of the member's own active
--    characters takes part. This deliberately shows the partner the item's description before it
--    changes hands (the owner offered it). Members of another trade, outsiders and other campaigns gain nothing; the DM and
--    the existing branches are unchanged.
-- Additive: the frontend in production ignores the new keys, so the migration can precede the
-- release.
--
-- Security. Both functions stay security definer with search_path '' and no execute for public,
-- anon or authenticated (item_image_access, the storage policy helper, is unchanged and calls
-- can_read_item_image). No table, policy or grant changes.
--
-- Environments: a PRE with these objects gets the same DDL through pre_admin.remap.
do $migration$
declare ddl text := $ddl$
create or replace function private.trade_items_json(target_trade uuid, target_side text) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('item_id', o.item_id, 'definition_id', d.id,
      'name', d.name, 'icon', d.icon, 'rarity', d.rarity, 'category', d.category,
      'translations', d.translations, 'quantity', o.quantity,
      -- RYT-109: both members of the trade see what is on the table.
      'image_path', d.image_path, 'description', d.description) order by d.name, o.item_id), '[]'::jsonb)
    from public.trade_offer_items o
    join public.inventory_items i on i.campaign_id = o.campaign_id and i.id = o.item_id
    join public.item_definitions d on d.campaign_id = i.campaign_id and d.id = i.definition_id
   where o.trade_id = target_trade and o.side = target_side);
end;
$fn$;
revoke all on function private.trade_items_json(uuid, text) from public, anon, authenticated;

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
          -- RYT-109: an item on the table of a live trade the caller's character takes part in.
          or exists (select 1 from public.trade_offer_items o
              join public.inventory_items i on i.campaign_id = o.campaign_id and i.id = o.item_id
              join public.trades t on t.campaign_id = o.campaign_id and t.id = o.trade_id
              join public.characters c on c.campaign_id = t.campaign_id
                and c.id in (t.initiator_character, t.partner_character) and c.is_active
            where o.campaign_id = target_campaign and i.definition_id = d.id
              and t.status in ('invited', 'open') and t.expires_at > now()
              and c.user_id = auth.uid())
        )
      )));
end;
$fn$;
revoke all on function private.can_read_item_image(uuid, uuid, text) from public, anon, authenticated;
$ddl$;
begin
  if to_regprocedure('pre_private.trade_items_json(uuid,text)') is not null
      and to_regprocedure('pre_private.can_read_item_image(uuid,uuid,text)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;
