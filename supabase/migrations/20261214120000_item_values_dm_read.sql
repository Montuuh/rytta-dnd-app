-- RYT-156 phase 1: a DM-only read path for item values.
-- Players can read item_definitions.value_gp of the definitions they carry straight from the
-- table (definitions_read admits the whole row). Column grants are per role, so the column cannot
-- be revoked while the DM's storeroom reads it through the same select. Phase 1 adds the DM's own
-- read path and a frontend that stops selecting the column; phase 2, after that frontend is in
-- production, revokes the column from authenticated.
--
-- What. public.get_item_values(target_campaign uuid) returns jsonb: an object of definition id to
-- value_gp for every definition of the campaign with a value, to the campaign DM; an empty object
-- to any other member (so the client needs no role check); Forbidden to a non-member. Basic-item
-- prices for Players and shop prices keep their own paths (search_campaign_items, the
-- storefront), unchanged.
--
-- Security. security definer, search_path '', membership and DM checks with auth.uid(); execute
-- revoked from public and anon, granted to authenticated. Additive: no table, policy or existing
-- grant changes, so the frontend in production keeps working.
--
-- Environments: a PRE with item_definitions gets the same DDL through pre_admin.remap.
do $migration$
declare ddl text := $ddl$
create or replace function public.get_item_values(target_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if auth.uid() is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not private.is_campaign_dm(target_campaign) then return '{}'::jsonb; end if;
  return coalesce((select jsonb_object_agg(d.id, d.value_gp) from public.item_definitions d
    where d.campaign_id = target_campaign and d.value_gp is not null), '{}'::jsonb);
end;
$fn$;
revoke all on function public.get_item_values(uuid) from public, anon;
grant execute on function public.get_item_values(uuid) to authenticated;
$ddl$;
begin
  if to_regclass('pre.item_definitions') is not null
      and to_regprocedure('pre_private.is_campaign_dm(uuid)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;
