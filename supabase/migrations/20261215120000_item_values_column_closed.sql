-- RYT-156 phase 2: Players can no longer read item_definitions.value_gp through the table API.
-- Phase 1 (20261214120000) gave the DM get_item_values and a frontend that no longer selects the
-- column; that frontend is in production, so the column can close now.
--
-- What. In public and, when it exists, pre: revoke the table-level select from authenticated and
-- grant select on every other column. A column-only revoke has no effect while a table grant
-- exists. The column list comes from pg_attribute per schema, so public and pre need not match.
-- definitions_read still decides which rows a member reads; value_gp reaches clients only through
-- definer RPCs (get_item_values and get_shop_admin for the DM, search_campaign_items for basic
-- items).
--
-- Security. anon keeps no privilege; service_role and the owner are unchanged. Definer functions
-- run as the owner and are unaffected; no policy, view, publication or invoker function reads the
-- table (checked hosted 2026-11-20). A PRE refresh copies both table and column ACLs
-- (20261028215647), so a refreshed PRE keeps this shape. A new column needs its own column grant.
-- PRE backups (pre_backup_*) get the same shape, so a later pre_admin.restore does not reopen the
-- column. Re-running this grants every column present at that time except value_gp.
do $migration$
declare s text; cols text;
begin
  for s in select n.nspname from pg_namespace n
            where n.nspname in ('public', 'pre') or left(n.nspname, 11) = 'pre_backup_' loop
    if to_regclass(format('%I.item_definitions', s)) is null then continue; end if;
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
      from pg_attribute a
     where a.attrelid = to_regclass(format('%I.item_definitions', s))
       and a.attnum > 0 and not a.attisdropped and a.attname <> 'value_gp';
    execute format('revoke select on %I.item_definitions from authenticated', s);
    execute format('grant select (%s) on %I.item_definitions to authenticated', cols, s);
  end loop;
end;
$migration$;
