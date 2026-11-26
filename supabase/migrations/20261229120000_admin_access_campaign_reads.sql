-- RYT-185: admin access reads and rolls in a campaign as its DM does.
--
-- What. RYT-153 made admin access (private.admin_access_campaign_ids) count as the campaign's DM
-- in private.is_campaign_member, private.is_campaign_dm, private.my_dm_campaign_ids,
-- private.my_module_campaign_ids and private.my_roll_scopes, but not in private.my_campaign_ids.
-- Several read policies require the campaign to be in my_campaign_ids before they look at the DM
-- branch, so a super admin inside a campaign could act as DM through the RPCs but could not read
-- the rows: campaigns_read (the campaign itself), characters_read (the roster), members_read (the
-- members, which a DM reads), campaign_roll_signals_read, rest_requests_read, tabletop_live_read,
-- encounter_signals_read (the Player branch) and definitions_read (the Player branch). Realtime
-- changes of those tables follow the same policies, so the screens did not update either.
--   - private.my_campaign_ids() also returns the campaigns of the caller's open admin access.
--     Every policy that uses it already grants a DM at least as much, so admin access gains
--     exactly a DM's reads and nothing a DM lacks.
--   - Dice. campaign_rolls.roller_id referenced campaign_members, so a super admin could not log a
--     roll (log_roll, reset_initiative_roll, reset_hit_dice_roll already authorize admin access
--     as DM). It now references auth.users (on delete cascade, as before through the membership),
--     and an after-delete trigger on campaign_members removes that member's rolls in the campaign,
--     which the old cascade did. A roll without a character reads as the DM's to everyone, so a
--     super admin's roll names nobody. roller_id stays readable as an opaque account id, as a co-DM's
--     is; the existing (roller_id, created_at) index serves the new foreign key.
-- Unchanged: a super admin is still never a member (no seat, no member list, no member count),
-- cannot manage membership or invitations, owns no character and claims none
-- (private.is_campaign_player stays membership only), and the access still ends after two hours,
-- on exit or when the role is withdrawn.
--
-- Actor matrix. anon: no execute on the helpers, no read. Outsider, Player of another campaign,
-- DM of another campaign: no access row, so my_campaign_ids is unchanged for them. Player of the
-- campaign: unchanged (their own membership). Super admin without an open access: unchanged.
-- Super admin with an open access: the campaign's DM reads, nothing else.
--
-- PRE. The same DDL is applied to pre / pre_private with pre_admin.remap when PRE exists.
set local lock_timeout = '5s';

do $migration$
declare ddl text := $ddl$
create or replace function private.my_campaign_ids() returns setof uuid
language sql stable security definer set search_path = '' as $fn$
  select m.campaign_id from public.campaign_members m
   where m.user_id = (select auth.uid()) and m.active
  union
  select private.admin_access_campaign_ids();
$fn$;
revoke all on function private.my_campaign_ids() from public, anon;
grant execute on function private.my_campaign_ids() to authenticated;

alter table public.campaign_rolls drop constraint if exists campaign_rolls_roller_fkey;
alter table public.campaign_rolls drop constraint if exists campaign_rolls_roller_user_fkey;
alter table public.campaign_rolls add constraint campaign_rolls_roller_user_fkey
  foreign key (roller_id) references auth.users(id) on delete cascade;

-- What the membership cascade did: a removed member's rolls in that campaign go with the seat.
create or replace function private.campaign_member_rolls_removed() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  delete from public.campaign_rolls r where r.campaign_id = old.campaign_id and r.roller_id = old.user_id;
  return old;
end;
$fn$;
revoke all on function private.campaign_member_rolls_removed() from public, anon, authenticated;
drop trigger if exists campaign_members_rolls_removed on public.campaign_members;
create trigger campaign_members_rolls_removed after delete on public.campaign_members
  for each row execute function private.campaign_member_rolls_removed();
$ddl$;
begin
  execute ddl;
  if to_regclass('pre.campaign_rolls') is not null
      and to_regclass('pre.campaign_members') is not null
      and to_regprocedure('pre_private.admin_access_campaign_ids()') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$migration$;
