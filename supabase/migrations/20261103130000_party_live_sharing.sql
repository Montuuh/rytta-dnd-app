-- RYT-031: party live sharing.
-- A DM decides per character whether its live combat state is shared with the rest of the party
-- (default on). Shared state is deliberately narrow: identity, class/level, HP (current, max,
-- temporary), AC, exhaustion and active conditions. Gold, water, rations, the build, notes,
-- spells and any other sheet/vitals field never leave the owner/DM boundary.
--
-- Actor matrix:
--   anon: cannot execute either RPC.
--   outsider / inactive member / DM of another campaign: get_party_overview raises Forbidden;
--           set_character_live_sharing raises Forbidden.
--   active Player: get_party_overview returns the own character plus other *assigned* characters
--           with shares_live = true, limited to the live columns above (never user ids).
--           Cannot toggle sharing.
--   active campaign DM: get_party_overview returns every character of the campaign with its
--           shares_live flag; set_character_live_sharing toggles it. The existing
--           characters_audit trigger records each change as characters:UPDATE.
-- Base table policies are unchanged: Players still cannot SELECT other characters' rows.
--
-- Environments: this file runs on production (public). A PRE (pre / pre_private) that predates
-- this migration receives the same column and functions through the guarded block at the end,
-- cloned with the canonical pre_admin.remap used by the ETL (docs/pre-environment.md).
-- Apply to PRE first, validate, then to production.

alter table public.characters add column if not exists shares_live boolean not null default true;
comment on column public.characters.shares_live is
  'RYT-031: when true, campaign Players see this character''s live HP, AC, exhaustion and conditions. DM-only toggle via set_character_live_sharing.';

create or replace function public.set_character_live_sharing(target_campaign uuid, target_character uuid,
  enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  if enabled is null then raise exception 'Invalid request' using errcode = '22023'; end if;
  if not exists (select 1 from public.characters c
      where c.campaign_id = target_campaign and c.id = target_character) then
    raise exception 'Character unavailable' using errcode = '42501'; end if;
  -- Only a real change writes (and therefore audits) the row.
  update public.characters set shares_live = enabled
    where campaign_id = target_campaign and id = target_character and shares_live is distinct from enabled;
  return enabled;
end;
$$;

create or replace function public.get_party_overview(target_campaign uuid)
returns table(id uuid, name text, is_own boolean, is_assigned boolean, shares_live boolean, sheet_status text,
  class_key text, class_label text, level integer, current_hp integer, max_hp integer,
  temp_hp integer, armor_class integer, exhaustion integer, conditions text[])
language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid := auth.uid(); dm boolean;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  return query
    select c.id, c.name, c.user_id is not distinct from viewer, c.user_id is not null, c.shares_live, s.status,
      s.build->>'classKey', s.build->>'classLabel', s.level, v.current_hp, s.max_hp, v.temp_hp,
      s.armor_class, r.exhaustion::integer, v.conditions
    from public.characters c
    left join public.character_sheets s on s.campaign_id = c.campaign_id and s.character_id = c.id
    left join public.character_vitals v on v.campaign_id = c.campaign_id and v.character_id = c.id
    left join public.character_resources r on r.campaign_id = c.campaign_id and r.character_id = c.id
    where c.campaign_id = target_campaign
      and (dm or c.user_id = viewer or (c.user_id is not null and c.shares_live))
    order by c.created_at, c.id;
end;
$$;

revoke all on function public.set_character_live_sharing(uuid, uuid, boolean),
  public.get_party_overview(uuid) from public, anon;
grant execute on function public.set_character_live_sharing(uuid, uuid, boolean),
  public.get_party_overview(uuid) to authenticated;

-- PRE mirror (only when PRE exists and predates this migration).
do $$
declare fn text;
begin
  if to_regclass('pre.characters') is null or to_regprocedure('pre_admin.remap(text)') is null then
    return;
  end if;
  alter table pre.characters add column if not exists shares_live boolean not null default true;
  execute pre_admin.remap(format('comment on column public.characters.shares_live is %L',
    col_description('public.characters'::regclass,
      (select attnum from pg_attribute where attrelid = 'public.characters'::regclass
        and attname = 'shares_live')::integer)));
  foreach fn in array array['public.set_character_live_sharing(uuid,uuid,boolean)',
      'public.get_party_overview(uuid)'] loop
    execute pre_admin.remap(pg_get_functiondef(fn::regprocedure));
    execute format('revoke all on function %s from public, anon', pre_admin.remap(fn));
    execute format('grant execute on function %s to authenticated', pre_admin.remap(fn));
  end loop;
end;
$$;
