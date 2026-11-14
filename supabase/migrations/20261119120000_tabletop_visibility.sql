-- RYT-101: shared exploration and lighting. ADR 042.
-- No new public table or write grant. DM configures the scene and token capabilities;
-- Players may activate only authorised effects for their own active, present character.
-- Campaign locks, revision checks and idempotency protect writes. Private geometry never
-- reaches the table projection. PRE is rehearsed separately before production.

do $visibility$
declare ddl text := $ddl$
alter table public.tabletop_scenes add column if not exists visibility jsonb not null
  default '{"vision":false,"lighting":false,"radius":12,"explored":[],"visible":[],"lit":[],"bright":[],"_occupied":[]}';

create or replace function private.tabletop_data_ok(item_kind text, data jsonb, secret jsonb) returns boolean
language plpgsql immutable set search_path = '' as $fn$
declare actions jsonb;
begin
  if data is null or secret is null or jsonb_typeof(data) <> 'object' or jsonb_typeof(secret) <> 'object' then
    return false; end if;
  if item_kind in ('token', 'prop') then
    if data ? 'light_radius' and not private.tabletop_num_ok(data->'light_radius', 0, 24) then return false; end if;
    if data ? 'light_on' and jsonb_typeof(data->'light_on') <> 'boolean' then return false; end if;
    if data ? 'map_actions' and (jsonb_typeof(data->'map_actions') <> 'array'
        or not (data->'map_actions' <@ '["torch","light","reveal"]'::jsonb)) then return false; end if;
  end if;
  case item_kind
  when 'token' then
    return private.tabletop_keys_ok(data, array['color', 'size', 'srd_id', 'shape', 'light_radius', 'light_on', 'map_actions'])
      and (not data ? 'color' or data->>'color' in ('amber', 'crimson', 'forest', 'azure', 'violet', 'slate', 'ivory', 'ochre'))
      and (not data ? 'size' or data->>'size' in ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'))
      and (not data ? 'srd_id' or (data->>'srd_id' ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(data->>'srd_id') <= 80))
      and (not data ? 'shape' or data->>'shape' in ('round', 'square', 'hex'))
      and secret = '{}'::jsonb;
  when 'prop' then
    return private.tabletop_keys_ok(data, array['prop', 'tint', 'light_radius', 'light_on'])
      and coalesce(data->>'prop' ~ '^[a-z][a-z0-9-]{1,39}$', false)
      and (not data ? 'tint' or data->>'tint' in ('natural', 'amber', 'crimson', 'forest', 'azure', 'violet', 'slate', 'ivory', 'ochre'))
      and secret = '{}'::jsonb;
  when 'door' then
    if data ? 'rooms' then
      if jsonb_typeof(data->'rooms') <> 'array' or jsonb_array_length(data->'rooms') > 2 then return false; end if;
      if exists (select 1 from jsonb_array_elements(data->'rooms') r
          where jsonb_typeof(r) <> 'string' or r #>> '{}' !~ '^[a-z0-9-]{1,40}$') then return false; end if;
    end if;
    return private.tabletop_keys_ok(data, array['state', 'secret', 'rooms'])
      and coalesce(data->>'state' in ('closed', 'open', 'locked'), false)
      and (not data ? 'secret' or jsonb_typeof(data->'secret') = 'boolean')
      and secret = '{}'::jsonb;
  when 'note' then
    return data = '{}'::jsonb and private.tabletop_keys_ok(secret, array['text'])
      and private.tabletop_text_ok(secret->'text', 4000);
  when 'event' then
    actions := coalesce(secret->'actions', '{}'::jsonb);
    if not private.tabletop_keys_ok(actions, array['reveal_room', 'reveal_radius', 'show_hidden', 'card_id',
        'ambience', 'sound']) then return false; end if;
    return private.tabletop_keys_ok(data, array['fired'])
      and (not data ? 'fired' or jsonb_typeof(data->'fired') = 'boolean')
      and private.tabletop_keys_ok(secret, array['text', 'actions'])
      and private.tabletop_text_ok(secret->'text', 4000)
      and (not actions ? 'reveal_room' or (jsonb_typeof(actions->'reveal_room') = 'string' and actions->>'reveal_room' ~ '^[a-z0-9-]{1,40}$'))
      and (not actions ? 'reveal_radius' or private.tabletop_num_ok(actions->'reveal_radius', 0, 40))
      and (not actions ? 'show_hidden' or jsonb_typeof(actions->'show_hidden') = 'boolean')
      and (not actions ? 'card_id' or (jsonb_typeof(actions->'card_id') = 'string' and actions->>'card_id' ~ '^[0-9a-f-]{36}$'))
      and (not actions ? 'ambience' or actions->>'ambience' in ('dungeon', 'cave', 'forest', 'rain', 'storm', 'campfire', 'tavern', 'sea'))
      and (not actions ? 'sound' or actions->>'sound' in ('door', 'thunder', 'gong', 'swords', 'coins'));
  when 'area' then
    return private.tabletop_keys_ok(data, array['shape', 'size_ft', 'width_ft', 'angle', 'damage'])
      and coalesce(data->>'shape' in ('sphere', 'cylinder', 'cube', 'cone', 'line', 'emanation'), false)
      and private.tabletop_num_ok(data->'size_ft', 5, 500)
      and (not data ? 'width_ft' or private.tabletop_num_ok(data->'width_ft', 5, 100))
      and (not data ? 'angle' or private.tabletop_num_ok(data->'angle', -360, 360))
      and (not data ? 'damage' or data->>'damage' in ('fire', 'cold', 'lightning', 'thunder', 'acid', 'poison',
        'necrotic', 'radiant', 'force'))
      and secret = '{}'::jsonb;
  else
    return false;
  end case;
end;
$fn$;

-- Ray/segment intersection: the fraction along the ray, or null.
create or replace function private.tabletop_cross(ax float8, ay float8, bx float8, by_ float8,
  cx float8, cy float8, dx float8, dy float8) returns float8
language plpgsql immutable set search_path = '' as $fn$
declare den float8; t float8; u float8;
begin
  den := (bx-ax)*(dy-cy)-(by_-ay)*(dx-cx);
  if abs(den)<0.000001 then return null; end if;
  t := ((cx-ax)*(dy-cy)-(cy-ay)*(dx-cx))/den;
  u := ((cx-ax)*(by_-ay)-(cy-ay)*(bx-ax))/den;
  if t > 0.00001 and t < 0.99999 and u >= -0.001 and u <= 1.001 then return t; end if;
  return null;
end;
$fn$;

-- Radius-limited rays stop at closed doors and the edge of mapped floor.
-- Uploaded room boundaries are walls, except at an open doorway. An open doorway
-- admits a narrow beam for at most two more squares of light, never a whole room.
create or replace function private.tabletop_ray(ax float8, ay float8, bx float8, by_ float8,
  cols integer, rows integer, floor_map integer[], doors jsonb, bounded boolean,
  room_walls boolean, light boolean) returns boolean
language plpgsql immutable set search_path = '' as $fn$
declare d jsonb; a float8; vx float8; vy float8; hit float8; dist float8;
  steps integer; px float8; py float8; previous integer; cell integer; ix integer; iy integer;
  near_open boolean;
begin
  dist := sqrt((bx-ax)^2+(by_-ay)^2);
  for d in select value from jsonb_array_elements(doors) loop
    a := (d->>'rotation')::float8*pi()/180;
    vx := cos(a)*(d->>'w')::float8/2; vy := sin(a)*(d->>'w')::float8/2;
    hit := private.tabletop_cross(ax,ay,bx,by_,(d->>'x')::float8-vx,(d->>'y')::float8-vy,
      (d->>'x')::float8+vx,(d->>'y')::float8+vy);
    if hit is not null and (d->>'state' <> 'open' or (light and dist*(1-hit)>2)) then return false; end if;
  end loop;
  if not bounded then return true; end if;
  steps := greatest(1,ceil(dist*4)::integer);
  previous := floor_map[greatest(1,least(cols*rows,floor(ay)::integer*cols+floor(ax)::integer+1))];
  for k in 1..steps loop
    px := ax+(bx-ax)*k/steps; py := ay+(by_-ay)*k/steps;
    ix := floor(px)::integer; iy := floor(py)::integer;
    if ix<0 or iy<0 or ix>=cols or iy>=rows then return false; end if;
    cell := floor_map[iy*cols+ix+1];
    if cell=0 or (room_walls and cell<>previous) then
      select exists(select 1 from jsonb_array_elements(doors) j
        where j->>'state'='open' and
        abs((px-(j->>'x')::float8)*cos((j->>'rotation')::float8*pi()/180)
          +(py-(j->>'y')::float8)*sin((j->>'rotation')::float8*pi()/180)) <= (j->>'w')::float8/2+0.05
        and abs(-(px-(j->>'x')::float8)*sin((j->>'rotation')::float8*pi()/180)
          +(py-(j->>'y')::float8)*cos((j->>'rotation')::float8*pi()/180)) <= 0.65)
        into near_open;
      if not near_open then return false; end if;
    end if;
    previous := cell;
  end loop;
  return true;
end;
$fn$;

create or replace function private.tabletop_visibility(s public.tabletop_scenes, pulse uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare floors integer[] := array_fill(0,array[s.cols*s.rows]);
  seen boolean[] := array_fill(false,array[s.cols*s.rows]);
  lit boolean[] := array_fill(false,array[s.cols*s.rows]);
  bright boolean[] := array_fill(false,array[s.cols*s.rows]);
  occupied boolean[] := array_fill(false,array[s.cols*s.rows]);
  room jsonb; r jsonb; n integer:=0; doors jsonb; source record;
  ax float8; ay float8; radius float8; vision boolean; illumination boolean;
  party boolean; bounded boolean; d float8; idx integer; signature text; geometry text;
begin
  geometry:=md5(jsonb_build_array(s.cols,s.rows,s.cell_px,s.offset_x,s.offset_y,s.map_path,s.map_kind,s.rooms)::text);
  if s.visibility->>'_geometry' is distinct from geometry then
    s.visibility:=s.visibility||'{"explored":[]}'::jsonb;
  end if;
  select md5(coalesce(jsonb_agg(jsonb_build_array(i.id,i.x,i.y,i.w,i.h,i.rotation,i.data,i.hidden,
    c.hidden,e.status,ch.id,ch.is_active,ch.absent,ch.archived_at) order by i.id)::text,'[]')
    ||geometry||jsonb_build_array(s.visibility->'vision',s.visibility->'lighting',s.visibility->'radius',s.recipe->>'kind',pulse)::text)
    into signature from public.tabletop_items i
    left join public.encounter_combatants c on c.campaign_id=i.campaign_id and c.id=i.combatant_id
    left join public.encounters e on e.id=c.encounter_id
    left join public.characters ch on ch.campaign_id=i.campaign_id and ch.id=coalesce(i.character_id,c.character_id)
    where i.scene_id=s.id;
  if pulse is null and s.visibility->>'_sources'=signature then return s.visibility; end if;
  s.visibility:=s.visibility||jsonb_build_object('_sources',signature,'_geometry',geometry);
  vision := (s.visibility->>'vision')::boolean; illumination := (s.visibility->>'lighting')::boolean;
  if not vision and not illumination then
    return s.visibility || '{"visible":[],"lit":[],"bright":[],"_occupied":[]}'::jsonb;
  end if;
  for room in select value from jsonb_array_elements(s.rooms) loop
    n:=n+1;
    for r in select value from jsonb_array_elements(room->'rects') loop
      for y in greatest(0,(r->>1)::integer)..least(s.rows-1,(r->>1)::integer+(r->>3)::integer-1) loop
        for x in greatest(0,(r->>0)::integer)..least(s.cols-1,(r->>0)::integer+(r->>2)::integer-1) loop
          floors[y*s.cols+x+1]:=n;
        end loop;
      end loop;
    end loop;
  end loop;
  bounded := n>0 and coalesce(s.recipe->>'kind','')<>'forest';
  select coalesce(jsonb_agg(jsonb_build_object('x',x,'y',y,'w',w,'rotation',rotation,'state',data->>'state')),'[]')
    into doors from public.tabletop_items where scene_id=s.id and kind='door';
  for source in select i.*, ch.id as party_id from public.tabletop_items i
    left join public.encounter_combatants c on c.campaign_id=i.campaign_id and c.id=i.combatant_id
    left join public.encounters e on e.id=c.encounter_id
    left join public.characters ch on ch.campaign_id=i.campaign_id and ch.id=coalesce(i.character_id,c.character_id)
      and ch.is_active and ch.archived_at is null and not ch.absent
    where i.scene_id=s.id and not i.hidden and i.kind in ('token','prop')
      and (coalesce(i.character_id,c.character_id) is null or ch.id is not null)
      and (i.combatant_id is null or (not c.hidden and e.status<>'draft')) loop
    party := source.kind='token' and source.party_id is not null and (pulse is null or pulse=source.id);
    if party then
      for cy in greatest(0,floor(source.y)::integer)..least(s.rows-1,ceil(source.y+source.h)::integer-1) loop
        for cx in greatest(0,floor(source.x)::integer)..least(s.cols-1,ceil(source.x+source.w)::integer-1) loop
          occupied[cy*s.cols+cx+1]:=true;
        end loop;
      end loop;
    end if;
    ax:=source.x+source.w/2; ay:=source.y+source.h/2;
    radius:=coalesce((source.data->>'light_radius')::float8,
      case when source.data->>'prop' in ('torch','brazier','campfire','hearth','lantern-post','candles') then 4 else 0 end);
    if not coalesce((source.data->>'light_on')::boolean,true) then radius:=0; end if;
    for y in greatest(0,floor(ay-greatest(radius*2,case when party then (s.visibility->>'radius')::integer else 0 end))::integer)
      ..least(s.rows-1,ceil(ay+greatest(radius*2,case when party then (s.visibility->>'radius')::integer else 0 end))::integer) loop
      for x in greatest(0,floor(ax-greatest(radius*2,case when party then (s.visibility->>'radius')::integer else 0 end))::integer)
        ..least(s.cols-1,ceil(ax+greatest(radius*2,case when party then (s.visibility->>'radius')::integer else 0 end))::integer) loop
        d:=sqrt((x+0.5-ax)^2+(y+0.5-ay)^2); idx:=y*s.cols+x+1;
        if party and vision and d<=(s.visibility->>'radius')::integer and not seen[idx]
          and private.tabletop_ray(ax,ay,x+0.5,y+0.5,s.cols,s.rows,floors,doors,bounded,s.map_kind='upload',false) then seen[idx]:=true; end if;
        if illumination and radius>0 and d<=radius*2 and (not lit[idx] or (d<=radius and not bright[idx]))
          and private.tabletop_ray(ax,ay,x+0.5,y+0.5,s.cols,s.rows,floors,doors,bounded,s.map_kind='upload',true) then
          lit[idx]:=true; if d<=radius then bright[idx]:=true; end if;
        end if;
      end loop;
    end loop;
  end loop;
  return s.visibility || jsonb_build_object(
    '_occupied',(select coalesce(jsonb_agg(i-1),'[]') from generate_subscripts(occupied,1) i where occupied[i]),
    'visible',(select coalesce(jsonb_agg(i-1),'[]') from generate_subscripts(seen,1) i where seen[i]),
    'lit',(select coalesce(jsonb_agg(i-1),'[]') from generate_subscripts(lit,1) i where lit[i]),
    'bright',(select coalesce(jsonb_agg(i-1),'[]') from generate_subscripts(bright,1) i where bright[i]));
end;
$fn$;

create or replace function private.tabletop_bump(target_campaign uuid, target_scene uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
declare s public.tabletop_scenes; v jsonb; known jsonb;
begin
  if target_scene is not null then
    select * into s from public.tabletop_scenes where campaign_id=target_campaign and id=target_scene;
    if s.id is not null then
      v:=private.tabletop_visibility(s);
      select coalesce(jsonb_agg(distinct cell),'[]') into known from (
        select value as cell from jsonb_array_elements(v->'explored')
        union all select value from jsonb_array_elements(v->'_occupied')
        union all
        select value from jsonb_array_elements(case when (v->>'vision')::boolean then v->'visible' else v->'lit' end)
        where not (v->>'lighting')::boolean or v->'lit' @> jsonb_build_array(value)
      ) cells;
      update public.tabletop_scenes set visibility=v||jsonb_build_object('explored',known) where id=s.id;
    end if;
  end if;
  update public.tabletop_live set revision=revision+1,updated_at=now()
    where campaign_id=target_campaign and (target_scene is null or scene_id=target_scene);
end;
$fn$;

create or replace function public.set_tabletop_visibility(target_campaign uuid,target_scene uuid,
  settings jsonb,expected_revision bigint,request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare s public.tabletop_scenes; payload jsonb; prior jsonb; result jsonb;
begin
  payload:=jsonb_build_object('op','visibility','campaign',target_campaign,'scene',target_scene,'settings',settings,'revision',expected_revision);
  prior:=private.tabletop_begin(target_campaign,request_id,payload); if prior is not null then return prior; end if;
  s:=private.tabletop_scene(target_campaign,target_scene);
  if expected_revision is distinct from s.revision then raise exception 'Stale revision' using errcode='40001'; end if;
  if not private.tabletop_keys_ok(settings,array['vision','lighting','radius'])
    or (settings?'vision' and jsonb_typeof(settings->'vision')<>'boolean')
    or (settings?'lighting' and jsonb_typeof(settings->'lighting')<>'boolean')
    or (settings?'radius' and (not private.tabletop_num_ok(settings->'radius',1,24) or (settings->>'radius')::numeric<>trunc((settings->>'radius')::numeric))) then
    raise exception 'Invalid visibility' using errcode='22023'; end if;
  update public.tabletop_scenes set visibility=visibility||settings,revision=revision+1,updated_at=now() where id=s.id;
  perform private.tabletop_bump(target_campaign,s.id);
  select visibility into result from public.tabletop_scenes where id=s.id;
  return private.tabletop_finish(request_id,payload,result);
end;
$fn$;

create or replace function public.activate_tabletop_effect(target_campaign uuid,target_item uuid,
  effect text,request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare i public.tabletop_items; s public.tabletop_scenes; prior private.tabletop_requests;
  payload jsonb; character uuid; result jsonb; v jsonb; known jsonb; original jsonb;
begin
  perform 1 from public.campaigns where id=target_campaign for update;
  if auth.uid() is null or not private.is_campaign_member(target_campaign)
    or not exists(select 1 from public.campaigns where id=target_campaign and 'tabletop'=any(player_modules)) then
    raise exception 'Forbidden' using errcode='42501'; end if;
  select * into i from public.tabletop_items where campaign_id=target_campaign and id=target_item and kind='token' and not hidden;
  select * into s from public.tabletop_scenes where id=i.scene_id;
  select coalesce(i.character_id,c.character_id) into character from (select 1) a
    left join public.encounter_combatants c on c.id=i.combatant_id and c.campaign_id=target_campaign;
  if i.id is null or not exists(select 1 from public.characters ch where ch.id=character
      and ch.campaign_id=target_campaign and ch.user_id=auth.uid() and ch.is_active and not ch.absent and ch.archived_at is null)
    or not exists(select 1 from public.tabletop_live where campaign_id=target_campaign and scene_id=i.scene_id)
    or not coalesce((s.visibility->>'lighting')::boolean or (s.visibility->>'vision')::boolean,false)
    or (i.combatant_id is not null and not exists(select 1 from public.encounter_combatants c
      join public.encounters e on e.id=c.encounter_id where c.id=i.combatant_id and not c.hidden and e.status<>'draft')) then
    raise exception 'Forbidden' using errcode='42501'; end if;
  if effect is null or effect not in ('off','torch','light','reveal') or
    (effect<>'off' and not coalesce(i.data->'map_actions' ? effect,false)) or
    (effect='off' and not coalesce(i.data->'map_actions' ?| array['torch','light'],false)) then
    raise exception 'Forbidden effect' using errcode='42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode='22023'; end if;
  payload:=jsonb_build_object('op','effect','campaign',target_campaign,'item',target_item,'effect',effect);
  select * into prior from private.tabletop_requests r where r.request_id=activate_tabletop_effect.request_id;
  if prior.request_id is not null then
    if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Request mismatch'; end if;
    return prior.result;
  end if;
  if effect='reveal' then
    -- A reveal pulse remembers only cells in line of sight, never secret creatures or rooms.
    original:=s.visibility;
    s.visibility:=s.visibility||'{"vision":true,"lighting":false,"radius":6}'::jsonb;
    -- The pulse originates only from the activating token.
    v:=private.tabletop_visibility(s,i.id);
    select coalesce(jsonb_agg(distinct cell),'[]') into known from (
      select value cell from jsonb_array_elements(original->'explored')
      union all select value from jsonb_array_elements(v->'visible') where
        sqrt(((value::text)::integer%s.cols+0.5-i.x-i.w/2)^2+
          (floor((value::text)::integer::numeric/s.cols)+0.5-i.y-i.h/2)^2)<=6
    ) cells;
    update public.tabletop_scenes set visibility=visibility||jsonb_build_object('explored',known) where id=s.id;
  else
    update public.tabletop_items set data=data||jsonb_build_object('light_on',effect<>'off','light_radius',coalesce((i.data->>'light_radius')::numeric,4)),
      revision=revision+1,updated_at=now() where id=i.id;
  end if;
  perform private.tabletop_bump(target_campaign,s.id);
  result:=jsonb_build_object('ok',true);
  return private.tabletop_finish(request_id,payload,result);
end;
$fn$;

create or replace function private.tabletop_scene_json(s public.tabletop_scenes, full_view boolean) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('id', s.id, 'name', s.name, 'map_kind', s.map_kind, 'map_path', s.map_path,
    'map_width', s.map_width, 'map_height', s.map_height, 'cell_px', s.cell_px, 'offset_x', s.offset_x,
    'offset_y', s.offset_y, 'cols', s.cols, 'rows', s.rows, 'ground', s.ground, 'grid_visible', s.grid_visible,
    'fog_enabled', s.fog_enabled, 'fog', s.fog, 'revision', s.revision, 'updated_at', s.updated_at,
    'visibility', case when full_view then s.visibility else (s.visibility - '_sources' - '_geometry' - '_occupied') || jsonb_build_object(
      'visible',(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(s.visibility->'visible') intersect select value from jsonb_array_elements(s.visibility->'explored')) known),
      'lit',(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(s.visibility->'lit') intersect select value from jsonb_array_elements(s.visibility->'explored')) known),
      'bright',(select coalesce(jsonb_agg(value),'[]') from (select value from jsonb_array_elements(s.visibility->'bright') intersect select value from jsonb_array_elements(s.visibility->'explored')) known)) end, 'look', case when s.recipe ->> 'look' in ('ink', 'painted') then s.recipe ->> 'look' end)
    || case when full_view then jsonb_build_object('rooms', s.rooms, 'recipe', s.recipe) else '{}'::jsonb end;
$fn$;


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
          'label', case when c.id is not null and c.kind <> 'character' then coalesce(c.public_name, c.name)
            when c.id is not null then c.name when ch.id is not null then ch.name else i.label end,
          'combatant_id', i.combatant_id, 'character_id', coalesce(i.character_id, c.character_id),
          'controllable', exists(select 1 from public.characters own where own.id=coalesce(i.character_id,c.character_id)
            and own.campaign_id=target_campaign and own.user_id=auth.uid() and own.is_active and not own.absent and own.archived_at is null),
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
          and (i.combatant_id is null or (not c.hidden and e.status <> 'draft'))
          and (not ((s.visibility->>'vision')::boolean or (s.visibility->>'lighting')::boolean)
            or exists(select 1 from public.characters own where own.id=coalesce(i.character_id,c.character_id)
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


revoke all on function private.tabletop_cross(float8,float8,float8,float8,float8,float8,float8,float8),
  private.tabletop_ray(float8,float8,float8,float8,integer,integer,integer[],jsonb,boolean,boolean,boolean),
  private.tabletop_visibility(public.tabletop_scenes,uuid) from public,anon,authenticated;
revoke all on function public.set_tabletop_visibility(uuid,uuid,jsonb,bigint,uuid),
  public.activate_tabletop_effect(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.set_tabletop_visibility(uuid,uuid,jsonb,bigint,uuid),
  public.activate_tabletop_effect(uuid,uuid,text,uuid) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.tabletop_scenes') is not null then execute pre_admin.remap(ddl); end if;
end;
$visibility$;
