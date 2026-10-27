-- Explicit integration probe for a new/staging project. Always rolls back all fixture data.
-- Exercises actual hosted PostgreSQL roles/RLS/RPCs, not Google or JWT issuance.
begin;
set local statement_timeout = '15s';
do $$
declare actor uuid;
begin
  actor := gen_random_uuid();
  perform set_config('rytta.test.dm', actor::text, true);
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data, is_sso_user, is_anonymous)
    values (actor, 'rytta-dm-' || actor || '@example.invalid', now(), '{}', false, false);
  actor := gen_random_uuid();
  perform set_config('rytta.test.player', actor::text, true);
  perform set_config('rytta.test.email', 'rytta-player-' || actor || '@example.invalid', true);
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data, is_sso_user, is_anonymous)
    values (actor, current_setting('rytta.test.email'), now(), '{}', false, false);
  actor := gen_random_uuid();
  perform set_config('rytta.test.outsider', actor::text, true);
  insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data, is_sso_user, is_anonymous)
    values (actor, 'rytta-outsider-' || actor || '@example.invalid', now(), '{}', false, false);
end;
$$;

set local role anon;
do $$
begin
  begin
    perform public.list_my_campaigns();
    raise exception 'Anonymous RPC access unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.campaigns;
    raise exception 'Anonymous table access unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('rytta.test.dm'), true);
do $$
declare campaign uuid; invitation uuid;
begin
  campaign := public.create_campaign('Rytta transactional integration probe');
  perform set_config('rytta.test.campaign', campaign::text, true);
  if not exists(select 1 from public.list_my_campaigns() where id = campaign and role = 'dm')
    then raise exception 'Creator was not made DM'; end if;
  invitation := public.invite_campaign_member(campaign, current_setting('rytta.test.email'));
  perform set_config('rytta.test.invitation', invitation::text, true);
  begin
    perform public.change_campaign_member(campaign, auth.uid(), null);
    raise exception 'Last DM removal unexpectedly allowed';
  exception when raise_exception then
    if sqlerrm <> 'Keep at least one DM' then raise; end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('rytta.test.outsider'), true);
do $$
declare campaign uuid := current_setting('rytta.test.campaign')::uuid;
begin
  perform public.create_campaign('Other campaign integration probe');
  if exists(select 1 from public.campaigns where id = campaign)
    then raise exception 'Cross-campaign read unexpectedly allowed'; end if;
  begin
    perform public.list_campaign_members(campaign);
    raise exception 'Cross-campaign management unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.respond_campaign_invitation(current_setting('rytta.test.invitation')::uuid, true);
    raise exception 'Wrong recipient unexpectedly accepted invitation';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('rytta.test.player'), true);
do $$
declare campaign uuid := current_setting('rytta.test.campaign')::uuid;
begin
  if not exists(select 1 from public.list_my_invitations() where campaign_id = campaign)
    then raise exception 'Verified invitation was not visible'; end if;
  perform public.respond_campaign_invitation(current_setting('rytta.test.invitation')::uuid, true);
  if not exists(select 1 from public.list_my_campaigns() where id = campaign and role = 'player')
    then raise exception 'Accepted invitation did not grant Player'; end if;
  begin
    perform public.respond_campaign_invitation(current_setting('rytta.test.invitation')::uuid, true);
    raise exception 'Invitation replay unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.change_campaign_member(campaign, auth.uid(), 'dm');
    raise exception 'Player escalation unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('rytta.test.dm'), true);
do $$
declare campaign uuid := current_setting('rytta.test.campaign')::uuid; character uuid; changed integer;
begin
  insert into public.characters(campaign_id, user_id, name)
    values (campaign, auth.uid(), 'Preserved integration character') returning id into character;
  insert into public.character_resources(campaign_id, character_id, copper) values (campaign, character, 100);
  perform public.change_campaign_member(campaign, current_setting('rytta.test.player')::uuid, 'dm');
  perform public.change_campaign_member(campaign, auth.uid(), 'player');
  begin
    perform public.invite_campaign_member(campaign, 'not-authorized@example.invalid');
    raise exception 'Creator retained privileges after demotion';
  exception when insufficient_privilege then null;
  end;
  update public.character_resources set copper = 999 where campaign_id = campaign;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Player resource write unexpectedly allowed'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('rytta.test.player'), true);
select public.change_campaign_member(current_setting('rytta.test.campaign')::uuid, current_setting('rytta.test.dm')::uuid, null);
do $$
begin
  if not exists(select 1 from public.character_resources where campaign_id = current_setting('rytta.test.campaign')::uuid and copper = 100)
    then raise exception 'Revocation deleted resources'; end if;
end;
$$;
select set_config('request.jwt.claim.sub', current_setting('rytta.test.dm'), true);
do $$
begin
  if exists(select 1 from public.campaigns where id = current_setting('rytta.test.campaign')::uuid)
    or exists(select 1 from public.character_resources where campaign_id = current_setting('rytta.test.campaign')::uuid)
    then raise exception 'Revoked creator retained access'; end if;
end;
$$;
rollback;
select 'PASS' as hosted_sql_probe, 'All fixture accounts, campaigns and resources rolled back' as cleanup;
