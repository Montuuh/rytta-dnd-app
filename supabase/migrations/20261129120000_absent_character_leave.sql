-- RYT-120: a Player whose character is absent can leave the campaign.
--
-- Cause. change_campaign_member (latest definition 20261105130000) first deactivates the
-- membership and then releases the leaver's characters (user_id = null). For an absent character
-- that UPDATE reaches private.characters_absence_rules (20261114120000), which refuses every
-- write to an absent row by anyone but the campaign DM or a system write, so a Player leaving on
-- their own raised 'Character absent' and the whole leave rolled back. The DM removing the member
-- (a DM write), delete_my_account and a direct Auth deletion (system writes, through
-- private.release_member_characters) were not affected.
--
-- Change. characters_absence_rules (same signature, trigger and grants) also lets the former
-- owner release their absent character: the caller is the row's user_id, is no longer an active
-- member of the campaign (change_campaign_member deactivated the membership in the same
-- transaction), the new user_id is null and no other column changes apart from is_active and the
-- trigger-maintained ever_assigned. Every other non-DM write to an absent character is still
-- refused, archiving an absent character is still refused for everyone, and present characters
-- follow exactly the same rules as before.
--
-- Absent flag. The released character keeps absent = true (and so is_active = false, constraint
-- characters_absent_inactive). Absence is the DM's per-session flag on the character, not a
-- membership state: characters_unassigned_active already allows an unassigned absent row,
-- set_character_absent handles unassigned characters (marking one present makes it active for the
-- DM), and release_member_characters / delete_my_account already keep the flag. Clearing it would
-- silently put the character back into the active party lists. A released character has
-- ever_assigned = true, so it is never offered to claim_character; the DM can assign it or mark it
-- present. The audit trigger records the release with the leaving Player as actor.
--
-- Actor matrix (unchanged; change_campaign_member is not replaced): anon has no execute;
-- outsiders, inactive members, other Players and DMs of other campaigns raise Forbidden; a Player
-- may only leave themselves; the campaign DM changes or removes members. The function stays
-- security definer with search_path '' and no execute for public, anon or authenticated.
--
-- Environments: production runs the DDL on public / private. A PRE that has the RYT-079 absence
-- objects receives the same DDL through pre_admin.remap; create or replace is idempotent.

do $absent_leave$
declare ddl text := $ddl$
create or replace function private.characters_absence_rules() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare dm boolean := auth.uid() is null or private.is_campaign_dm(new.campaign_id);
  releasing boolean := false;
begin
  if tg_op = 'UPDATE' and old.absent then
    -- The former owner, after leaving, returns the character to the pool (RYT-120).
    releasing := not dm and old.user_id = auth.uid() and new.user_id is null
      and not private.is_campaign_member(new.campaign_id)
      and (to_jsonb(new) - array['user_id', 'is_active', 'ever_assigned'])
        = (to_jsonb(old) - array['user_id', 'is_active', 'ever_assigned']);
    if not dm and not releasing then raise exception 'Character absent' using errcode = 'P0001'; end if;
    if new.archived_at is not null and old.archived_at is null then
      raise exception 'Character absent' using errcode = 'P0001'; end if;
  end if;
  if new.absent then
    new.is_active := false;
  elsif not dm and new.user_id is not null and new.is_active
      and (tg_op = 'INSERT' or not old.is_active or new.user_id is distinct from old.user_id)
      and private.player_benched(new.campaign_id, new.user_id) then
    new.is_active := false;
  end if;
  return new;
end;
$fn$;
revoke all on function private.characters_absence_rules() from public, anon, authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre_private.characters_absence_rules()') is not null
      and to_regprocedure('pre_private.player_benched(uuid,uuid)') is not null
      and to_regprocedure('pre_admin.remap(text)') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$absent_leave$;
