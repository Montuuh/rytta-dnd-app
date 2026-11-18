-- Rytta staging unseed (RYT-116): removes exactly the rows of supabase/seed/staging_seed.sql.
--
-- Same guard as the seed: refuses unless the database looks like staging (no schema pre or
-- pre_private, no account other than the 5 seed accounts, no campaign other than the 2 seed
-- campaigns), so it can never run against production.
--
-- How it removes. Through the application's own account deletion: Mara leaves Hollowmere, then
-- each seed account calls prepare_account_deletion and delete_my_account as itself (players
-- first, the DMs last, so their campaigns are deleted with all their data). A sweep then deletes
-- whatever is left, selected only by the fixed seed account and campaign ids, and the account
-- deletion requests the run created. The seed runs this same block before it creates anything.
--
-- Pure ASCII, no backslash anywhere.
do $unseed$
declare
  u_mara constant uuid := '00000000-5eed-4000-8000-000000000001';
  u_teo constant uuid := '00000000-5eed-4000-8000-000000000002';
  u_ilse constant uuid := '00000000-5eed-4000-8000-000000000003';
  u_corin constant uuid := '00000000-5eed-4000-8000-000000000004';
  u_nell constant uuid := '00000000-5eed-4000-8000-000000000005';
  c_salt constant uuid := '00000000-5eed-4000-8000-0000000c0001';
  c_mere constant uuid := '00000000-5eed-4000-8000-0000000c0002';
  seed_users constant uuid[] := array['00000000-5eed-4000-8000-000000000001',
    '00000000-5eed-4000-8000-000000000002', '00000000-5eed-4000-8000-000000000003',
    '00000000-5eed-4000-8000-000000000004', '00000000-5eed-4000-8000-000000000005']::uuid[];
  seed_campaigns constant uuid[] := array['00000000-5eed-4000-8000-0000000c0001',
    '00000000-5eed-4000-8000-0000000c0002']::uuid[];
  -- Account deletion request ids, in the order the accounts are removed.
  leave_order constant uuid[] := array['00000000-5eed-4000-8000-000000000005',
    '00000000-5eed-4000-8000-000000000004', '00000000-5eed-4000-8000-000000000003',
    '00000000-5eed-4000-8000-000000000002', '00000000-5eed-4000-8000-000000000001']::uuid[];
  deletion_requests constant uuid[] := array['00000000-5eed-4000-8006-000000000005',
    '00000000-5eed-4000-8006-000000000004', '00000000-5eed-4000-8006-000000000003',
    '00000000-5eed-4000-8006-000000000002', '00000000-5eed-4000-8006-000000000001']::uuid[];
  who uuid; i integer;
begin
  -- -------------------------------------------------------------------------------------------
  -- Guard: staging only.
  -- -------------------------------------------------------------------------------------------
  if to_regnamespace('pre') is not null or to_regnamespace('pre_private') is not null then
    raise exception 'Refused: schema pre exists, so this is not the staging project'; end if;
  if to_regclass('public.campaigns') is null or to_regclass('auth.users') is null then
    raise exception 'Refused: the application migrations are not applied here'; end if;
  if exists (select 1 from auth.users u where u.id <> all(seed_users)) then
    raise exception 'Refused: auth.users has accounts that are not staging seed accounts'; end if;
  if exists (select 1 from public.campaigns c where c.id <> all(seed_campaigns)) then
    raise exception 'Refused: public.campaigns has campaigns that are not staging seed campaigns'; end if;

  -- -------------------------------------------------------------------------------------------
  -- Removal of the seed rows (staging_unseed.sql runs exactly this block). The application's own
  -- path first: Mara leaves Hollowmere (as its only other active member she would block Teodor's
  -- deletion), then every seed account deletes itself with prepare_account_deletion and
  -- delete_my_account, in an order where nobody is the last DM of a campaign with members. A sweep
  -- then removes whatever is left, selected by the fixed seed ids only.
  -- -------------------------------------------------------------------------------------------
  delete from private.account_deletion_requests r where r.request_id = any(deletion_requests);
  if exists (select 1 from public.campaign_members m where m.campaign_id = c_mere and m.user_id = u_mara
      and m.active and m.role = 'player') then
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', u_mara::text, true),
      set_config('request.jwt.claims', json_build_object('sub', u_mara, 'role', 'authenticated')::text, true);
    perform public.change_campaign_member(c_mere, u_mara, null);
    reset role;
  end if;
  for i in 1 .. array_length(leave_order, 1) loop
    who := leave_order[i];
    if exists (select 1 from auth.users u where u.id = who)
        and not exists (select 1 from private.account_blockers(who)) then
      set local role authenticated;
      perform set_config('request.jwt.claim.sub', who::text, true),
        set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
      perform public.prepare_account_deletion(deletion_requests[i]);
      perform public.delete_my_account('DELETE', deletion_requests[i]);
      reset role;
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  -- Sweep, in the order delete_my_account removes a campaign.
  delete from public.character_events where campaign_id = any(seed_campaigns);
  delete from public.inventory_events where campaign_id = any(seed_campaigns);
  delete from private.resource_requests r using public.characters ch
    where ch.id = r.character_id and ch.campaign_id = any(seed_campaigns);
  delete from public.campaign_invitations where campaign_id = any(seed_campaigns);
  delete from public.shop_orders where campaign_id = any(seed_campaigns);
  delete from public.item_proposals where campaign_id = any(seed_campaigns);
  delete from public.inventory_items where campaign_id = any(seed_campaigns);
  delete from public.shops where campaign_id = any(seed_campaigns);
  delete from public.campaigns where id = any(seed_campaigns);
  delete from private.character_requests where actor_id = any(seed_users);
  delete from private.combat_requests where actor_id = any(seed_users);
  delete from private.content_requests where actor_id = any(seed_users);
  delete from private.inventory_requests where actor_id = any(seed_users);
  delete from private.resource_requests where actor_id = any(seed_users);
  delete from private.sheet_requests where actor_id = any(seed_users);
  delete from private.tabletop_requests where actor_id = any(seed_users);
  delete from public.profiles where user_id = any(seed_users);
  delete from auth.users where id = any(seed_users);
  delete from private.account_deletion_requests r where r.request_id = any(deletion_requests);
  if exists (select 1 from auth.users u where u.id = any(seed_users))
      or exists (select 1 from public.campaigns c where c.id = any(seed_campaigns)) then
    raise exception 'Seed removal incomplete'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
end;
$unseed$;
