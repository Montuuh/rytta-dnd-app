-- RYT-029: remove the campaign revelations ("discoveries") feature.
-- Revelations were a DM-curated queue introduced in RYT-023; the product no longer wants it.
-- Dropping the table also removes its index, grants and the revelations_read policy.
-- Actor matrix after this migration: nobody (anon, outsider, player, DM) can read or call
-- anything revelation-related; the relation and the RPCs do not exist.
--
-- Environments: this file runs on production (public). PRE (pre / pre_private) is a copy of
-- public made by pre_admin.refresh (docs/pre-environment.md), so a PRE that predates this
-- migration receives the same removal through the guarded block at the end, with the schema
-- references remapped. Apply it to PRE first, validate, then to production.

drop policy if exists revelations_read on public.campaign_revelations;

drop function if exists public.create_campaign_revelation(uuid, text, text, text, text);
drop function if exists public.set_revelation_visibility(uuid, uuid, text);

drop table if exists public.campaign_revelations;

-- PRE mirror (only when PRE exists and still carries the objects).
do $$
begin
  if to_regclass('pre.campaign_revelations') is not null then
    drop policy if exists revelations_read on pre.campaign_revelations;
  end if;
  if to_regnamespace('pre') is not null then
    drop function if exists pre.create_campaign_revelation(uuid, text, text, text, text);
    drop function if exists pre.set_revelation_visibility(uuid, uuid, text);
    drop table if exists pre.campaign_revelations;
  end if;
end;
$$;
