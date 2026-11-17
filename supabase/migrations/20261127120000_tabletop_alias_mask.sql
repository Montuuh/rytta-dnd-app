-- RYT-113: the map no longer uncovers a player character that combat shows under a table alias.
--
-- get_tabletop (same signature and grants; latest definition 20261119120000) gave Players and the
-- table screen, for a token of a character under an alias, label = the real name and character_id
-- (which the board turns into the party portrait). The combat projection (20261126120000) already
-- masks such a character; the map now follows the same rule.
--
-- Rule, for every caller except the DM's full view and the character's own Player off the table
-- screen: a token linked to a character (directly through character_id or through a character
-- combatant) is masked while that character has a visible combatant with a public_name in the
-- campaign's live encounter (status initiative or active; the encounters_live index allows one).
-- Drafts are not on the table yet and would leak a prepared alias; an ended encounter no longer
-- disguises anyone. When the token's own combatant is in the live encounter its alias wins.
-- A masked token carries label = the alias, character_id = null (the key stays, so the projection
-- shape is unchanged) and no data.srd_id. combatant_id stays: get_combat_state already masks that
-- row. controllable stays a server-derived boolean (the owner's lighting actions keep working;
-- activate_tabletop_effect derives the character itself). Hidden items, hidden combatants and
-- draft combatants stay excluded, as before. The DM's full view is unchanged.
--
-- tabletop_live (the only tabletop table in the realtime publication) holds no item, name or
-- character data, and tabletop_items stays DM-only through RLS; neither changes.
--
-- Actor matrix: anon cannot execute (no grant); outsiders and DMs of other campaigns raise
-- Forbidden through the membership check; Players need the tabletop module, as before; Players and
-- the table read the masked projection; the campaign DM's full view reads everything.
--
-- Environments: production runs the DDL on public / private. A PRE that already has the tabletop
-- visibility version (pre.get_tabletop, pre_private.tabletop_visibility) and combat aliases
-- (pre.encounter_combatants.public_name) receives the same DDL through pre_admin.remap; create or
-- replace keeps it idempotent. It depends on no migration after 20261124120000.

do $m$
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
    s.visibility:=private.tabletop_visibility(s);
    if full_view then
      select coalesce(jsonb_agg(private.tabletop_item_json(i) order by i.kind, i.updated_at), '[]'::jsonb)
        into items from public.tabletop_items i where i.scene_id = s.id;
    else
      select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'x', i.x, 'y', i.y, 'w', i.w,
          'h', i.h, 'rotation', i.rotation,
          'label', case when m.alias is not null then m.alias
            when c.id is not null and c.kind <> 'character' then coalesce(c.public_name, c.name)
            when c.id is not null then c.name when ch.id is not null then ch.name else i.label end,
          -- RYT-113: an aliased character keeps its identity off the map (the key stays, as null).
          'combatant_id', i.combatant_id, 'character_id', case when m.alias is null then k.cid end,
          'controllable', exists(select 1 from public.characters own where own.id=k.cid
            and own.campaign_id=target_campaign and own.user_id=auth.uid() and own.is_active and not own.absent and own.archived_at is null),
          'data', case when i.kind = 'door' then i.data - 'secret' - 'rooms'
            when i.kind = 'token' and (c.public_name is not null or m.alias is not null) then i.data - 'srd_id'
            else i.data end)
          order by i.kind, i.updated_at), '[]'::jsonb)
        into items
        from public.tabletop_items i
        left join public.encounter_combatants c on c.campaign_id = i.campaign_id and c.id = i.combatant_id
        left join public.encounters e on e.campaign_id = c.campaign_id and e.id = c.encounter_id
        left join public.characters ch on ch.campaign_id = i.campaign_id and ch.id = i.character_id
        cross join lateral (select coalesce(i.character_id, c.character_id) cid) k
        -- RYT-113: the live alias of the token's character, unless the viewer is its own Player off
        -- the table screen. One live encounter per campaign, so at most one alias applies.
        left join lateral (select coalesce(
            case when c.kind = 'character' and c.public_name is not null and not c.hidden
              and e.status in ('initiative', 'active') then c.public_name end,
            (select x.public_name from public.encounter_combatants x
              join public.encounters y on y.campaign_id = x.campaign_id and y.id = x.encounter_id
              where x.campaign_id = target_campaign and x.character_id = k.cid and x.kind = 'character'
                and x.public_name is not null and not x.hidden and y.status in ('initiative', 'active')
              order by y.updated_at desc, x.id limit 1)) alias
          where k.cid is not null and not exists (select 1 from public.characters o
            where o.campaign_id = target_campaign and o.id = k.cid and o.user_id = auth.uid()
              and not coalesce(as_table, false))) m on true
        where i.scene_id = s.id and not i.hidden and i.kind in ('token', 'prop', 'door', 'area')
          and not (i.kind = 'door' and coalesce((i.data->>'secret')::boolean, false))
          and (i.combatant_id is null or (not c.hidden and e.status <> 'draft'))
          and (not ((s.visibility->>'vision')::boolean or (s.visibility->>'lighting')::boolean)
            or exists(select 1 from public.characters own where own.id=k.cid
              and own.campaign_id=target_campaign and own.user_id=auth.uid() and own.is_active and not own.absent and own.archived_at is null)
            or (exists(select 1 from generate_series(greatest(0,floor(i.x)::integer),least(s.cols-1,floor(i.x+i.w-0.001)::integer)) gx,
              generate_series(greatest(0,floor(i.y)::integer),least(s.rows-1,floor(i.y+i.h-0.001)::integer)) gy
              where s.visibility->'explored' @> jsonb_build_array(gy*s.cols+gx)
                and (not (s.visibility->>'vision')::boolean or s.visibility->'visible' @> jsonb_build_array(gy*s.cols+gx))
                and (not (s.visibility->>'lighting')::boolean or s.visibility->'lit' @> jsonb_build_array(gy*s.cols+gx)))));
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
      and to_regprocedure('pre_private.tabletop_visibility(pre.tabletop_scenes,uuid)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'encounter_combatants' and column_name = 'public_name') then
    execute pre_admin.remap(ddl);
  end if;
end;
$m$;
