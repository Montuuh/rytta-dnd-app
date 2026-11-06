-- RYT-055–062: the tabletop (ADR 032). Scenes with a map and grid, items on them (tokens, props,
-- doors, notes, events, areas of effect), story cards, uploaded audio tracks and one live row per
-- campaign (the scene on the table, the table frame, the shown card, audio, ping, shared measure and
-- the table screen setup).
--
-- Data:
--   tabletop_scenes   map (blank, upload or generated), grid, ground, fog {base, ops}, rooms and the
--                     generator recipe. DM-only reads.
--   tabletop_items    kind, position and size in squares, rotation, label, hidden, locked, optional
--                     link to an encounter combatant or a character, public data and DM-only secret.
--                     DM-only reads.
--   tabletop_cards    story cards: title, text, optional image. DM-only reads.
--   tabletop_tracks   uploaded audio. DM-only reads.
--   tabletop_live     one secret-free row per campaign, readable by members, in the realtime
--                     publication; its revision moves on every change members may see.
--   private.tabletop_requests  idempotent replay of request ids.
--
-- RPCs: get_tabletop (role projection), list_tabletop_scenes, get_tabletop_library (DM),
--   save_tabletop_scene, delete_tabletop_scene, put_tabletop_items, delete_tabletop_items,
--   change_tabletop_fog, set_tabletop_live, save_tabletop_card, delete_tabletop_card,
--   add_tabletop_track, delete_tabletop_track, fire_tabletop_event. Every write locks the campaign
--   row, replays a retried request id and is DM-only.
--
-- Projection: a DM editing (as_table false) gets everything of the requested scene. Players, and any
-- caller with as_table, get only the scene on the table: no notes, events, hidden items, secret doors,
-- item secrets, tokens of hidden combatants or of draft encounters, rooms or recipe; creatures under
-- an alias show the alias and no SRD id. Players read only while 'tabletop' is a player module.
--
-- Actor matrix: anon cannot execute; outsiders and inactive members raise Forbidden; Players raise
-- Forbidden on every write and on reads while the module is off; a DM of another campaign raises
-- Forbidden through the target campaign id; ids of another campaign raise "unavailable".
--
-- Storage (global, outside PRE remapping): bucket 'tabletop-media', objects
-- '{public|pre}/{campaign}/{map|card|audio}/{uuid}.{ext}'. The campaign DM reads, uploads and deletes;
-- members read the map of the scene on the table, the image of the shown card and the live track.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) has the
-- bestiary columns and not this change, the same DDL runs again remapped with pre_admin.remap.

do $tabletop$
declare ddl text := $ddl$
alter table public.campaigns drop constraint if exists campaigns_player_modules_valid;
alter table public.campaigns add constraint campaigns_player_modules_valid check (
  player_modules <@ array['party', 'inventory', 'shops', 'quests', 'combat', 'atlas', 'glossary',
    'memories', 'stronghold', 'workshop', 'tabletop']::text[]);

create table public.tabletop_scenes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  map_kind text not null default 'blank' check (map_kind in ('blank', 'upload', 'generated')),
  map_path text check (map_path is null or char_length(map_path) <= 200),
  map_width integer check (map_width between 1 and 8192),
  map_height integer check (map_height between 1 and 8192),
  cell_px numeric(8, 3) not null default 64 check (cell_px between 4 and 1024),
  offset_x numeric(9, 3) not null default 0 check (offset_x between -1024 and 1024),
  offset_y numeric(9, 3) not null default 0 check (offset_y between -1024 and 1024),
  cols integer not null default 24 check (cols between 4 and 120),
  rows integer not null default 18 check (rows between 4 and 120),
  ground text not null default 'parchment' check (ground in ('parchment', 'stone', 'grass', 'wood', 'sand')),
  grid_visible boolean not null default true,
  fog_enabled boolean not null default false,
  fog jsonb not null default '{"base":"hidden","ops":[]}'::jsonb check (jsonb_typeof(fog) = 'object'
    and pg_column_size(fog) <= 524288),
  rooms jsonb not null default '[]'::jsonb check (jsonb_typeof(rooms) = 'array' and pg_column_size(rooms) <= 262144),
  recipe jsonb check (recipe is null or (jsonb_typeof(recipe) = 'object' and pg_column_size(recipe) <= 4096)),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, id)
);
create index tabletop_scenes_campaign on public.tabletop_scenes(campaign_id, updated_at desc);

create table public.tabletop_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  scene_id uuid not null,
  kind text not null check (kind in ('token', 'prop', 'door', 'note', 'event', 'area')),
  x numeric(8, 3) not null check (x between -40 and 160),
  y numeric(8, 3) not null check (y between -40 and 160),
  w numeric(7, 3) not null default 1 check (w between 0.25 and 40),
  h numeric(7, 3) not null default 1 check (h between 0.25 and 40),
  rotation integer not null default 0 check (rotation between 0 and 359),
  label text check (label is null or char_length(btrim(label)) between 1 and 80),
  hidden boolean not null default false,
  locked boolean not null default false,
  combatant_id uuid,
  character_id uuid,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 8192),
  secret jsonb not null default '{}'::jsonb check (jsonb_typeof(secret) = 'object' and pg_column_size(secret) <= 16384),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  updated_at timestamptz not null default now(),
  unique (campaign_id, id),
  foreign key (campaign_id, scene_id) references public.tabletop_scenes(campaign_id, id) on delete cascade,
  foreign key (campaign_id, combatant_id) references public.encounter_combatants(campaign_id, id)
    on delete set null (combatant_id),
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id)
    on delete set null (character_id),
  check (kind = 'token' or (combatant_id is null and character_id is null))
);
create index tabletop_items_scene on public.tabletop_items(scene_id);
create index tabletop_items_combatant on public.tabletop_items(combatant_id) where combatant_id is not null;

create table public.tabletop_cards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null default '' check (char_length(body) <= 4000),
  image_path text check (image_path is null or char_length(image_path) <= 200),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  updated_at timestamptz not null default now(),
  unique (campaign_id, id)
);

create table public.tabletop_tracks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  path text not null check (char_length(path) <= 200),
  mime text not null check (mime in ('audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/webm')),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  created_at timestamptz not null default now(),
  unique (campaign_id, id),
  unique (path)
);

create table public.tabletop_live (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  scene_id uuid,
  view_x numeric(8, 3),
  view_y numeric(8, 3),
  card_id uuid,
  ambience text check (ambience is null or ambience in ('dungeon', 'cave', 'forest', 'rain', 'storm',
    'campfire', 'tavern', 'sea')),
  track_id uuid,
  volume integer not null default 70 check (volume between 0 and 100),
  playing boolean not null default false,
  looping boolean not null default true,
  sound jsonb check (sound is null or jsonb_typeof(sound) = 'object'),
  ping jsonb check (ping is null or jsonb_typeof(ping) = 'object'),
  measure jsonb check (measure is null or (jsonb_typeof(measure) = 'object' and pg_column_size(measure) <= 4096)),
  screen jsonb not null default '{}'::jsonb check (jsonb_typeof(screen) = 'object' and pg_column_size(screen) <= 1024),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, scene_id) references public.tabletop_scenes(campaign_id, id) on delete set null (scene_id),
  foreign key (campaign_id, card_id) references public.tabletop_cards(campaign_id, id) on delete set null (card_id),
  foreign key (campaign_id, track_id) references public.tabletop_tracks(campaign_id, id) on delete set null (track_id)
);

create table private.tabletop_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  payload jsonb not null,
  result jsonb not null
);
revoke all on private.tabletop_requests from public, anon, authenticated;
alter table private.tabletop_requests enable row level security;

alter table public.tabletop_scenes enable row level security;
alter table public.tabletop_items enable row level security;
alter table public.tabletop_cards enable row level security;
alter table public.tabletop_tracks enable row level security;
alter table public.tabletop_live enable row level security;
revoke all on public.tabletop_scenes, public.tabletop_items, public.tabletop_cards, public.tabletop_tracks,
  public.tabletop_live from public, anon, authenticated;
grant select on public.tabletop_scenes, public.tabletop_items, public.tabletop_cards, public.tabletop_tracks,
  public.tabletop_live to authenticated;
create policy tabletop_scenes_read on public.tabletop_scenes for select to authenticated
  using (private.is_campaign_dm(campaign_id));
create policy tabletop_items_read on public.tabletop_items for select to authenticated
  using (private.is_campaign_dm(campaign_id));
create policy tabletop_cards_read on public.tabletop_cards for select to authenticated
  using (private.is_campaign_dm(campaign_id));
create policy tabletop_tracks_read on public.tabletop_tracks for select to authenticated
  using (private.is_campaign_dm(campaign_id));
-- The live row carries no secret: members read it so realtime can tell them to refetch.
create policy tabletop_live_read on public.tabletop_live for select to authenticated
  using (private.is_campaign_member(campaign_id));
comment on table public.tabletop_scenes is 'ADR 032 tabletop scenes (map, grid, fog, rooms). DM-only reads. RPC writes only.';
comment on table public.tabletop_items is 'ADR 032 tabletop items in squares. DM-only reads; Players use get_tabletop. RPC writes only.';
comment on table public.tabletop_cards is 'ADR 032 story cards. DM-only reads. RPC writes only.';
comment on table public.tabletop_tracks is 'ADR 032 uploaded audio tracks (private tabletop-media objects). DM-only reads.';
comment on table public.tabletop_live is 'ADR 032 live table state, secret-free, realtime signal. RPC writes only.';

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create function private.tabletop_begin(target_campaign uuid, request_id uuid, payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare prior private.tabletop_requests;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if auth.uid() is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.tabletop_requests r where r.request_id = tabletop_begin.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result;
  end if;
  return null;
end;
$fn$;

create function private.tabletop_finish(request_id uuid, payload jsonb, result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  insert into private.tabletop_requests values (request_id, auth.uid(), payload, result);
  return result;
end;
$fn$;

-- The live row of a campaign, created on first use.
create function private.tabletop_live_row(target_campaign uuid) returns public.tabletop_live
language plpgsql security definer set search_path = '' as $fn$
declare l public.tabletop_live;
begin
  insert into public.tabletop_live (campaign_id) values (target_campaign) on conflict (campaign_id) do nothing;
  select * into l from public.tabletop_live where campaign_id = target_campaign for update;
  return l;
end;
$fn$;

-- Moves the live revision when the change is visible on the table (target_scene null: always).
create function private.tabletop_bump(target_campaign uuid, target_scene uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  update public.tabletop_live set revision = revision + 1, updated_at = now()
    where campaign_id = target_campaign and (target_scene is null or scene_id = target_scene);
end;
$fn$;

create function private.tabletop_scene(target_campaign uuid, target_scene uuid) returns public.tabletop_scenes
language plpgsql security definer set search_path = '' as $fn$
declare s public.tabletop_scenes;
begin
  select * into s from public.tabletop_scenes
    where campaign_id = target_campaign and id = target_scene for update;
  if s.id is null then raise exception 'Scene unavailable' using errcode = '42501'; end if;
  return s;
end;
$fn$;

-- Which environment this copy serves (the owning table's schema, read with an empty search path).
create function private.tabletop_env() returns text
language sql immutable security definer set search_path = '' as $fn$
  select case when 'public.tabletop_scenes'::regclass::text like 'pre.%' then 'pre' else 'public' end;
$fn$;

-- A media path of this environment, campaign and kind, and the object exists.
create function private.tabletop_media_ok(target_campaign uuid, media_kind text, media_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
declare found_object boolean; extensions text;
begin
  if media_path is null then return false; end if;
  extensions := case media_kind when 'audio' then '(mp3|ogg|m4a|webm)' else '(webp|png|jpg)' end;
  if media_path !~ ('^' || private.tabletop_env() || '/' || target_campaign || '/' || media_kind
      || '/[0-9a-f-]{36}[.]' || extensions || '$') then return false; end if;
  if to_regclass('storage.objects') is null then return false; end if;
  execute 'select exists (select 1 from storage.objects where bucket_id = ''tabletop-media'' and name = $1)'
    into found_object using media_path;
  return coalesce(found_object, false);
end;
$fn$;

-- Only these keys may appear in a JSON object.
create function private.tabletop_keys_ok(value jsonb, allowed text[]) returns boolean
language plpgsql immutable set search_path = '' as $fn$
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  return not exists (select 1 from jsonb_object_keys(value) k where not (k = any(allowed)));
end;
$fn$;

create function private.tabletop_num_ok(value jsonb, low numeric, high numeric) returns boolean
language plpgsql immutable set search_path = '' as $fn$
begin
  if value is null or jsonb_typeof(value) <> 'number' then return false; end if;
  return (value #>> '{}')::numeric between low and high;
end;
$fn$;

-- A list of [x, y, w, h] rectangles in squares.
create function private.tabletop_rects_ok(rects jsonb, max_count integer) returns boolean
language plpgsql immutable set search_path = '' as $fn$
declare r jsonb;
begin
  if rects is null or jsonb_typeof(rects) <> 'array' or jsonb_array_length(rects) not between 1 and max_count then
    return false; end if;
  for r in select e from jsonb_array_elements(rects) e loop
    if jsonb_typeof(r) <> 'array' then return false; end if;
    if jsonb_array_length(r) <> 4 then return false; end if;
    if not (private.tabletop_num_ok(r->0, -40, 160) and private.tabletop_num_ok(r->1, -40, 160)
        and private.tabletop_num_ok(r->2, 0.25, 160) and private.tabletop_num_ok(r->3, 0.25, 160)) then
      return false; end if;
  end loop;
  return true;
end;
$fn$;

create function private.tabletop_points_ok(points jsonb, max_count integer) returns boolean
language plpgsql immutable set search_path = '' as $fn$
declare p jsonb;
begin
  if points is null or jsonb_typeof(points) <> 'array' or jsonb_array_length(points) not between 1 and max_count then
    return false; end if;
  for p in select e from jsonb_array_elements(points) e loop
    if jsonb_typeof(p) <> 'array' then return false; end if;
    if jsonb_array_length(p) <> 2 then return false; end if;
    if not (private.tabletop_num_ok(p->0, -40, 160) and private.tabletop_num_ok(p->1, -40, 160)) then
      return false; end if;
  end loop;
  return true;
end;
$fn$;

-- A string field: absent, or a string within the length.
create function private.tabletop_text_ok(value jsonb, max_length integer) returns boolean
language plpgsql immutable set search_path = '' as $fn$
begin
  return value is null or (jsonb_typeof(value) = 'string' and char_length(value #>> '{}') <= max_length);
end;
$fn$;

-- The public data and DM secret of each item kind.
create function private.tabletop_data_ok(item_kind text, data jsonb, secret jsonb) returns boolean
language plpgsql immutable set search_path = '' as $fn$
declare actions jsonb;
begin
  if data is null or secret is null or jsonb_typeof(data) <> 'object' or jsonb_typeof(secret) <> 'object' then
    return false; end if;
  case item_kind
  when 'token' then
    return private.tabletop_keys_ok(data, array['color', 'size', 'srd_id', 'shape'])
      and (not data ? 'color' or data->>'color' in ('amber', 'crimson', 'forest', 'azure', 'violet', 'slate', 'ivory', 'ochre'))
      and (not data ? 'size' or data->>'size' in ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'))
      and (not data ? 'srd_id' or (data->>'srd_id' ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(data->>'srd_id') <= 80))
      and (not data ? 'shape' or data->>'shape' in ('round', 'square', 'hex'))
      and secret = '{}'::jsonb;
  when 'prop' then
    return private.tabletop_keys_ok(data, array['prop', 'tint'])
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

create function private.tabletop_scene_json(s public.tabletop_scenes, full_view boolean) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('id', s.id, 'name', s.name, 'map_kind', s.map_kind, 'map_path', s.map_path,
    'map_width', s.map_width, 'map_height', s.map_height, 'cell_px', s.cell_px, 'offset_x', s.offset_x,
    'offset_y', s.offset_y, 'cols', s.cols, 'rows', s.rows, 'ground', s.ground, 'grid_visible', s.grid_visible,
    'fog_enabled', s.fog_enabled, 'fog', s.fog, 'revision', s.revision, 'updated_at', s.updated_at)
    || case when full_view then jsonb_build_object('rooms', s.rooms, 'recipe', s.recipe) else '{}'::jsonb end;
$fn$;

create function private.tabletop_item_json(i public.tabletop_items) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('id', i.id, 'kind', i.kind, 'x', i.x, 'y', i.y, 'w', i.w, 'h', i.h,
    'rotation', i.rotation, 'label', i.label, 'hidden', i.hidden, 'locked', i.locked,
    'combatant_id', i.combatant_id, 'character_id', i.character_id, 'data', i.data, 'secret', i.secret,
    'revision', i.revision);
$fn$;

create function private.tabletop_live_json(l public.tabletop_live) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('scene_id', l.scene_id, 'view_x', l.view_x, 'view_y', l.view_y,
    'card_id', l.card_id, 'ambience', l.ambience, 'track_id', l.track_id, 'volume', coalesce(l.volume, 70),
    'playing', coalesce(l.playing, false), 'loop', coalesce(l.looping, true), 'sound', l.sound, 'ping', l.ping,
    'measure', l.measure, 'screen', coalesce(l.screen, '{}'::jsonb), 'revision', coalesce(l.revision, 0),
    'updated_at', l.updated_at);
$fn$;

-- Inserts or patches one item of a scene from a JSON entry (only the keys present change).
create function private.tabletop_put(s public.tabletop_scenes, entry jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare cur public.tabletop_items; item_id uuid; is_new boolean := false;
begin
  if jsonb_typeof(entry) <> 'object' or not private.tabletop_keys_ok(entry, array['id', 'kind', 'x', 'y', 'w',
      'h', 'rotation', 'label', 'hidden', 'locked', 'combatant_id', 'character_id', 'data', 'secret']) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  item_id := nullif(entry->>'id', '')::uuid;
  if item_id is not null then
    select * into cur from public.tabletop_items where id = item_id for update;
    if cur.id is not null and (cur.campaign_id <> s.campaign_id or cur.scene_id <> s.id) then
      raise exception 'Item unavailable' using errcode = '42501'; end if;
  end if;
  if cur.id is null then
    is_new := true;
    cur.id := coalesce(item_id, gen_random_uuid());
    cur.campaign_id := s.campaign_id; cur.scene_id := s.id; cur.kind := entry->>'kind';
    cur.x := 0; cur.y := 0; cur.w := 1; cur.h := 1; cur.rotation := 0; cur.hidden := false;
    cur.locked := false; cur.data := '{}'::jsonb; cur.secret := '{}'::jsonb; cur.revision := 0;
  elsif entry ? 'kind' and entry->>'kind' is distinct from cur.kind then
    raise exception 'Invalid request' using errcode = '22023';
  end if;
  if entry ? 'x' then cur.x := (entry->>'x')::numeric; end if;
  if entry ? 'y' then cur.y := (entry->>'y')::numeric; end if;
  if entry ? 'w' then cur.w := (entry->>'w')::numeric; end if;
  if entry ? 'h' then cur.h := (entry->>'h')::numeric; end if;
  if entry ? 'rotation' then cur.rotation := (entry->>'rotation')::integer; end if;
  if entry ? 'label' then cur.label := nullif(btrim(entry->>'label'), ''); end if;
  if entry ? 'hidden' then cur.hidden := (entry->>'hidden')::boolean; end if;
  if entry ? 'locked' then cur.locked := (entry->>'locked')::boolean; end if;
  if entry ? 'combatant_id' then cur.combatant_id := nullif(entry->>'combatant_id', '')::uuid; end if;
  if entry ? 'character_id' then cur.character_id := nullif(entry->>'character_id', '')::uuid; end if;
  if entry ? 'data' then cur.data := entry->'data'; end if;
  if entry ? 'secret' then cur.secret := entry->'secret'; end if;
  if cur.kind is null or not private.tabletop_data_ok(cur.kind, cur.data, cur.secret) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if cur.combatant_id is not null and not exists (select 1 from public.encounter_combatants c
      where c.campaign_id = s.campaign_id and c.id = cur.combatant_id) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if cur.character_id is not null and not exists (select 1 from public.characters c
      where c.campaign_id = s.campaign_id and c.id = cur.character_id) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if is_new then
    insert into public.tabletop_items (id, campaign_id, scene_id, kind, x, y, w, h, rotation, label, hidden,
        locked, combatant_id, character_id, data, secret)
      values (cur.id, cur.campaign_id, cur.scene_id, cur.kind, cur.x, cur.y, cur.w, cur.h, cur.rotation,
        cur.label, cur.hidden, cur.locked, cur.combatant_id, cur.character_id, cur.data, cur.secret)
      returning * into cur;
  else
    update public.tabletop_items set x = cur.x, y = cur.y, w = cur.w, h = cur.h, rotation = cur.rotation,
        label = cur.label, hidden = cur.hidden, locked = cur.locked, combatant_id = cur.combatant_id,
        character_id = cur.character_id, data = cur.data, secret = cur.secret, revision = revision + 1,
        updated_at = now()
      where id = cur.id returning * into cur;
  end if;
  return private.tabletop_item_json(cur);
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation
      or invalid_parameter_value or foreign_key_violation then
    raise exception 'Invalid request' using errcode = '22023';
end;
$fn$;

-- A fog operation, validated; rooms are resolved to their rectangles.
create function private.tabletop_fog_op(s public.tabletop_scenes, op jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare mode text := op->>'mode'; shape text := op->>'shape'; room jsonb;
begin
  if jsonb_typeof(op) <> 'object' or mode is null or mode not in ('reveal', 'hide') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  case shape
  when 'rect' then
    if not private.tabletop_keys_ok(op, array['mode', 'shape', 'x', 'y', 'w', 'h'])
        or not private.tabletop_num_ok(op->'x', -40, 160) or not private.tabletop_num_ok(op->'y', -40, 160)
        or not private.tabletop_num_ok(op->'w', 0.25, 160) or not private.tabletop_num_ok(op->'h', 0.25, 160) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    return op;
  when 'circle' then
    if not private.tabletop_keys_ok(op, array['mode', 'shape', 'x', 'y', 'r'])
        or not private.tabletop_num_ok(op->'x', -40, 160) or not private.tabletop_num_ok(op->'y', -40, 160)
        or not private.tabletop_num_ok(op->'r', 0.25, 80) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    return op;
  when 'brush' then
    if not private.tabletop_keys_ok(op, array['mode', 'shape', 'r', 'points'])
        or not private.tabletop_num_ok(op->'r', 0.25, 20) or not private.tabletop_points_ok(op->'points', 400) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    return op;
  when 'room' then
    if not private.tabletop_keys_ok(op, array['mode', 'shape', 'room']) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    select r into room from jsonb_array_elements(s.rooms) r where r->>'id' = op->>'room';
    if room is null then raise exception 'Invalid request' using errcode = '22023'; end if;
    return jsonb_build_object('mode', mode, 'shape', 'rects', 'rects', room->'rects');
  else
    raise exception 'Invalid request' using errcode = '22023';
  end case;
end;
$fn$;

create function private.tabletop_append_fog(s public.tabletop_scenes, op jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare ops jsonb := coalesce(s.fog->'ops', '[]'::jsonb);
begin
  if jsonb_array_length(ops) >= 500 then
    raise exception 'Fog is full' using errcode = '22023'; end if;
  update public.tabletop_scenes set fog = jsonb_build_object('base', coalesce(s.fog->>'base', 'hidden'),
      'ops', ops || jsonb_build_array(op)), revision = revision + 1, updated_at = now()
    where id = s.id;
  return jsonb_build_object('base', coalesce(s.fog->>'base', 'hidden'), 'ops', ops || jsonb_build_array(op));
end;
$fn$;

-- Members may read a media object only while it is on the table.
create function private.tabletop_can_read_media(target_campaign uuid, object_name text) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select private.is_campaign_dm(target_campaign) or (private.is_campaign_member(target_campaign)
    and exists (select 1 from public.campaigns c where c.id = target_campaign and 'tabletop' = any(c.player_modules))
    and exists (select 1 from public.tabletop_live l
      left join public.tabletop_scenes s on s.campaign_id = l.campaign_id and s.id = l.scene_id
      left join public.tabletop_cards k on k.campaign_id = l.campaign_id and k.id = l.card_id
      left join public.tabletop_tracks t on t.campaign_id = l.campaign_id and t.id = l.track_id
      where l.campaign_id = target_campaign
        and (s.map_path = object_name or k.image_path = object_name or t.path = object_name)));
$fn$;

-- ---------------------------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------------------------

create function public.get_tabletop(target_campaign uuid, target_scene uuid, as_table boolean)
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
          'label', case when c.id is not null and c.kind = 'npc' then coalesce(c.public_name, c.name)
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

create function public.list_tabletop_scenes(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'live', private.tabletop_live_json((select l from public.tabletop_live l where l.campaign_id = target_campaign)),
    'scenes', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'map_kind', s.map_kind,
        'map_path', s.map_path, 'cols', s.cols, 'rows', s.rows, 'ground', s.ground, 'fog_enabled', s.fog_enabled,
        'recipe', s.recipe, 'revision', s.revision, 'updated_at', s.updated_at,
        'items', (select count(*) from public.tabletop_items i where i.scene_id = s.id))
      order by s.updated_at desc), '[]'::jsonb) from public.tabletop_scenes s where s.campaign_id = target_campaign));
end;
$fn$;

create function public.get_tabletop_library(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'cards', (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'body', k.body,
        'image_path', k.image_path, 'revision', k.revision, 'updated_at', k.updated_at) order by k.updated_at desc),
      '[]'::jsonb) from public.tabletop_cards k where k.campaign_id = target_campaign),
    'tracks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'path', t.path,
        'mime', t.mime, 'size_bytes', t.size_bytes, 'created_at', t.created_at) order by t.created_at desc),
      '[]'::jsonb) from public.tabletop_tracks t where t.campaign_id = target_campaign));
end;
$fn$;

-- ---------------------------------------------------------------------------------------------
-- Writes (DM only)
-- ---------------------------------------------------------------------------------------------

create function public.save_tabletop_scene(target_campaign uuid, target_scene uuid, fields jsonb,
  expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('scene', target_campaign, target_scene, fields, expected_revision);
  replay jsonb; s public.tabletop_scenes; entry jsonb; room jsonb; result jsonb;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  if jsonb_typeof(fields) <> 'object' or not private.tabletop_keys_ok(fields, array['name', 'map_kind', 'map_path',
      'map_width', 'map_height', 'cell_px', 'offset_x', 'offset_y', 'cols', 'rows', 'ground', 'grid_visible',
      'fog_enabled', 'rooms', 'recipe', 'items']) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if target_scene is null then
    if coalesce(btrim(fields->>'name'), '') = '' then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    if fields ? 'items' and (jsonb_typeof(fields->'items') <> 'array' or jsonb_array_length(fields->'items') > 600) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    insert into public.tabletop_scenes (campaign_id, name, created_by)
      values (target_campaign, btrim(fields->>'name'), auth.uid())
      returning * into s;
  else
    if fields ? 'items' then raise exception 'Invalid request' using errcode = '22023'; end if;
    s := private.tabletop_scene(target_campaign, target_scene);
    if expected_revision is null or expected_revision <> s.revision then
      raise exception 'Stale scene' using errcode = '40001'; end if;
  end if;
  begin
    if fields ? 'name' then s.name := btrim(fields->>'name'); end if;
    if fields ? 'map_kind' then s.map_kind := fields->>'map_kind'; end if;
    if fields ? 'map_path' then s.map_path := nullif(fields->>'map_path', ''); end if;
    if fields ? 'map_width' then s.map_width := (fields->>'map_width')::integer; end if;
    if fields ? 'map_height' then s.map_height := (fields->>'map_height')::integer; end if;
    if fields ? 'cell_px' then s.cell_px := (fields->>'cell_px')::numeric; end if;
    if fields ? 'offset_x' then s.offset_x := (fields->>'offset_x')::numeric; end if;
    if fields ? 'offset_y' then s.offset_y := (fields->>'offset_y')::numeric; end if;
    if fields ? 'cols' then s.cols := (fields->>'cols')::integer; end if;
    if fields ? 'rows' then s.rows := (fields->>'rows')::integer; end if;
    if fields ? 'ground' then s.ground := fields->>'ground'; end if;
    if fields ? 'grid_visible' then s.grid_visible := (fields->>'grid_visible')::boolean; end if;
    if fields ? 'fog_enabled' then s.fog_enabled := (fields->>'fog_enabled')::boolean; end if;
    if fields ? 'rooms' then s.rooms := fields->'rooms'; end if;
    if fields ? 'recipe' then s.recipe := case when jsonb_typeof(fields->'recipe') = 'null' then null else fields->'recipe' end; end if;
    if s.map_path is not null and not private.tabletop_media_ok(target_campaign, 'map', s.map_path) then
      raise exception 'Image unavailable' using errcode = '22023'; end if;
    if (s.map_kind = 'blank') <> (s.map_path is null) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    if s.map_path is not null and (s.map_width is null or s.map_height is null) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    if jsonb_typeof(s.rooms) <> 'array' or jsonb_array_length(s.rooms) > 400 then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    for room in select r from jsonb_array_elements(s.rooms) r loop
      if not private.tabletop_keys_ok(room, array['id', 'rects']) or coalesce(room->>'id' !~ '^[a-z0-9-]{1,40}$', true)
          or not private.tabletop_rects_ok(room->'rects', 400) then
        raise exception 'Invalid request' using errcode = '22023'; end if;
    end loop;
    update public.tabletop_scenes set name = s.name, map_kind = s.map_kind, map_path = s.map_path,
        map_width = s.map_width, map_height = s.map_height, cell_px = s.cell_px, offset_x = s.offset_x,
        offset_y = s.offset_y, cols = s.cols, rows = s.rows, ground = s.ground, grid_visible = s.grid_visible,
        fog_enabled = s.fog_enabled, rooms = s.rooms, recipe = s.recipe,
        revision = case when target_scene is null then 0 else revision + 1 end, updated_at = now()
      where id = s.id returning * into s;
  exception
    when invalid_text_representation or numeric_value_out_of_range or check_violation then
      raise exception 'Invalid request' using errcode = '22023';
  end;
  if target_scene is null and fields ? 'items' then
    for entry in select e from jsonb_array_elements(fields->'items') e loop
      perform private.tabletop_put(s, entry - 'id');
    end loop;
  end if;
  perform private.tabletop_bump(target_campaign, s.id);
  result := private.tabletop_scene_json(s, true);
  return private.tabletop_finish(request_id, payload, result);
end;
$fn$;

create function public.delete_tabletop_scene(target_campaign uuid, target_scene uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('delete_scene', target_campaign, target_scene);
  replay jsonb; s public.tabletop_scenes; was_live boolean;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  s := private.tabletop_scene(target_campaign, target_scene);
  was_live := exists (select 1 from public.tabletop_live where campaign_id = target_campaign and scene_id = s.id);
  delete from public.tabletop_scenes where id = s.id;
  if was_live then perform private.tabletop_bump(target_campaign, null); end if;
  return private.tabletop_finish(request_id, payload, jsonb_build_object('id', s.id));
end;
$fn$;

create function public.put_tabletop_items(target_campaign uuid, target_scene uuid, items jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('items', target_campaign, target_scene, items);
  replay jsonb; s public.tabletop_scenes; entry jsonb; saved jsonb := '[]'::jsonb;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  s := private.tabletop_scene(target_campaign, target_scene);
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 600 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if (select count(*) from public.tabletop_items where scene_id = s.id)
      + (select count(*) from jsonb_array_elements(items) e where not (e ? 'id')) > 1500 then
    raise exception 'Scene is full' using errcode = '22023'; end if;
  for entry in select e from jsonb_array_elements(items) e loop
    saved := saved || jsonb_build_array(private.tabletop_put(s, entry));
  end loop;
  perform private.tabletop_bump(target_campaign, s.id);
  return private.tabletop_finish(request_id, payload, saved);
end;
$fn$;

create function public.delete_tabletop_items(target_campaign uuid, target_scene uuid, ids uuid[], request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('delete_items', target_campaign, target_scene, to_jsonb(ids));
  replay jsonb; s public.tabletop_scenes; removed integer;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  s := private.tabletop_scene(target_campaign, target_scene);
  if ids is null or cardinality(ids) not between 1 and 600 then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  delete from public.tabletop_items where scene_id = s.id and id = any(ids);
  get diagnostics removed = row_count;
  perform private.tabletop_bump(target_campaign, s.id);
  return private.tabletop_finish(request_id, payload, jsonb_build_object('removed', removed));
end;
$fn$;

create function public.change_tabletop_fog(target_campaign uuid, target_scene uuid, op jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('fog', target_campaign, target_scene, op);
  replay jsonb; s public.tabletop_scenes; new_fog jsonb;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  s := private.tabletop_scene(target_campaign, target_scene);
  if jsonb_typeof(op) = 'object' and op ? 'reset' then
    if not private.tabletop_keys_ok(op, array['reset']) or op->>'reset' not in ('hidden', 'revealed') then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    new_fog := jsonb_build_object('base', op->>'reset', 'ops', '[]'::jsonb);
    update public.tabletop_scenes set fog = new_fog, revision = revision + 1, updated_at = now() where id = s.id;
  else
    new_fog := private.tabletop_append_fog(s, private.tabletop_fog_op(s, op));
  end if;
  perform private.tabletop_bump(target_campaign, s.id);
  return private.tabletop_finish(request_id, payload, jsonb_build_object('fog', new_fog));
end;
$fn$;

create function public.set_tabletop_live(target_campaign uuid, patch jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('live', target_campaign, patch);
  replay jsonb; l public.tabletop_live; screen jsonb;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  if jsonb_typeof(patch) <> 'object' or not private.tabletop_keys_ok(patch, array['scene_id', 'view_x', 'view_y',
      'card_id', 'ambience', 'track_id', 'volume', 'playing', 'loop', 'sound', 'ping', 'measure', 'screen']) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  l := private.tabletop_live_row(target_campaign);
  begin
    if patch ? 'scene_id' then
      l.scene_id := nullif(patch->>'scene_id', '')::uuid;
      if l.scene_id is not null and not exists (select 1 from public.tabletop_scenes
          where campaign_id = target_campaign and id = l.scene_id) then
        raise exception 'Scene unavailable' using errcode = '42501'; end if;
    end if;
    if patch ? 'view_x' then l.view_x := (patch->>'view_x')::numeric; end if;
    if patch ? 'view_y' then l.view_y := (patch->>'view_y')::numeric; end if;
    if patch ? 'card_id' then
      l.card_id := nullif(patch->>'card_id', '')::uuid;
      if l.card_id is not null and not exists (select 1 from public.tabletop_cards
          where campaign_id = target_campaign and id = l.card_id) then
        raise exception 'Invalid request' using errcode = '22023'; end if;
    end if;
    if patch ? 'ambience' then l.ambience := nullif(patch->>'ambience', ''); end if;
    if patch ? 'track_id' then
      l.track_id := nullif(patch->>'track_id', '')::uuid;
      if l.track_id is not null and not exists (select 1 from public.tabletop_tracks
          where campaign_id = target_campaign and id = l.track_id) then
        raise exception 'Invalid request' using errcode = '22023'; end if;
    end if;
    if patch ? 'volume' then l.volume := (patch->>'volume')::integer; end if;
    if patch ? 'playing' then l.playing := (patch->>'playing')::boolean; end if;
    if patch ? 'loop' then l.looping := (patch->>'loop')::boolean; end if;
    if patch ? 'sound' then
      if jsonb_typeof(patch->'sound') = 'null' then l.sound := null;
      elsif patch->>'sound' in ('door', 'thunder', 'gong', 'swords', 'coins') then
        l.sound := jsonb_build_object('key', patch->>'sound', 'at', now());
      else raise exception 'Invalid request' using errcode = '22023'; end if;
    end if;
    if patch ? 'ping' then
      if jsonb_typeof(patch->'ping') = 'null' then l.ping := null;
      elsif private.tabletop_keys_ok(patch->'ping', array['x', 'y']) and private.tabletop_num_ok(patch->'ping'->'x', -40, 160)
          and private.tabletop_num_ok(patch->'ping'->'y', -40, 160) then
        l.ping := (patch->'ping') || jsonb_build_object('at', now());
      else raise exception 'Invalid request' using errcode = '22023'; end if;
    end if;
    if patch ? 'measure' then
      if jsonb_typeof(patch->'measure') = 'null' then l.measure := null;
      elsif private.tabletop_keys_ok(patch->'measure', array['points']) and private.tabletop_points_ok(patch->'measure'->'points', 16) then
        l.measure := (patch->'measure') || jsonb_build_object('at', now());
      else raise exception 'Invalid request' using errcode = '22023'; end if;
    end if;
    if patch ? 'screen' then
      screen := patch->'screen';
      if not private.tabletop_keys_ok(screen, array['diagonal_in', 'px_w', 'px_h', 'base_mm', 'fine', 'flip'])
          or not private.tabletop_num_ok(screen->'diagonal_in', 5, 200) or not private.tabletop_num_ok(screen->'px_w', 320, 16384)
          or not private.tabletop_num_ok(screen->'px_h', 240, 16384) or not private.tabletop_num_ok(screen->'base_mm', 10, 80)
          or not private.tabletop_num_ok(screen->'fine', 0.85, 1.15)
          or (screen ? 'flip' and jsonb_typeof(screen->'flip') <> 'boolean') then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      l.screen := screen;
    end if;
    update public.tabletop_live set scene_id = l.scene_id, view_x = l.view_x, view_y = l.view_y,
        card_id = l.card_id, ambience = l.ambience, track_id = l.track_id, volume = l.volume, playing = l.playing,
        looping = l.looping, sound = l.sound, ping = l.ping, measure = l.measure, screen = l.screen,
        revision = revision + 1, updated_at = now()
      where campaign_id = target_campaign returning * into l;
  exception
    when invalid_text_representation or numeric_value_out_of_range or check_violation then
      raise exception 'Invalid request' using errcode = '22023';
  end;
  return private.tabletop_finish(request_id, payload, private.tabletop_live_json(l));
end;
$fn$;

create function public.save_tabletop_card(target_campaign uuid, target_card uuid, fields jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('card', target_campaign, target_card, fields);
  replay jsonb; k public.tabletop_cards;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  if jsonb_typeof(fields) <> 'object' or not private.tabletop_keys_ok(fields, array['title', 'body', 'image_path']) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if target_card is not null then
    select * into k from public.tabletop_cards where campaign_id = target_campaign and id = target_card for update;
    if k.id is null then raise exception 'Card unavailable' using errcode = '42501'; end if;
  end if;
  if fields ? 'title' then k.title := btrim(fields->>'title'); end if;
  if fields ? 'body' then k.body := coalesce(fields->>'body', ''); end if;
  if fields ? 'image_path' then k.image_path := nullif(fields->>'image_path', ''); end if;
  if k.image_path is not null and not private.tabletop_media_ok(target_campaign, 'card', k.image_path) then
    raise exception 'Image unavailable' using errcode = '22023'; end if;
  begin
    if target_card is null then
      insert into public.tabletop_cards (campaign_id, title, body, image_path)
        values (target_campaign, k.title, coalesce(k.body, ''), k.image_path) returning * into k;
    else
      update public.tabletop_cards set title = k.title, body = k.body, image_path = k.image_path,
          revision = revision + 1, updated_at = now() where id = k.id returning * into k;
    end if;
  exception when check_violation or not_null_violation then
    raise exception 'Invalid request' using errcode = '22023';
  end;
  if exists (select 1 from public.tabletop_live where campaign_id = target_campaign and card_id = k.id) then
    perform private.tabletop_bump(target_campaign, null); end if;
  return private.tabletop_finish(request_id, payload, jsonb_build_object('id', k.id, 'title', k.title,
    'body', k.body, 'image_path', k.image_path, 'revision', k.revision, 'updated_at', k.updated_at));
end;
$fn$;

create function public.delete_tabletop_card(target_campaign uuid, target_card uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('delete_card', target_campaign, target_card); replay jsonb; shown boolean;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  if not exists (select 1 from public.tabletop_cards where campaign_id = target_campaign and id = target_card) then
    raise exception 'Card unavailable' using errcode = '42501'; end if;
  shown := exists (select 1 from public.tabletop_live where campaign_id = target_campaign and card_id = target_card);
  delete from public.tabletop_cards where campaign_id = target_campaign and id = target_card;
  if shown then perform private.tabletop_bump(target_campaign, null); end if;
  return private.tabletop_finish(request_id, payload, jsonb_build_object('id', target_card));
end;
$fn$;

create function public.add_tabletop_track(target_campaign uuid, title text, track_path text, mime text,
  size_bytes integer, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('track', target_campaign, title, track_path, mime, size_bytes);
  replay jsonb; t public.tabletop_tracks;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  if not private.tabletop_media_ok(target_campaign, 'audio', track_path) then
    raise exception 'Audio unavailable' using errcode = '22023'; end if;
  begin
    insert into public.tabletop_tracks (campaign_id, title, path, mime, size_bytes)
      values (target_campaign, btrim(title), track_path, mime, size_bytes) returning * into t;
  exception when check_violation or not_null_violation or unique_violation then
    raise exception 'Invalid request' using errcode = '22023';
  end;
  return private.tabletop_finish(request_id, payload, jsonb_build_object('id', t.id, 'title', t.title,
    'path', t.path, 'mime', t.mime, 'size_bytes', t.size_bytes, 'created_at', t.created_at));
end;
$fn$;

create function public.delete_tabletop_track(target_campaign uuid, target_track uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('delete_track', target_campaign, target_track); replay jsonb;
  t public.tabletop_tracks; playing boolean;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into t from public.tabletop_tracks where campaign_id = target_campaign and id = target_track;
  if t.id is null then raise exception 'Track unavailable' using errcode = '42501'; end if;
  playing := exists (select 1 from public.tabletop_live where campaign_id = target_campaign and track_id = t.id);
  delete from public.tabletop_tracks where id = t.id;
  if playing then perform private.tabletop_bump(target_campaign, null); end if;
  return private.tabletop_finish(request_id, payload, jsonb_build_object('id', t.id, 'path', t.path));
end;
$fn$;

-- Runs an event's actions together, or resets it (the actions are not undone).
create function public.fire_tabletop_event(target_campaign uuid, target_item uuid, reset boolean, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('event', target_campaign, target_item, reset);
  replay jsonb; i public.tabletop_items; s public.tabletop_scenes; actions jsonb; room jsonb;
  cx numeric; cy numeric; radius numeric; l public.tabletop_live; shown integer := 0;
begin
  replay := private.tabletop_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  select * into i from public.tabletop_items where campaign_id = target_campaign and id = target_item for update;
  if i.id is null or i.kind <> 'event' then raise exception 'Item unavailable' using errcode = '42501'; end if;
  s := private.tabletop_scene(target_campaign, i.scene_id);
  if coalesce(reset, false) then
    update public.tabletop_items set data = data || '{"fired": false}'::jsonb, revision = revision + 1,
      updated_at = now() where id = i.id;
    return private.tabletop_finish(request_id, payload, jsonb_build_object('id', i.id, 'fired', false));
  end if;
  actions := coalesce(i.secret->'actions', '{}'::jsonb);
  cx := i.x + i.w / 2; cy := i.y + i.h / 2;
  radius := coalesce((actions->>'reveal_radius')::numeric, 0);
  if actions ? 'reveal_room' then
    select r into room from jsonb_array_elements(s.rooms) r where r->>'id' = actions->>'reveal_room';
    if room is not null then
      perform private.tabletop_append_fog(s, jsonb_build_object('mode', 'reveal', 'shape', 'rects', 'rects', room->'rects'));
      s := private.tabletop_scene(target_campaign, s.id);
    end if;
  end if;
  if radius > 0 then
    perform private.tabletop_append_fog(s, jsonb_build_object('mode', 'reveal', 'shape', 'circle', 'x', cx, 'y', cy, 'r', radius));
  end if;
  if coalesce((actions->>'show_hidden')::boolean, false) then
    update public.tabletop_items t set hidden = false, revision = t.revision + 1, updated_at = now()
      where t.scene_id = s.id and t.hidden and t.kind in ('token', 'prop')
        and (sqrt(power(t.x + t.w / 2 - cx, 2) + power(t.y + t.h / 2 - cy, 2)) <= greatest(radius, 6)
          or (room is not null and exists (select 1 from jsonb_array_elements(room->'rects') rc
            where t.x + t.w / 2 between (rc->>0)::numeric and (rc->>0)::numeric + (rc->>2)::numeric
              and t.y + t.h / 2 between (rc->>1)::numeric and (rc->>1)::numeric + (rc->>3)::numeric)));
    get diagnostics shown = row_count;
  end if;
  if actions ? 'card_id' or actions ? 'ambience' or actions ? 'sound' then
    l := private.tabletop_live_row(target_campaign);
    update public.tabletop_live set
        card_id = case when actions ? 'card_id' and exists (select 1 from public.tabletop_cards k
          where k.campaign_id = target_campaign and k.id = (actions->>'card_id')::uuid)
          then (actions->>'card_id')::uuid else card_id end,
        ambience = coalesce(actions->>'ambience', ambience),
        playing = case when actions ? 'ambience' then true else playing end,
        sound = case when actions ? 'sound' then jsonb_build_object('key', actions->>'sound', 'at', now()) else sound end,
        revision = revision + 1, updated_at = now()
      where campaign_id = target_campaign;
  end if;
  update public.tabletop_items set data = data || '{"fired": true}'::jsonb, revision = revision + 1,
    updated_at = now() where id = i.id;
  perform private.tabletop_bump(target_campaign, s.id);
  return private.tabletop_finish(request_id, payload, jsonb_build_object('id', i.id, 'fired', true, 'shown', shown));
end;
$fn$;

do $grants$
declare fn text;
begin
  foreach fn in array array['private.tabletop_begin(uuid,uuid,jsonb)', 'private.tabletop_finish(uuid,jsonb,jsonb)',
      'private.tabletop_live_row(uuid)', 'private.tabletop_bump(uuid,uuid)', 'private.tabletop_scene(uuid,uuid)',
      'private.tabletop_env()', 'private.tabletop_media_ok(uuid,text,text)', 'private.tabletop_keys_ok(jsonb,text[])',
      'private.tabletop_num_ok(jsonb,numeric,numeric)', 'private.tabletop_rects_ok(jsonb,integer)',
      'private.tabletop_points_ok(jsonb,integer)', 'private.tabletop_text_ok(jsonb,integer)',
      'private.tabletop_data_ok(text,jsonb,jsonb)',
      'private.tabletop_scene_json(public.tabletop_scenes,boolean)', 'private.tabletop_item_json(public.tabletop_items)',
      'private.tabletop_live_json(public.tabletop_live)', 'private.tabletop_put(public.tabletop_scenes,jsonb)',
      'private.tabletop_fog_op(public.tabletop_scenes,jsonb)', 'private.tabletop_append_fog(public.tabletop_scenes,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
  -- The storage router calls this one for members.
  revoke all on function private.tabletop_can_read_media(uuid, text) from public, anon;
  grant execute on function private.tabletop_can_read_media(uuid, text) to authenticated;
  foreach fn in array array['public.get_tabletop(uuid,uuid,boolean)', 'public.list_tabletop_scenes(uuid)',
      'public.get_tabletop_library(uuid)', 'public.save_tabletop_scene(uuid,uuid,jsonb,bigint,uuid)',
      'public.delete_tabletop_scene(uuid,uuid,uuid)', 'public.put_tabletop_items(uuid,uuid,jsonb,uuid)',
      'public.delete_tabletop_items(uuid,uuid,uuid[],uuid)', 'public.change_tabletop_fog(uuid,uuid,jsonb,uuid)',
      'public.set_tabletop_live(uuid,jsonb,uuid)', 'public.save_tabletop_card(uuid,uuid,jsonb,uuid)',
      'public.delete_tabletop_card(uuid,uuid,uuid)', 'public.add_tabletop_track(uuid,text,text,text,integer,uuid)',
      'public.delete_tabletop_track(uuid,uuid,uuid)', 'public.fire_tabletop_event(uuid,uuid,boolean,uuid)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$grants$;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre_admin.remap(text)') is not null and to_regclass('pre.campaigns') is not null
      and exists (select 1 from information_schema.columns
        where table_schema = 'pre' and table_name = 'encounter_combatants' and column_name = 'public_name')
      and to_regclass('pre.tabletop_scenes') is null then
    execute pre_admin.remap(ddl);
  end if;
end;
$tabletop$;

-- ---------------------------------------------------------------------------------------------
-- Realtime: members subscribe to postgres_changes on tabletop_live; RLS filters each event.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tabletop_live;
    if to_regclass('pre.tabletop_live') is not null then
      alter publication supabase_realtime add table pre.tabletop_live;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- GLOBAL STORAGE: the tabletop-media bucket and its router (both environments, by prefix).
-- ---------------------------------------------------------------------------------------------

create function private.tabletop_media_access(object_name text, writing boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare env text := split_part(object_name, '/', 1); helper text; campaign uuid; allowed boolean;
begin
  if object_name is null or object_name !~
      '^(public|pre)/[0-9a-f-]{36}/((map|card)/[0-9a-f-]{36}[.](webp|png|jpg)|audio/[0-9a-f-]{36}[.](mp3|ogg|m4a|webm))$' then
    return false; end if;
  helper := case env when 'pre' then 'pre_private' else 'private' end;
  begin
    campaign := split_part(object_name, '/', 2)::uuid;
  exception when invalid_text_representation then return false; end;
  if to_regclass(format('%I.tabletop_scenes', env)) is null
      or to_regprocedure(format('%I.tabletop_can_read_media(uuid,text)', helper)) is null then
    return false; end if;
  if writing then
    execute format('select %I.is_campaign_dm($1)', helper) into allowed using campaign;
  else
    execute format('select %I.tabletop_can_read_media($1, $2)', helper) into allowed using campaign, object_name;
  end if;
  return coalesce(allowed, false);
end;
$$;
revoke all on function private.tabletop_media_access(text, boolean) from public, anon;
grant execute on function private.tabletop_media_access(text, boolean) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('tabletop-media', 'tabletop-media', false, 20971520,
      array['image/webp', 'image/png', 'image/jpeg', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/webm'])
    on conflict (id) do nothing;
  execute $p$create policy tabletop_media_read on storage.objects for select to authenticated
    using (bucket_id = 'tabletop-media' and private.tabletop_media_access(name, false))$p$;
  execute $p$create policy tabletop_media_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'tabletop-media' and private.tabletop_media_access(name, true))$p$;
  execute $p$create policy tabletop_media_delete on storage.objects for delete to authenticated
    using (bucket_id = 'tabletop-media' and private.tabletop_media_access(name, true))$p$;
end;
$$;
