-- RYT-055 follow-up: the table projection shows the public name of every non-character combatant.
--
-- get_tabletop used the public name only for NPC tokens, so a lair given a public name reached the
-- table and the Players with its real name. Every combatant that is not a character now shows
-- coalesce(public_name, name), as get_combat_state already does; SRD art stays removed whenever a
-- public name is set. Nothing else changes: signature, grants and the DM's full view are the same.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has the
-- tabletop, the same DDL is executed again remapped with pre_admin.remap.

do $alias$
declare ddl text := $ddl$
create or replace function public.get_tabletop(target_campaign uuid, target_scene uuid, as_table boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare dm boolean; full_view boolean; l public.tabletop_live; s public.tabletop_scenes;
  wanted uuid; items jsonb; card jsonb; track jsonb;
begin
  if auth.uid() is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  if not dm and not exists (select 1 from public.campaigns c
      where c.id = target_campaign and 'tabletop' = any(c.player_modules)) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  full_view := dm and not coalesce(as_table, false);
  select * into l from public.tabletop_live where campaign_id = target_campaign;
  wanted := case when full_view and target_scene is not null then target_scene else l.scene_id end;
  if wanted is not null then
    select * into s from public.tabletop_scenes where campaign_id = target_campaign and id = wanted;
  end if;
  if full_view and target_scene is not null and s.id is null then
    raise exception 'Scene unavailable' using errcode = '42501'; end if;
  if s.id is not null then
    if full_view then
      select coalesce(jsonb_agg(private.tabletop_item_json(i) order by i.kind, i.updated_at), '[]'::jsonb)
        into items from public.tabletop_items i where i.scene_id = s.id;
    else
      select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'x', i.x, 'y', i.y, 'w', i.w,
          'h', i.h, 'rotation', i.rotation,
          'label', case when c.id is not null and c.kind <> 'character' then coalesce(c.public_name, c.name)
            when c.id is not null then c.name when ch.id is not null then ch.name else i.label end,
          'combatant_id', i.combatant_id, 'character_id', coalesce(i.character_id, c.character_id),
          'data', case when i.kind = 'door' then i.data - 'secret' - 'rooms'
            when i.kind = 'token' and c.public_name is not null then i.data - 'srd_id' else i.data end)
          order by i.kind, i.updated_at), '[]'::jsonb)
        into items
        from public.tabletop_items i
        left join public.encounter_combatants c on c.campaign_id = i.campaign_id and c.id = i.combatant_id
        left join public.encounters e on e.campaign_id = c.campaign_id and e.id = c.encounter_id
        left join public.characters ch on ch.campaign_id = i.campaign_id and ch.id = i.character_id
        where i.scene_id = s.id and not i.hidden and i.kind in ('token', 'prop', 'door', 'area')
          and not (i.kind = 'door' and coalesce((i.data->>'secret')::boolean, false))
          and (i.combatant_id is null or (not c.hidden and e.status <> 'draft'));
    end if;
  end if;
  if l.card_id is not null then
    select jsonb_build_object('id', k.id, 'title', k.title, 'body', k.body, 'image_path', k.image_path)
      into card from public.tabletop_cards k where k.campaign_id = target_campaign and k.id = l.card_id;
  end if;
  if l.track_id is not null then
    select jsonb_build_object('id', t.id, 'title', t.title, 'path', t.path, 'mime', t.mime)
      into track from public.tabletop_tracks t where t.campaign_id = target_campaign and t.id = l.track_id;
  end if;
  return jsonb_build_object('live', private.tabletop_live_json(l), 'role', case when dm then 'dm' else 'player' end,
    'scene', case when s.id is null then null else private.tabletop_scene_json(s, full_view) end,
    'items', coalesce(items, '[]'::jsonb), 'card', card, 'track', track);
end;
$fn$;

revoke all on function public.get_tabletop(uuid, uuid, boolean) from public, anon;
grant execute on function public.get_tabletop(uuid, uuid, boolean) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre.get_tabletop(uuid,uuid,boolean)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$alias$;
