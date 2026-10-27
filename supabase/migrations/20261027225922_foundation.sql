-- Campaign isolation is enforced in PostgreSQL, independently of the UI.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('dm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create index campaign_members_user_idx on public.campaign_members(user_id);
create index campaigns_owner_idx on public.campaigns(owner_id);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  foreign key (campaign_id, user_id) references public.campaign_members(campaign_id, user_id),
  unique (campaign_id, id)
);
create index characters_member_idx on public.characters(campaign_id, user_id);

create table public.character_resources (
  character_id uuid primary key,
  campaign_id uuid not null,
  copper bigint not null default 0 check (copper >= 0),
  water_units integer not null default 0 check (water_units >= 0),
  rations integer not null default 0 check (rations >= 0),
  exhaustion integer not null default 0 check (exhaustion >= 0),
  revision bigint not null default 0 check (revision >= 0),
  foreign key (campaign_id, character_id) references public.characters(campaign_id, id) on delete cascade
);

-- These fixed-purpose helpers bypass membership RLS to prevent policy recursion.
-- No caller-controlled user ID; identity always comes from the verified JWT.
create function private.is_campaign_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m
    where m.campaign_id = target and m.user_id = (select auth.uid()));
$$;
create function private.is_campaign_dm(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m
    where m.campaign_id = target and m.user_id = (select auth.uid()) and m.role = 'dm');
$$;
revoke all on function private.is_campaign_member(uuid) from public, anon;
revoke all on function private.is_campaign_dm(uuid) from public, anon;
grant execute on function private.is_campaign_member(uuid), private.is_campaign_dm(uuid) to authenticated;

alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters enable row level security;
alter table public.character_resources enable row level security;

-- Revoke Supabase default table grants before granting the minimum surface.
revoke all on public.campaigns, public.campaign_members, public.characters, public.character_resources from anon, authenticated;
grant select on public.campaigns, public.campaign_members, public.characters, public.character_resources to authenticated;
grant update (name, description) on public.campaigns to authenticated;
grant insert, update, delete on public.characters, public.character_resources to authenticated;

create policy campaigns_read on public.campaigns for select to authenticated using (private.is_campaign_member(id));
create policy campaigns_update on public.campaigns for update to authenticated using (private.is_campaign_dm(id)) with check (private.is_campaign_dm(id));
create policy members_read on public.campaign_members for select to authenticated using (user_id = (select auth.uid()) or private.is_campaign_dm(campaign_id));
create policy characters_read on public.characters for select to authenticated using (private.is_campaign_member(campaign_id) and (user_id = (select auth.uid()) or private.is_campaign_dm(campaign_id)));
create policy characters_insert on public.characters for insert to authenticated with check (private.is_campaign_dm(campaign_id));
create policy characters_update on public.characters for update to authenticated using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy characters_delete on public.characters for delete to authenticated using (private.is_campaign_dm(campaign_id));
create policy resources_read on public.character_resources for select to authenticated using (exists (select 1 from public.characters c where c.id = character_id and c.campaign_id = character_resources.campaign_id));
create policy resources_insert on public.character_resources for insert to authenticated with check (private.is_campaign_dm(campaign_id));
create policy resources_update on public.character_resources for update to authenticated using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy resources_delete on public.character_resources for delete to authenticated using (private.is_campaign_dm(campaign_id));

-- Atomic bootstrap: a campaign and its first DM can never be created separately.
create function public.create_campaign(campaign_name text, campaign_description text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.campaigns(owner_id, name, description)
    values (current_user_id, trim(campaign_name), campaign_description) returning id into new_id;
  insert into public.campaign_members(campaign_id, user_id, role) values (new_id, current_user_id, 'dm');
  return new_id;
end;
$$;
revoke all on function public.create_campaign(text, text) from public, anon;
grant execute on function public.create_campaign(text, text) to authenticated;

comment on column public.character_resources.copper is 'Integer copper units. Display conversions are presentation only.';
comment on column public.character_resources.exhaustion is 'Upper bound belongs to the campaign ruleset; no edition assumed.';
comment on column public.character_resources.revision is 'Reserved for revision-checked RPC mutations in RYT-003. Not an active concurrency mechanism yet.';
