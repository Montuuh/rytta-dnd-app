-- Only the active campaign DM links an unassigned character to an existing active Player.
create function public.assign_character(target_campaign uuid, target_character uuid, target_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.campaigns where id = target_campaign for update;
  if not private.is_campaign_dm(target_campaign) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists(select 1 from public.campaign_members where campaign_id=target_campaign and user_id=target_user and active and role='player') then
    raise exception 'Player unavailable' using errcode = '42501';
  end if;
  if exists(select 1 from public.characters where campaign_id=target_campaign and user_id=target_user) then
    raise exception 'Already assigned' using errcode = 'P0001';
  end if;
  update public.characters set user_id=target_user where campaign_id=target_campaign and id=target_character and user_id is null;
  if not found then raise exception 'Character unavailable' using errcode = 'P0001'; end if;
  update public.campaign_invitations set status='revoked' where character_id=target_character and status='pending';
end;
$$;
revoke all on function public.assign_character(uuid,uuid,uuid) from public, anon;
grant execute on function public.assign_character(uuid,uuid,uuid) to authenticated;
