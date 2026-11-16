-- PRE only: applies the 20261121120000_items_player_authoring_close DDL to pre / pre_private
-- before that migration reaches production. Run as the database owner after part 1
-- (20261120120000) is applied; it changes no public / private object. Rerun after a PRE refresh
-- (pre:sync copies production functions) until the migration is applied to production.
-- The DDL block must stay identical to the migration's (tests/database/items-economy.test.ts).

do $m2pre$
declare ddl text := $ddl$
create or replace function private.items_player_authoring() returns boolean
language plpgsql stable set search_path = '' as $fn$
begin
  return false;
end;
$fn$;

create or replace function private.money_scale() returns integer
language plpgsql stable set search_path = '' as $fn$
begin
  return 2;
end;
$fn$;

revoke all on function private.items_player_authoring(), private.money_scale()
  from public, anon, authenticated;
$ddl$;
begin
  if to_regprocedure('pre_private.items_player_authoring()') is null
      or to_regprocedure('pre_admin.remap(text)') is null then
    raise exception 'PRE lacks 20261120120000_items_decimal_catalogue_proposals';
  end if;
  execute pre_admin.remap(ddl);
end;
$m2pre$;
