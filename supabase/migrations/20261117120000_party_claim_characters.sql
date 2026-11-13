-- RYT-096 and RYT-097: a Player claims a free character the DM prepared; the party shows teammates
-- the DM does not share live without their live state.
--
-- Free characters are only the ones the DM created that never had a Player (user decision
-- 2026-11-13). characters.ever_assigned (new, default false) becomes true the first time user_id is
-- set, on every path (create_own_character, assign_character, invitation acceptance, claim_character
-- or any later one), through the characters_ever_assigned trigger, and is never cleared. A character
-- that loses its Player (the Player leaves or is removed, change_campaign_member, or the DM uses
-- unassign_character) goes back to the DM and is never offered to Players again; the DM can still
-- assign it with assign_character. Backfill: true for assigned rows and for unassigned rows whose
-- character_events history ever recorded a user_id (characters:INSERT or characters:UPDATE, before
-- or after value). The characters_audit trigger is disabled around that one statement, so the
-- backfill writes no audit rows (it restores history; nobody changed the characters). The column is
-- not secret, but no Player-facing RPC returns it; characters RLS and table grants are unchanged
-- (the owner and the campaign DM read it with the row; nobody can write it directly).
--
-- private.is_free_character(campaign, character) is the single rule: the character belongs to the
-- campaign, is unassigned (user_id null), never had a Player, has no pending, unexpired character invitation
-- (the DM chose someone for it; revoking it or the recipient declining frees it again), is not
-- archived, present (not absent, RYT-079) and is not a combatant of any encounter that has not ended
-- (draft, initiative or active). A character in a live fight is not handed to a Player mid-fight,
-- and one the DM placed in a draft or hidden encounter does not reveal that preparation through the
-- list or its portrait. Removing it from the encounter or ending the encounter frees it again. An
-- active Player may claim it.
--   list_claimable_characters(campaign)   active Player only: the free characters (id, name, sheet
--                                         status, class key and label from the build truncated to 40
--                                         and 100 characters, level, current portrait path), oldest
--                                         first.
--   claim_character(campaign, character)  active Player only, under the campaign lock (the lock the
--                                         combat RPCs also take): links the free character to the
--                                         caller below the four-character limit with the
--                                         assign_character rule (active only when the caller has no
--                                         active character). A free character has no pending
--                                         invitation, and invite_character_player creates them under
--                                         the same campaign lock, so a claim has none to revoke.
--                                         Claiming an own non-archived character again returns it
--                                         unchanged. A character that is not free and not the
--                                         caller's own (assigned to someone else, once assigned,
--                                         invited, archived, absent, in an encounter that has not
--                                         ended, or not in that campaign) raises 'Character
--                                         unavailable'; a full roster raises 'Character limit'. The
--                                         existing characters_audit trigger records the claim as
--                                         characters:UPDATE with the Player as actor, as it records
--                                         the DM's assign_character.
--   Idempotency is state-based (no request id): the claimed character keeps ever_assigned, so a
--   retry that arrives after the DM unassigned it finds it unavailable instead of claiming it again.
--   Absence (RYT-079): the characters_absence trigger keeps a benched Player's claimed character in
--   reserve, as it does for characters they create, restore or accept; the DM's assign_character
--   is not affected (a DM write). An absent character is never free (the absence guard refuses
--   Player writes to it); the DM marks it present first.
--
-- Party overview (get_party_overview, same signature, columns and grants). A Player now also
-- receives every active, assigned teammate the DM does not share live, with every live field null
-- (current_hp, max_hp, temp_hp, armor_class, exhaustion, conditions); name, ownership, sharing flag,
-- sheet status, class and level stay. The own character and shared teammates keep their values;
-- unassigned characters stay DM-only here; the DM's output is unchanged.
--
-- Portraits. private.can_view_portrait (character-portraits storage reads and
-- list_character_portraits) also lets an active Player read the current portrait of a free
-- character of the campaign (same helper). Every other rule is unchanged, including RYT-043: a
-- character fighting visibly in a non-draft encounter shows its portrait to members.
--
-- Actor matrix:
--   anon: cannot execute either new RPC nor get_party_overview; reads no portrait object.
--   outsider / inactive member / DM or Player of another campaign: Forbidden on every RPC for this
--           campaign; no portrait of its characters. A character id of another campaign is
--           'Character unavailable' through this campaign's id.
--   active Player: lists and claims free characters (no other write); reads free portraits; the
--           overview hides non-shared teammates' live fields.
--   active campaign DM: Forbidden on list_claimable_characters and claim_character (the DM assigns
--           with assign_character); overview and portraits unchanged.
--   every role: no direct write to characters (unchanged), so ever_assigned changes only through
--           the trigger.
-- The private helpers (is_campaign_player, is_free_character, can_view_portrait,
-- characters_mark_assigned) are not executable by anon or authenticated.
--
-- Environments: this file runs on production (public / private). When a PRE (pre / pre_private)
-- exists with the RYT-079 absence, RYT-074 portrait and combat tables, the same DDL runs again
-- remapped with pre_admin.remap (pre.characters gets the column, the trigger and its own backfill
-- from pre.character_events). Every statement is idempotent (add column if not exists, create or
-- replace, drop and create trigger, a backfill limited to rows still false, revoke and grant), so a
-- PRE that already received the remapped DDL (tested there first) is brought to the same state.

do $claim$
declare ddl text := $ddl$
-- Only characters that never had a Player are offered to Players (user decision 2026-11-13).
alter table public.characters add column if not exists ever_assigned boolean not null default false;
comment on column public.characters.ever_assigned is
  'RYT-096: true once the character has had a Player; set by trigger, never cleared. Only characters that never had one are offered to Players.';

create or replace function private.characters_mark_assigned() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  if new.user_id is not null then
    new.ever_assigned := true;
  elsif tg_op = 'UPDATE' and old.ever_assigned then
    new.ever_assigned := true;
  end if;
  return new;
end;
$fn$;
revoke all on function private.characters_mark_assigned() from public, anon, authenticated;
drop trigger if exists characters_ever_assigned on public.characters;
create trigger characters_ever_assigned before insert or update on public.characters
  for each row execute function private.characters_mark_assigned();

-- Backfill from the audit history without writing audit rows: nobody changed these characters.
alter table public.characters disable trigger characters_audit;
update public.characters c set ever_assigned = true
  where not c.ever_assigned and (c.user_id is not null or exists (select 1 from public.character_events x
    where x.campaign_id = c.campaign_id and x.character_id = c.id
      and x.kind in ('characters:INSERT', 'characters:UPDATE')
      and (x.before_value ->> 'user_id' is not null or x.after_value ->> 'user_id' is not null)));
alter table public.characters enable trigger characters_audit;

-- An active Player member of the campaign (not a DM, not a former member).
create or replace function private.is_campaign_player(target uuid) returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.campaign_members m
    where m.campaign_id = target and m.user_id = (select auth.uid()) and m.active and m.role = 'player');
$fn$;
revoke all on function private.is_campaign_player(uuid) from public, anon, authenticated;

-- A free character: in the campaign, unassigned and never assigned, without a pending character
-- invitation that can still be accepted, not archived, present and not a combatant of any encounter that has not ended (live
-- fights and the DM's draft or hidden preparation stay private).
create or replace function private.is_free_character(target_campaign uuid, target_character uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.characters ch
    where ch.campaign_id = target_campaign and ch.id = target_character
      and ch.user_id is null and not ch.ever_assigned and ch.archived_at is null and not ch.absent
      and not exists (select 1 from public.campaign_invitations i
        where i.campaign_id = target_campaign and i.character_id = target_character
          and i.status = 'pending' and i.expires_at > now())
      and not exists (select 1 from public.encounter_combatants x
        join public.encounters e on e.campaign_id = x.campaign_id and e.id = x.encounter_id
        where x.campaign_id = target_campaign and x.character_id = target_character
          and e.status <> 'ended'));
$fn$;
revoke all on function private.is_free_character(uuid, uuid) from public, anon, authenticated;

-- Party overview: non-shared teammates appear to Players without live fields (RYT-097).
create or replace function public.get_party_overview(target_campaign uuid)
returns table(id uuid, name text, is_own boolean, is_assigned boolean, shares_live boolean, sheet_status text,
  class_key text, class_label text, level integer, current_hp integer, max_hp integer,
  temp_hp integer, armor_class integer, exhaustion integer, conditions text[])
language plpgsql stable security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); dm boolean;
begin
  if viewer is null or not private.is_campaign_member(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  dm := private.is_campaign_dm(target_campaign);
  return query
    select c.id, c.name, c.user_id is not distinct from viewer, c.user_id is not null, c.shares_live, s.status,
      s.build->>'classKey', s.build->>'classLabel', s.level,
      case when x.live then v.current_hp end, case when x.live then s.max_hp end,
      case when x.live then v.temp_hp end, case when x.live then s.armor_class end,
      case when x.live then r.exhaustion::integer end, case when x.live then v.conditions end
    from public.characters c
    cross join lateral (select dm or c.user_id is not distinct from viewer or c.shares_live as live) x
    left join public.character_sheets s on s.campaign_id = c.campaign_id and s.character_id = c.id
    left join public.character_vitals v on v.campaign_id = c.campaign_id and v.character_id = c.id
    left join public.character_resources r on r.campaign_id = c.campaign_id and r.character_id = c.id
    where c.campaign_id = target_campaign and c.is_active and (dm or c.user_id is not null)
    order by c.created_at, c.id;
end;
$fn$;
revoke all on function public.get_party_overview(uuid) from public, anon;
grant execute on function public.get_party_overview(uuid) to authenticated;

-- RYT-074 rule plus RYT-096: an active Player also reads the current portrait of a free character
-- (private.is_free_character), so the claim list shows faces.
create or replace function private.can_view_portrait(target_campaign uuid, target_character uuid, object_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $fn$
begin
  return private.can_play_character(target_campaign, target_character) or (
    private.is_campaign_member(target_campaign)
    and exists (select 1 from public.character_sheets s
      join public.characters ch on ch.campaign_id = s.campaign_id and ch.id = s.character_id
      where s.campaign_id = target_campaign and s.character_id = target_character
        and s.portrait_path = object_name and ch.archived_at is null
        and (ch.user_id is not null
          or (private.is_campaign_player(target_campaign)
            and private.is_free_character(target_campaign, target_character))
          or exists (select 1 from public.encounter_combatants c
            join public.encounters e on e.id = c.encounter_id
            where c.campaign_id = target_campaign and c.character_id = target_character and not c.hidden
              and e.status <> 'draft'))));
end;
$fn$;
revoke all on function private.can_view_portrait(uuid, uuid, text) from public, anon, authenticated;

-- The free characters an active Player may claim, oldest first.
create or replace function public.list_claimable_characters(target_campaign uuid)
returns table(id uuid, name text, sheet_status text, class_key text, class_label text, level integer,
  portrait_path text)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if auth.uid() is null or not private.is_campaign_player(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  return query
    select c.id, c.name, s.status, left(s.build->>'classKey', 40), left(s.build->>'classLabel', 100),
      s.level, s.portrait_path
    from public.characters c
    left join public.character_sheets s on s.campaign_id = c.campaign_id and s.character_id = c.id
    where c.campaign_id = target_campaign and private.is_free_character(target_campaign, c.id)
    order by c.created_at, c.id;
end;
$fn$;
revoke all on function public.list_claimable_characters(uuid) from public, anon;
grant execute on function public.list_claimable_characters(uuid) to authenticated;

-- An active Player links a free character to themselves. Same limit and active rule as
-- assign_character; a free character has no pending invitation to revoke. The campaign lock
-- serialises concurrent claims, so the second Player to claim the same character finds it assigned.
create or replace function public.claim_character(target_campaign uuid, target_character uuid)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare viewer uuid := auth.uid(); target public.characters;
begin
  if viewer is null then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_player(target_campaign) then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into target from public.characters c
    where c.campaign_id = target_campaign and c.id = target_character for update;
  -- A retried claim of the caller's own character succeeds without a write.
  if target.user_id = viewer and target.archived_at is null then return target.id; end if;
  if target.id is null or not private.is_free_character(target_campaign, target.id) then
    raise exception 'Character unavailable' using errcode = 'P0001'; end if;
  if (select count(*) from public.characters c where c.campaign_id = target_campaign
      and c.user_id = viewer and c.archived_at is null) >= 4 then
    raise exception 'Character limit' using errcode = 'P0001'; end if;
  update public.characters set user_id = viewer, is_active = not exists (
      select 1 from public.characters c
       where c.campaign_id = target_campaign and c.user_id = viewer and c.is_active)
    where campaign_id = target_campaign and id = target.id;
  return target.id;
end;
$fn$;
revoke all on function public.claim_character(uuid, uuid) from public, anon;
grant execute on function public.claim_character(uuid, uuid) to authenticated;
$ddl$;
begin
  execute ddl;
  if to_regprocedure('pre_admin.remap(text)') is not null
      and to_regprocedure('pre.set_character_absent(uuid,uuid,boolean)') is not null
      and to_regprocedure('pre.list_character_portraits(uuid)') is not null
      and to_regclass('pre.encounter_combatants') is not null then
    execute pre_admin.remap(ddl);
  end if;
end;
$claim$;
