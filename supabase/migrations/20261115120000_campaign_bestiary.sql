-- RYT-089: every campaign has its own bestiary; the DM downloads the official one (ADR 039).
--
-- The SRD 5.2.1 catalogue stays bundled in the app and read-only. A campaign now lists the official
-- creatures only after its DM downloads them, and keeps its changes to them as campaign versions:
--
-- Data:
--   campaign_srd_bestiary              one row per campaign that downloaded the official bestiary.
--   campaign_srd_removed               official creatures the DM removed from that campaign afterwards
--                                      (composite key to the download row: removing the whole official
--                                      bestiary drops them with it).
--   combatant_templates.srd_override   the campaign's version of an official creature ("edited in
--                                      place"); at most one per campaign and SRD creature. Older
--                                      templates with srd_id stay campaign creatures "based on" one.
--
-- RPCs:
--   get_srd_bestiary (new)             DM: {downloaded, downloaded_at, removed: [srd ids]}.
--   set_srd_bestiary (new)             DM: 'download' (adds every official creature, removed ones
--                                      included), 'remove' one creature, 'remove_all'. Removing also
--                                      deletes the campaign's version of the removed creatures (the app
--                                      asks first). Idempotent request id, campaign lock.
--   save_combatant_template            data accepts srd_override (boolean, on creation only): the
--                                      official creature must be in the campaign's bestiary and have no
--                                      version yet ('Already modified'). Versions keep their srd_id.
--   list_combatant_templates           returns srd_override.
--
-- Existing campaigns start without the official bestiary, like new ones (the user's choice): their
-- own creatures, copies and images are untouched.
--
-- Actor matrix: anon cannot execute; outsiders and inactive members raise Forbidden; Players raise
-- Forbidden on every RPC and read no rows; a DM of another campaign raises Forbidden through the
-- target campaign id. Writes go through the RPCs only. Like every combat RPC, a retried request id
-- replays its stored result before the role check (the caller's own earlier result only). A campaign
-- keeps at most 1000 removed creatures. Removing versions refreshes running fights that use them.
--
-- Known limit (follow-up): the image object of a deleted version stays in the private bucket, as it
-- already did for delete_combatant_template; the storage router needs the template to delete it.
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) already has the
-- RYT-053 creature images and not this change, the same DDL is executed again remapped with
-- pre_admin.remap. A PRE that already has it (the remapped DDL was tested there first) is left as is.

do $bestiary$
declare ddl text := $ddl$
create table public.campaign_srd_bestiary (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  downloaded_at timestamptz not null default now()
);
create table public.campaign_srd_removed (
  campaign_id uuid not null references public.campaign_srd_bestiary(campaign_id) on delete cascade,
  srd_id text not null check (srd_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(srd_id) <= 80),
  removed_at timestamptz not null default now(),
  primary key (campaign_id, srd_id)
);
alter table public.campaign_srd_bestiary enable row level security;
alter table public.campaign_srd_removed enable row level security;
revoke all on public.campaign_srd_bestiary, public.campaign_srd_removed from public, anon, authenticated;
grant select on public.campaign_srd_bestiary, public.campaign_srd_removed to authenticated;
create policy campaign_srd_bestiary_read on public.campaign_srd_bestiary for select to authenticated
  using (private.is_campaign_dm(campaign_id));
create policy campaign_srd_removed_read on public.campaign_srd_removed for select to authenticated
  using (private.is_campaign_dm(campaign_id));
comment on table public.campaign_srd_bestiary is
  'RYT-089 the campaign downloaded the official (SRD) bestiary. DM-only reads. RPC writes only.';
comment on table public.campaign_srd_removed is
  'RYT-089 official creatures removed from a campaign after the download. DM-only reads. RPC writes only.';

alter table public.combatant_templates
  add column srd_override boolean not null default false,
  add constraint combatant_templates_override_srd check (not srd_override or srd_id is not null);
create unique index combatant_templates_one_override on public.combatant_templates (campaign_id, srd_id)
  where srd_override;
comment on column public.combatant_templates.srd_override is
  'RYT-089 the campaign''s version of the official creature srd_id (edited in place); one per creature.';

create function private.srd_bestiary_state(target_campaign uuid) returns jsonb
language sql stable security invoker set search_path = '' as $fn$
  select jsonb_build_object(
    'downloaded', b.campaign_id is not null,
    'downloaded_at', b.downloaded_at,
    'removed', coalesce((select jsonb_agg(r.srd_id order by r.srd_id) from public.campaign_srd_removed r
      where r.campaign_id = target_campaign), '[]'::jsonb))
  from (select 1) one
  left join public.campaign_srd_bestiary b on b.campaign_id = target_campaign;
$fn$;
revoke all on function private.srd_bestiary_state(uuid) from public, anon, authenticated;

create function public.get_srd_bestiary(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.combat_require_dm(target_campaign);
  return private.srd_bestiary_state(target_campaign);
end;
$fn$;
revoke all on function public.get_srd_bestiary(uuid) from public, anon;
grant execute on function public.get_srd_bestiary(uuid) to authenticated;

create function public.set_srd_bestiary(target_campaign uuid, action text, target_srd text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('srd_bestiary', target_campaign, action, target_srd);
  replay jsonb; dropped integer := 0; versions uuid[];
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  if action = 'download' and target_srd is null then
    insert into public.campaign_srd_bestiary (campaign_id) values (target_campaign)
      on conflict (campaign_id) do nothing;
    delete from public.campaign_srd_removed where campaign_id = target_campaign;
  elsif action = 'remove' and target_srd ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(target_srd) <= 80 then
    if not exists (select 1 from public.campaign_srd_bestiary where campaign_id = target_campaign) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    if (select count(*) from public.campaign_srd_removed where campaign_id = target_campaign) >= 1000 then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    insert into public.campaign_srd_removed (campaign_id, srd_id) values (target_campaign, target_srd)
      on conflict (campaign_id, srd_id) do nothing;
    select coalesce(array_agg(id), '{}') into versions from public.combatant_templates
      where campaign_id = target_campaign and srd_override and srd_id = target_srd;
  elsif action = 'remove_all' and target_srd is null then
    delete from public.campaign_srd_bestiary where campaign_id = target_campaign;
    select coalesce(array_agg(id), '{}') into versions from public.combatant_templates
      where campaign_id = target_campaign and srd_override;
  else
    raise exception 'Invalid request' using errcode = '22023';
  end if;
  if cardinality(versions) > 0 then
    -- Running fights with creatures from those versions refetch their projection.
    update public.encounters e set revision = e.revision + 1, updated_at = now()
      where e.campaign_id = target_campaign and e.status in ('initiative', 'active')
        and exists (select 1 from public.encounter_combatants c
          where c.encounter_id = e.id and c.template_id = any (versions));
    delete from public.combatant_templates where campaign_id = target_campaign and id = any (versions);
    get diagnostics dropped = row_count;
  end if;
  return private.combat_finish(request_id, payload,
    private.srd_bestiary_state(target_campaign) || jsonb_build_object('versions_removed', dropped));
end;
$fn$;
revoke all on function public.set_srd_bestiary(uuid, text, text, uuid) from public, anon;
grant execute on function public.set_srd_bestiary(uuid, text, text, uuid) to authenticated;

create or replace function public.save_combatant_template(target_campaign uuid, target_template uuid,
  expected_revision bigint, data jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('template_save', target_campaign, target_template, expected_revision, data);
  replay jsonb; t public.combatant_templates; name_value text; side_value text; block jsonb;
  srd_value text; formula_value text; challenge_value text; type_value text; override_value boolean;
begin
  replay := private.combat_begin(target_campaign, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.combat_require_dm(target_campaign);
  if data is null or jsonb_typeof(data) <> 'object' then raise exception 'Invalid request' using errcode = '22023'; end if;
  name_value := private.combat_text(data, 'name', 80, null);
  side_value := coalesce(private.combat_text(data, 'side', 10, null), 'enemy');
  if name_value is null or name_value = '' or side_value not in ('ally', 'enemy')
      or private.combat_int(data, 'max_hp', 1, 99999, null) is null then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  block := case when jsonb_typeof(data -> 'stat_block') = 'object' then data -> 'stat_block' end;
  if data ? 'stat_block' and jsonb_typeof(data -> 'stat_block') not in ('object', 'null') then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if not private.bestiary_stat_block_ok(block) then raise exception 'Invalid request' using errcode = '22023'; end if;
  srd_value := nullif(private.combat_text(data, 'srd_id', 80, null), '');
  formula_value := nullif(replace(private.combat_text(data, 'hp_formula', 20, ''), ' ', ''), '');
  challenge_value := nullif(private.combat_text(data, 'challenge', 4, ''), '');
  type_value := nullif(private.combat_text(data, 'creature_type', 20, ''), '');
  override_value := private.combat_bool(data, 'srd_override', false);
  if (srd_value is not null and srd_value !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      or (formula_value is not null and formula_value !~ '^[1-9][0-9]{0,2}d(4|6|8|10|12|20)([+-][0-9]{1,4})?$')
      or (challenge_value is not null and challenge_value !~ '^(0|1/8|1/4|1/2|[1-9]|[12][0-9]|30)$')
      or (type_value is not null and type_value not in ('aberration', 'beast', 'celestial', 'construct', 'dragon',
        'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead')) then
    raise exception 'Invalid request' using errcode = '22023'; end if;
  if target_template is null then
    -- RYT-089: a version of an official creature needs that creature in the campaign's bestiary.
    if override_value then
      if srd_value is null
          or not exists (select 1 from public.campaign_srd_bestiary where campaign_id = target_campaign)
          or exists (select 1 from public.campaign_srd_removed
            where campaign_id = target_campaign and srd_id = srd_value) then
        raise exception 'Invalid request' using errcode = '22023'; end if;
      if exists (select 1 from public.combatant_templates
          where campaign_id = target_campaign and srd_override and srd_id = srd_value) then
        raise exception 'Already modified' using errcode = 'P0001'; end if;
    end if;
    insert into public.combatant_templates(campaign_id, name, side, max_hp, armor_class, initiative_bonus,
        legendary_max, notes, stat_block, srd_id, hp_formula, challenge, creature_type, srd_override)
      values (target_campaign, name_value, side_value, private.combat_int(data, 'max_hp', 1, 99999, null),
        private.combat_int(data, 'armor_class', 0, 99, 10), private.combat_int(data, 'initiative_bonus', -20, 30, 0),
        private.combat_int(data, 'legendary_max', 0, 9, 0), coalesce(private.combat_text(data, 'notes', 2000, ''), ''),
        block, srd_value, formula_value, challenge_value, type_value, override_value)
      returning * into t;
  else
    select * into t from public.combatant_templates
      where campaign_id = target_campaign and id = target_template for update;
    if t.id is null then raise exception 'Template unavailable' using errcode = '42501'; end if;
    if t.revision is distinct from expected_revision then
      raise exception 'Stale revision' using errcode = 'P0001'; end if;
    -- A version stays the version of its official creature; srd_override cannot be switched.
    if (data ? 'srd_override' and override_value <> t.srd_override)
        or (t.srd_override and data ? 'srd_id' and srd_value is distinct from t.srd_id) then
      raise exception 'Invalid request' using errcode = '22023'; end if;
    update public.combatant_templates set name = name_value, side = side_value,
        max_hp = private.combat_int(data, 'max_hp', 1, 99999, null),
        armor_class = private.combat_int(data, 'armor_class', 0, 99, 10),
        initiative_bonus = private.combat_int(data, 'initiative_bonus', -20, 30, 0),
        legendary_max = private.combat_int(data, 'legendary_max', 0, 9, 0),
        notes = coalesce(private.combat_text(data, 'notes', 2000, ''), ''),
        -- A quick edit (no stat_block key) keeps the stored stat block and its metadata.
        stat_block = case when data ? 'stat_block' then block else t.stat_block end,
        srd_id = case when data ? 'srd_id' then srd_value else t.srd_id end,
        hp_formula = case when data ? 'hp_formula' then formula_value else t.hp_formula end,
        challenge = case when data ? 'challenge' then challenge_value else t.challenge end,
        creature_type = case when data ? 'creature_type' then type_value else t.creature_type end,
        revision = revision + 1, updated_at = now()
      where id = t.id returning * into t;
  end if;
  return private.combat_finish(request_id, payload, jsonb_build_object('id', t.id, 'revision', t.revision));
end;
$fn$;

create or replace function public.list_combatant_templates(target_campaign uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform private.combat_require_dm(target_campaign);
  return (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', t.id, 'name', t.name,
      'side', t.side, 'max_hp', t.max_hp, 'armor_class', t.armor_class, 'initiative_bonus', t.initiative_bonus,
      'legendary_max', t.legendary_max, 'notes', t.notes, 'image_path', t.image_path,
      'stat_block', t.stat_block, 'srd_id', t.srd_id, 'hp_formula', t.hp_formula, 'challenge', t.challenge,
      'creature_type', t.creature_type, 'srd_override', t.srd_override, 'updated_at', t.updated_at,
      'revision', t.revision))
      order by lower(t.name), t.id), '[]'::jsonb)
    from public.combatant_templates t where t.campaign_id = target_campaign);
end;
$fn$;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre_admin.remap(text)') is not null
      and to_regclass('pre.campaign_creature_images') is not null
      and to_regclass('pre.campaign_srd_bestiary') is null then
    execute pre_admin.remap(ddl);
  end if;
end;
$bestiary$;
