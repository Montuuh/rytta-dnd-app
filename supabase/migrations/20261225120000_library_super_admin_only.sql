-- RYT-173: only super admins write the content library (ADR 054, amends ADR 040 and ADR 051).
--
-- What. private.is_content_editor() now answers only for super admins. Until now it also
-- answered for the accounts listed in private.content_editors, and any of them could edit, publish
-- or change the visibility of any pack, the SRD included. The owner wants the downloadable base
-- data set by super admins alone (2026-11-23).
--   - Every caller of the helper follows: the library write RPCs and draft reads
--     (content_require_editor), the editor view of get_content_library and get_content_entries,
--     the private packs of get_content_choices and create_campaign_with_content, the offers of a
--     private pack (content_offer_manager) and the pack-images storage policies
--     (pack_image_access resolves the helper by name in each environment).
--   - private.content_editors is retired: its rows grant nothing. The table stays (migrations are
--     append-only and account deletion still clears it); no row is deleted here.
--   - Idempotent replays are unchanged: a request an account made while it could write still
--     replays its stored result (ids only) to that same account.
--
-- Actor matrix.
--   anon: no function execution (unchanged).
--   signed-in account, Player, DM, DM of another campaign, and an account that holds only a
--     content_editors row: Forbidden on every library write, draft read, offer change and picture
--     upload; they read published public packs, their own published private packs and what their
--     campaigns pin, as before.
--   super admin: every library read and write, any pack, any campaign's offers.
-- No table, grant or policy changes; the helper keeps its revoked execute.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists.
do $migration$
declare ddl text := $ddl$
-- plpgsql, not sql: a PRE refresh recreates functions in name order, and is_content_editor comes
-- before is_super_admin.
create or replace function private.is_content_editor() returns boolean
language plpgsql stable security definer set search_path = '' as $fn$
begin
  return private.is_super_admin();
end;
$fn$;
revoke all on function private.is_content_editor() from public, anon, authenticated;

comment on table private.content_editors is
  'Retired by RYT-173: the content library is written by super admins only. Rows grant nothing.';
$ddl$;
begin
  -- Without the super admin helper every library read would fail, readers included.
  if to_regprocedure('private.is_super_admin()') is null then
    raise exception 'RYT-173 needs the super admin role (RYT-153) in this database';
  end if;
  if to_regclass('pre_private.content_editors') is not null
      and to_regprocedure('pre_private.is_super_admin()') is not null then
    execute pre_admin.remap(ddl);
  end if;
  execute ddl;
end;
$migration$;
