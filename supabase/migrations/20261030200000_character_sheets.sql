-- RYT-024: character creation wizard and 5.5e + homebrew character sheet.
-- Actor matrix:
--   anon / outsider / inactive member: no reads or writes.
--   other Player in the same campaign: cannot read or write this character's sheet or vitals.
--   DM of another campaign: no access.
--   assigned active Player: reads and writes own build (save_character_sheet) and
--           play state (set_character_vitals); still cannot touch character_resources.
--   active campaign DM: reads and writes every sheet and play state of the campaign.
-- Build and play state carry independent revisions so frequent table-side taps
-- (HP, slots, uses) never go stale against a long build edit.

create table public.character_sheets (
  character_id uuid primary key,
  campaign_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'complete')),
  level integer not null default 1 check (level between 1 and 20),
  max_hp integer not null default 1 check (max_hp between 1 and 9999),
  armor_class integer not null default 10 check (armor_class between 0 and 99),
  build jsonb not null default '{}'::jsonb check (
    jsonb_typeof(build) = 'object' and pg_column_size(build) <= 65536),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade
);

create table public.character_vitals (
  character_id uuid primary key,
  campaign_id uuid not null,
  current_hp integer not null default 1 check (current_hp between 0 and 9999),
  temp_hp integer not null default 0 check (temp_hp between 0 and 9999),
  hit_dice_spent integer not null default 0 check (hit_dice_spent between 0 and 20),
  death_successes integer not null default 0 check (death_successes between 0 and 3),
  death_failures integer not null default 0 check (death_failures between 0 and 3),
  heroic_inspiration boolean not null default false,
  conditions text[] not null default array[]::text[] check (conditions <@ array[
    'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible',
    'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious']::text[]),
  slots_used integer[] not null default array[0,0,0,0,0,0,0,0,0] check (
    cardinality(slots_used) = 9 and 0 <= all(slots_used) and 9 >= all(slots_used)),
  tracker_uses jsonb not null default '{}'::jsonb check (
    jsonb_typeof(tracker_uses) = 'object' and pg_column_size(tracker_uses) <= 8192),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade
);

alter table public.character_sheets enable row level security;
alter table public.character_vitals enable row level security;
revoke all on public.character_sheets, public.character_vitals from public, anon, authenticated;
grant select on public.character_sheets, public.character_vitals to authenticated;

-- Same visibility as characters_read: the assigned active Player or an active campaign DM.
-- plpgsql defers body validation, so the alphabetical PRE ETL can clone it before its helpers.
create function private.can_play_character(target_campaign uuid, target_character uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return private.is_campaign_dm(target_campaign) or (
    private.is_campaign_member(target_campaign) and exists (
      select 1 from public.characters c
       where c.campaign_id = target_campaign and c.id = target_character
         and c.user_id = (select auth.uid())));
end;
$$;
revoke all on function private.can_play_character(uuid, uuid) from public, anon;
grant execute on function private.can_play_character(uuid, uuid) to authenticated;

create policy sheets_read on public.character_sheets for select to authenticated
  using (private.can_play_character(campaign_id, character_id));
create policy vitals_read on public.character_vitals for select to authenticated
  using (private.can_play_character(campaign_id, character_id));

-- Every character, existing or future, owns exactly one draft sheet and play state.
create function private.create_character_sheet() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.character_sheets(campaign_id, character_id) values (new.campaign_id, new.id);
  insert into public.character_vitals(campaign_id, character_id) values (new.campaign_id, new.id);
  return new;
end;
$$;
revoke all on function private.create_character_sheet() from public, anon, authenticated;
create trigger characters_sheet after insert on public.characters
  for each row execute function private.create_character_sheet();
insert into public.character_sheets(campaign_id, character_id)
  select campaign_id, id from public.characters on conflict do nothing;
insert into public.character_vitals(campaign_id, character_id)
  select campaign_id, id from public.characters on conflict do nothing;

-- Audit edits only; default rows are implied by character creation.
create trigger sheets_audit after update on public.character_sheets
  for each row execute function private.audit_character_change();
create trigger vitals_audit after update on public.character_vitals
  for each row execute function private.audit_character_change();

create table private.sheet_requests (
  request_id uuid primary key,
  actor_id uuid not null,
  character_id uuid not null references public.characters(id) on delete cascade,
  payload jsonb not null,
  result_revision bigint not null
);
revoke all on private.sheet_requests from public, anon, authenticated;
alter table private.sheet_requests enable row level security;

create function public.save_character_sheet(target_campaign uuid, target_character uuid,
  expected_revision bigint, new_level integer, new_max_hp integer, new_armor_class integer,
  new_build jsonb, mark_complete boolean, request_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare current public.character_sheets; prior private.sheet_requests;
  payload jsonb := jsonb_build_array('sheet', target_campaign, target_character, expected_revision,
    new_level, new_max_hp, new_armor_class, new_build, mark_complete);
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.sheet_requests r where r.request_id = save_character_sheet.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result_revision;
  end if;
  select * into current from public.character_sheets
    where campaign_id = target_campaign and character_id = target_character for update;
  if current.character_id is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
  if current.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  update public.character_sheets set level = new_level, max_hp = new_max_hp,
    armor_class = new_armor_class, build = new_build,
    status = case when mark_complete or status = 'complete' then 'complete' else 'draft' end,
    revision = revision + 1, updated_at = now()
    where campaign_id = target_campaign and character_id = target_character;
  -- Completing a draft starts at full health; later edits only clamp play state.
  update public.character_vitals set
    current_hp = case when current.status = 'draft' and mark_complete then new_max_hp
      else least(current_hp, new_max_hp) end,
    hit_dice_spent = least(hit_dice_spent, new_level), revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character
      and (current_hp > new_max_hp or hit_dice_spent > new_level
        or (current.status = 'draft' and mark_complete));
  insert into private.sheet_requests values (request_id, auth.uid(), target_character, payload, current.revision + 1);
  return current.revision + 1;
end;
$$;

create function public.set_character_vitals(target_campaign uuid, target_character uuid,
  expected_revision bigint, new_current_hp integer, new_temp_hp integer, new_hit_dice_spent integer,
  new_death_successes integer, new_death_failures integer, new_heroic_inspiration boolean,
  new_conditions text[], new_slots_used integer[], new_tracker_uses jsonb, request_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare current_revision bigint; sheet public.character_sheets; prior private.sheet_requests;
  payload jsonb := jsonb_build_array('vitals', target_campaign, target_character, expected_revision,
    new_current_hp, new_temp_hp, new_hit_dice_spent, new_death_successes, new_death_failures,
    new_heroic_inspiration, new_conditions, new_slots_used, new_tracker_uses);
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.can_play_character(target_campaign, target_character) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if request_id is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  select * into prior from private.sheet_requests r where r.request_id = set_character_vitals.request_id;
  if prior.request_id is not null then
    if prior.actor_id <> auth.uid() or prior.payload <> payload then
      raise exception 'Request mismatch' using errcode = '22023'; end if;
    return prior.result_revision;
  end if;
  select * into sheet from public.character_sheets
    where campaign_id = target_campaign and character_id = target_character;
  select revision into current_revision from public.character_vitals
    where campaign_id = target_campaign and character_id = target_character for update;
  if current_revision is null then raise exception 'Character unavailable' using errcode = '42501'; end if;
  if current_revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  if new_current_hp > sheet.max_hp or new_hit_dice_spent > sheet.level then
    raise exception 'Invalid vitals' using errcode = '22023'; end if;
  update public.character_vitals set current_hp = new_current_hp, temp_hp = new_temp_hp,
    hit_dice_spent = new_hit_dice_spent, death_successes = new_death_successes,
    death_failures = new_death_failures, heroic_inspiration = new_heroic_inspiration,
    conditions = coalesce(new_conditions, array[]::text[]), slots_used = new_slots_used,
    tracker_uses = coalesce(new_tracker_uses, '{}'::jsonb), revision = revision + 1
    where campaign_id = target_campaign and character_id = target_character;
  insert into private.sheet_requests values (request_id, auth.uid(), target_character, payload, current_revision + 1);
  return current_revision + 1;
end;
$$;

revoke all on function
  public.save_character_sheet(uuid, uuid, bigint, integer, integer, integer, jsonb, boolean, uuid),
  public.set_character_vitals(uuid, uuid, bigint, integer, integer, integer, integer, integer, boolean, text[], integer[], jsonb, uuid)
  from public, anon;
grant execute on function
  public.save_character_sheet(uuid, uuid, bigint, integer, integer, integer, jsonb, boolean, uuid),
  public.set_character_vitals(uuid, uuid, bigint, integer, integer, integer, integer, integer, boolean, text[], integer[], jsonb, uuid)
  to authenticated;

comment on table public.character_sheets is 'RYT-024 build: identity, abilities, proficiencies, features, trackers and spells. RPC writes only.';
comment on table public.character_vitals is 'RYT-024 play state: HP, hit dice, death saves, inspiration, conditions, spent slots and tracker uses. RPC writes only.';
