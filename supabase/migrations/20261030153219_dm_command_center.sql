-- RYT-023: DM Command Center, per-campaign active player modules, and revelations queue.
-- Actor matrix:
--   anon / outsider: no reads or writes.
--   player: reads own campaign's active player_modules via list_my_campaigns_with_modules() and reads
--           campaign_revelations ONLY where visibility = 'party'. Cannot read 'dm_only'
--           revelations, cannot read character_events, and cannot execute DM RPCs.
--   active campaign DM: manages player_modules, creates/toggles revelations, and
--           reads campaign character_events.

alter table public.campaigns
  add column player_modules text[] not null default array['party']::text[]
  constraint campaigns_player_modules_valid check (
    player_modules <@ array[
      'party',
      'inventory',
      'shops',
      'quests',
      'combat',
      'atlas',
      'glossary',
      'memories',
      'stronghold',
      'workshop'
    ]::text[]
  );

create function public.list_my_campaigns_with_modules()
returns table(id uuid, name text, description text, created_at timestamptz, role text, player_modules text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.description, c.created_at, m.role, c.player_modules
    from public.campaigns c
    join public.campaign_members m on m.campaign_id = c.id
    where m.user_id = (select auth.uid()) and m.active
    order by c.created_at desc, c.id;
$$;
revoke all on function public.list_my_campaigns_with_modules() from public, anon;
grant execute on function public.list_my_campaigns_with_modules() to authenticated;

create function public.set_campaign_modules(target_campaign uuid, modules text[]) returns text[]
language plpgsql security definer set search_path = '' as $$
declare normalized text[];
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct m order by m), array[]::text[])
    into normalized
    from unnest(coalesce(modules, array[]::text[])) as m;
  update public.campaigns
    set player_modules = normalized
    where id = target_campaign;
  return normalized;
end;
$$;
revoke all on function public.set_campaign_modules(uuid, text[]) from public, anon;
grant execute on function public.set_campaign_modules(uuid, text[]) to authenticated;

create table public.campaign_revelations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  category text not null check (category in ('shop', 'quest', 'atlas', 'glossary', 'npc')),
  summary text not null default '' check (char_length(summary) <= 1000),
  visibility text not null default 'dm_only' check (visibility in ('dm_only', 'party')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaign_revelations_campaign_idx
  on public.campaign_revelations(campaign_id, visibility, created_at desc);
alter table public.campaign_revelations enable row level security;
revoke all on public.campaign_revelations from public, anon, authenticated;
grant select on public.campaign_revelations to authenticated;

create policy revelations_read on public.campaign_revelations for select to authenticated
  using (
    private.is_campaign_dm(campaign_id)
    or (private.is_campaign_member(campaign_id) and visibility = 'party')
  );

create function public.create_campaign_revelation(
  target_campaign uuid,
  item_title text,
  item_category text,
  item_summary text default '',
  item_visibility text default 'dm_only'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  insert into public.campaign_revelations(campaign_id, title, category, summary, visibility, created_by)
    values (target_campaign, trim(item_title), item_category, trim(coalesce(item_summary, '')), item_visibility, auth.uid())
    returning id into result;
  return result;
end;
$$;

create function public.set_revelation_visibility(
  target_campaign uuid,
  target_revelation uuid,
  new_visibility text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if new_visibility not in ('dm_only', 'party') then
    raise exception 'Invalid visibility' using errcode = '22023';
  end if;
  update public.campaign_revelations
    set visibility = new_visibility, updated_at = now()
    where id = target_revelation and campaign_id = target_campaign;
  if not found then
    raise exception 'Revelation unavailable' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.create_campaign_revelation(uuid, text, text, text, text),
  public.set_revelation_visibility(uuid, uuid, text) from public, anon;
grant execute on function public.create_campaign_revelation(uuid, text, text, text, text),
  public.set_revelation_visibility(uuid, uuid, text) to authenticated;
