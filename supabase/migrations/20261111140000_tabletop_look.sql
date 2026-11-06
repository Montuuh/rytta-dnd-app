-- RYT-064 follow-up: the table and Players know a generated scene's look (ink or painted).
--
-- The table projection carried no recipe, so a scene generated in the ink look showed painted props
-- and doors on the table screen and on Players' phones while the DM saw line art. Only the look is
-- added for everyone; the seed and the rest of the recipe stay in the DM's full view.
--
-- Environments: this file runs on production (public / private). When a PRE (pre / pre_private)
-- already has the tabletop, the same DDL is executed again remapped with pre_admin.remap.

do $look$
declare ddl text := $ddl$
create or replace function private.tabletop_scene_json(s public.tabletop_scenes, full_view boolean) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('id', s.id, 'name', s.name, 'map_kind', s.map_kind, 'map_path', s.map_path,
    'map_width', s.map_width, 'map_height', s.map_height, 'cell_px', s.cell_px, 'offset_x', s.offset_x,
    'offset_y', s.offset_y, 'cols', s.cols, 'rows', s.rows, 'ground', s.ground, 'grid_visible', s.grid_visible,
    'fog_enabled', s.fog_enabled, 'fog', s.fog, 'revision', s.revision, 'updated_at', s.updated_at,
    'look', case when s.recipe ->> 'look' in ('ink', 'painted') then s.recipe ->> 'look' end)
    || case when full_view then jsonb_build_object('rooms', s.rooms, 'recipe', s.recipe) else '{}'::jsonb end;
$fn$;

revoke all on function private.tabletop_scene_json(public.tabletop_scenes, boolean) from public, anon, authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre_private.tabletop_scene_json(pre.tabletop_scenes,boolean)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$look$;
