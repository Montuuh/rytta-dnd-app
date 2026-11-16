-- RYT-104 and RYT-105 (part 2 of 2): the release tightening that the previous frontend cannot follow.
--
-- 1. Players no longer create or edit item definitions (save_item_definition is DM only) and no
--    longer grant their own Player-made definitions; they add only basic catalogue items
--    (basic_key set) to their own character, and anything new goes through propose_item and the
--    DM's resolve_item_proposal. Existing Player-made definitions and stacks stay untouched and
--    readable; the DM can still edit, price, merge or archive them.
-- 2. Money uses cents: private.money_scale() becomes 2, so every RPC accepts amounts with up to two
--    decimals (0.01 gp = 1 cp; more precision is refused), the per-character shop modifier rounds
--    half up to 0.01 gp and the resale quote rounds down to 0.01 gp (numeric arithmetic, no
--    floating point). Under part 1 alone amounts are whole gold: fractions are refused, the
--    modifier rounds half up and resale rounds down to whole gold.
-- Only two private switches defined by 20261120120000 change; RPC signatures, grants and
-- results are unchanged.
--
-- Actor matrix: unchanged from 20261120120000 except that a Player now receives Forbidden from
-- save_item_definition (create and edit) and from grant_item for any non-basic definition.
--
-- Environments: this file runs on production (public / private) at release. A PRE that already
-- has part 1 receives the same DDL remapped with pre_admin.remap. Before the release, PRE alone is
-- tightened with supabase/maintenance/items-player-authoring-close-pre.sql, which carries this
-- exact DDL (a test keeps both identical). A later PRE refresh copies production functions, so
-- rerun that maintenance file after any pre:sync until this migration reaches production.

do $m2$
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
  execute ddl;
  if to_regprocedure('pre_private.items_player_authoring()') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$m2$;
