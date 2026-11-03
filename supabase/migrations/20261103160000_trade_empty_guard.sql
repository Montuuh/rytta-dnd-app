-- RYT-034 follow-up: an empty trade (no items and no gold on either side) cannot be accepted.
-- The window already disables "Accept" with a hint; this is the authoritative server rule.
-- Only confirm_trade changes (same signature, grants and idempotency); the rest of
-- 20261103150000_player_trades.sql stays as applied.
--
-- Actor matrix: unchanged from 20261103150000 (anon cannot execute; outsiders, non-participants
-- and cross-campaign DMs raise Forbidden through private.inventory_begin / trade_side).
--
-- Environments: this file runs on production (public). When a PRE (pre / pre_private) exists,
-- the guarded block below recreates the same function remapped with pre_admin.remap.

create or replace function public.confirm_trade(target_campaign uuid, target_trade uuid,
  acting_character uuid, expected_revision bigint, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare payload jsonb := jsonb_build_array('trade_confirm', target_campaign, target_trade, acting_character,
    expected_revision);
  replay jsonb; t public.trades; my_side text;
begin
  replay := private.inventory_begin(target_campaign, acting_character, request_id, payload);
  if replay is not null then return replay; end if;
  perform private.trade_sweep(target_campaign);
  select * into t from public.trades where campaign_id = target_campaign and id = target_trade for update;
  my_side := private.trade_side(t.initiator_character, t.partner_character, acting_character);
  -- A second confirmation of the revision that completed the trade is a no-op success.
  if t.status = 'completed' and t.revision = expected_revision + 1 then
    return private.inventory_finish(request_id, payload,
      jsonb_build_object('trade_id', t.id, 'status', t.status, 'revision', t.revision));
  end if;
  if t.status <> 'open' then raise exception 'Trade closed' using errcode = 'P0001'; end if;
  if t.revision is distinct from expected_revision then
    raise exception 'Stale revision' using errcode = 'P0001'; end if;
  -- Nothing on the table: there is no deal to accept.
  if t.initiator_gold = 0 and t.partner_gold = 0 and not exists (
      select 1 from public.trade_offer_items o where o.campaign_id = t.campaign_id and o.trade_id = t.id) then
    raise exception 'Empty trade' using errcode = 'P0001'; end if;
  update public.trades set
      initiator_confirmed = initiator_confirmed or my_side = 'initiator',
      partner_confirmed = partner_confirmed or my_side = 'partner',
      expires_at = now() + interval '10 minutes', updated_at = now()
    where id = t.id returning * into t;
  if t.initiator_confirmed and t.partner_confirmed then
    perform private.trade_complete(t.id);
    select * into t from public.trades where id = t.id;
  end if;
  return private.inventory_finish(request_id, payload,
    jsonb_build_object('trade_id', t.id, 'status', t.status, 'revision', t.revision));
end;
$$;

revoke all on function public.confirm_trade(uuid, uuid, uuid, bigint, uuid) from public, anon;
grant execute on function public.confirm_trade(uuid, uuid, uuid, bigint, uuid) to authenticated;

-- PRE mirror (only when PRE already has the trade RPCs): recreate with remapped references.
do $$
declare signature text := 'public.confirm_trade(uuid,uuid,uuid,bigint,uuid)';
begin
  if to_regprocedure('pre.confirm_trade(uuid,uuid,uuid,bigint,uuid)') is null
      or to_regprocedure('pre_admin.remap(text)') is null then
    return;
  end if;
  execute pre_admin.remap(pg_get_functiondef(to_regprocedure(signature)));
  execute format('revoke all on function %s from public, anon', pre_admin.remap(signature));
  execute format('grant execute on function %s to authenticated', pre_admin.remap(signature));
end;
$$;
