-- RYT-144: one reviewed distribution across characters, with optional reusable snapshots.
-- Only campaign DMs can read recipes and grant loot. Anonymous callers have no execute.
-- Recipes preserve reviewed IDs across roster changes; every use revalidates the current
-- campaign, active recipients and item revisions. No direct client access to stored recipes.
do $migration$
declare ddl text := $ddl$
insert into private.quota_limits(quota, max_count) values ('loot_batches_per_campaign', 100);

create table private.loot_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  allocations jsonb not null check (jsonb_typeof(allocations) = 'array' and jsonb_array_length(allocations) between 1 and 100),
  unique (campaign_id, name)
);
alter table private.loot_batches enable row level security;
revoke all on private.loot_batches from public, anon, authenticated;

create function public.list_loot_batches(target_campaign uuid, after_name text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not private.is_campaign_dm(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if length(after_name) > 80 then raise exception 'Invalid cursor' using errcode = '22023'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(b) order by b.name), '[]'::jsonb) from (
    select id, name, allocations from private.loot_batches
    where campaign_id = target_campaign and (after_name is null or name > after_name)
    order by name limit 20
  ) b);
end;
$fn$;
revoke all on function public.list_loot_batches(uuid,text) from public, anon;
grant execute on function public.list_loot_batches(uuid,text) to authenticated;

create function public.delete_loot_batch(target_campaign uuid, target_batch uuid, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare payload jsonb := jsonb_build_array('delete_loot_batch',target_campaign,target_batch); prior jsonb;
begin
  perform private.shop_lock(target_campaign, true, null);
  prior := private.shop_claim(request_id,payload);
  if prior is not null then return prior; end if;
  delete from private.loot_batches where campaign_id = target_campaign and id = target_batch;
  if not found then raise exception 'Batch unavailable' using errcode = '42501'; end if;
  return private.inventory_finish(request_id,payload,jsonb_build_object('id',target_batch));
end;
$fn$;
revoke all on function public.delete_loot_batch(uuid,uuid,uuid) from public, anon;
grant execute on function public.delete_loot_batch(uuid,uuid,uuid) to authenticated;

create function public.distribute_loot(target_campaign uuid, allocations jsonb, batch_name text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  payload jsonb; prior jsonb; allocation record; definition public.item_definitions;
  saved_name text; batch_id uuid; receipt jsonb := '[]'::jsonb;
  recipe jsonb := '[]'::jsonb; grant_result jsonb; entry jsonb;
begin
  perform private.shop_lock(target_campaign, true, null);
  if jsonb_typeof(allocations) is distinct from 'array' then raise exception 'Invalid allocations' using errcode = '22023'; end if;
  if jsonb_array_length(allocations) not between 1 and 100 or octet_length(allocations::text) > 32000 then
    raise exception 'Invalid allocations' using errcode = '22023';
  end if;
  if batch_name is not null then saved_name := private.check_text(batch_name, 80, false); end if;
  payload := jsonb_build_array('distribute_loot', target_campaign, saved_name,
    encode(sha256(convert_to(allocations::text, 'UTF8')), 'hex'));
  prior := private.shop_claim(request_id, payload);
  if prior is not null then return prior; end if;

  if saved_name is not null and (select count(*) from private.loot_batches where campaign_id = target_campaign)
      >= private.quota_limit('loot_batches_per_campaign') then
    raise exception 'Batch limit reached' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(allocations) a where jsonb_typeof(a) <> 'object'
    or a - array['character_id','definition_id','quantity','revision'] <> '{}'::jsonb
    or jsonb_typeof(a->'quantity') is distinct from 'number' or jsonb_typeof(a->'revision') is distinct from 'number'
    or jsonb_typeof(a->'character_id') is distinct from 'string' or jsonb_typeof(a->'definition_id') is distinct from 'string') then
    raise exception 'Invalid allocation' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(allocations) as a(character_id uuid, definition_id uuid)
      group by a.character_id, a.definition_id having count(*) > 1) then
    raise exception 'Duplicate allocation' using errcode = '22023';
  end if;
  for allocation in select * from jsonb_to_recordset(allocations) as a(character_id uuid, definition_id uuid, quantity integer, revision bigint)
  loop
    if allocation.quantity is null or allocation.quantity not between 1 and 1000 then
      raise exception 'Invalid quantity' using errcode = '22023';
    end if;
    perform 1 from public.characters c where c.campaign_id = target_campaign
      and c.id = allocation.character_id and c.is_active and c.archived_at is null for share;
    if not found then
      raise exception 'Character unavailable' using errcode = '42501';
    end if;
    select * into definition from public.item_definitions d where d.campaign_id = target_campaign
      and d.id = allocation.definition_id and not d.archived for share;
    if not found then raise exception 'Item unavailable' using errcode = '42501'; end if;
    if definition.revision is distinct from allocation.revision then raise exception 'Stale revision' using errcode = 'P0001'; end if;
    grant_result := private.grant_units(target_campaign, allocation.character_id, definition.id, allocation.quantity, 'dm', gen_random_uuid());
    entry := jsonb_build_object('character_id', allocation.character_id, 'definition_id', definition.id, 'quantity', allocation.quantity);
    recipe := recipe || jsonb_build_array(entry);
    receipt := receipt || jsonb_build_array(entry || jsonb_build_object('event_id',grant_result->'event_id'));
  end loop;
  if saved_name is not null then
    insert into private.loot_batches(campaign_id, name, allocations)
      values (target_campaign, saved_name, recipe)
      on conflict (campaign_id, name) do nothing returning id into batch_id;
    if batch_id is null then raise exception 'Batch name in use' using errcode = '22023'; end if;
  end if;
  return private.inventory_finish(request_id, payload, jsonb_build_object('allocations', receipt, 'batch_id', batch_id));
end;
$fn$;
revoke all on function public.distribute_loot(uuid,jsonb,text,uuid) from public, anon;
grant execute on function public.distribute_loot(uuid,jsonb,text,uuid) to authenticated;
$ddl$;
begin
  if to_regnamespace('pre') is not null then
    if to_regprocedure('pre_admin.remap(text)') is null
      or to_regprocedure('pre_private.grant_units(uuid,uuid,uuid,integer,text,uuid)') is null
      or to_regprocedure('pre_private.shop_lock(uuid,boolean,uuid)') is null
      or to_regprocedure('pre_private.inventory_finish(uuid,jsonb,jsonb)') is null
      or to_regprocedure('pre_private.shop_claim(uuid,jsonb)') is null
      or to_regprocedure('pre_private.check_text(text,integer,boolean)') is null
      or to_regprocedure('pre_private.quota_limit(text)') is null then
      raise exception 'Incomplete PRE loot prerequisites';
    end if;
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;
