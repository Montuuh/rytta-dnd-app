-- Transactional hosted SQL probe. Synthetic identities, no OAuth/JWT claim.
-- All fixtures roll back; public application rows are never written.
begin;
do $probe$
declare dm uuid := gen_random_uuid(); player uuid := gen_random_uuid(); peer uuid := gen_random_uuid(); outsider uuid := gen_random_uuid(); other_dm uuid := gen_random_uuid();
  c uuid; ch uuid; peer_ch uuid; def uuid; ring uuid; shop uuid; listing uuid; path text; ring_path text; pending_path text;
  result jsonb; replay jsonb; key uuid := gen_random_uuid(); stack jsonb; actor uuid; visible integer;
begin
  insert into auth.users(id,email,email_confirmed_at) values
    (dm, dm||'@example.invalid',now()), (player,player||'@example.invalid',now()),
    (peer,peer||'@example.invalid',now()), (outsider,outsider||'@example.invalid',now()), (other_dm,other_dm||'@example.invalid',now());
  perform set_config('request.jwt.claim.sub',dm::text,true);
  execute 'set local role authenticated';
  c := pre.create_campaign('RYT-026 rollback probe');
  result := pre.save_item_definition(c,null,null,'{"name":"Probe armour","category":"armor","slot_kind":"body","properties":{"base":17,"dexCap":0}}',gen_random_uuid());
  def := (result->>'id')::uuid;
  path := 'pre/'||c||'/'||def||'/'||gen_random_uuid()||'.webp';
  insert into storage.objects(bucket_id,name) values ('item-images',path);
  result := pre.set_item_image(c,def,0,path,key);
  replay := pre.set_item_image(c,def,0,path,key);
  if result <> replay then raise exception 'Image replay mismatch'; end if;
  begin perform pre.set_item_image(c,def,0,null,gen_random_uuid()); raise exception 'Stale accepted';
    exception when sqlstate 'P0001' then if sqlerrm <> 'Stale revision' then raise; end if; end;
  begin perform pre.set_item_image(c,def,1,replace(path,'pre/','public/'),gen_random_uuid()); raise exception 'Cross environment accepted';
    exception when sqlstate '22023' then null; end;
  ch := pre.create_character(c,'Image owner'); peer_ch := pre.create_character(c,'Image peer');
  execute 'reset role';
  insert into pre.campaign_members(campaign_id,user_id,role) values (c,player,'player'),(c,peer,'player');
  update pre.characters set user_id=player where id=ch;
  update pre.characters set user_id=peer where id=peer_ch;
  execute 'set local role authenticated';
  stack := pre.grant_item(c,ch,def,1,gen_random_uuid());
  ring := (pre.save_item_definition(c,null,null,'{"name":"Selected ring","category":"gear","slot_kind":"ring"}',gen_random_uuid())->>'id')::uuid;
  ring_path := 'pre/'||c||'/'||ring||'/'||gen_random_uuid()||'.webp';
  pending_path := 'pre/'||c||'/'||ring||'/'||gen_random_uuid()||'.webp';
  insert into storage.objects(bucket_id,name) values ('item-images',ring_path),('item-images',pending_path);
  perform pre.set_item_image(c,ring,0,ring_path,gen_random_uuid());
  shop := pre.save_shop(c,null,null,'{"name":"Probe shop","visibility":"party","mode":"auto","resale_percent":50}',gen_random_uuid());
  listing := pre.save_listing(c,shop,null,null,jsonb_build_object('definition_id',ring,'price',1,'visibility','selected','access',jsonb_build_array(ch)),gen_random_uuid());
  perform set_config('request.jwt.claim.sub',player::text,true);
  select count(*) into visible from storage.objects where name in (path,ring_path,pending_path);
  if visible <> 2 then raise exception 'Player image visibility mismatch: %', visible; end if;
  perform pre.save_character_sheet(c,ch,0,1,10,10,'{"baseAbilities":{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10},"bonuses":{"str":0,"dex":0,"con":0,"int":0,"wis":0,"cha":0},"acOverride":null}',true,gen_random_uuid());
  result := pre.equip_item(c,(stack->>'item_id')::uuid,(stack->>'revision')::bigint,'body',gen_random_uuid());
  if (select armor_class from pre.character_sheets where character_id=ch) <> 17 then raise exception 'Equipment AC mismatch'; end if;
  perform pre.unequip_item(c,(result->>'item_id')::uuid,(result->>'revision')::bigint,gen_random_uuid());
  if (select armor_class from pre.character_sheets where character_id=ch) <> 10 then raise exception 'Unequipped AC mismatch'; end if;
  begin perform pre.set_item_image(c,def,1,null,gen_random_uuid()); raise exception 'Player image write accepted';
    exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',other_dm::text,true);
  perform pre.create_campaign('Other DM probe');
  foreach actor in array array[peer,outsider,other_dm] loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    if exists(select 1 from storage.objects where name in(path,ring_path,pending_path)) then raise exception 'Image leak'; end if;
    begin perform pre.set_item_image(c,def,1,null,gen_random_uuid()); raise exception 'Foreign write accepted';
      exception when insufficient_privilege then null; end;
    begin perform pre.equip_item(c,(stack->>'item_id')::uuid,2,'body',gen_random_uuid()); raise exception 'Foreign equip accepted';
      exception when insufficient_privilege then null; end;
  end loop;
  execute 'set local role anon';
  begin perform pre.set_item_image(c,def,1,null,gen_random_uuid()); raise exception 'Anon write accepted';
    exception when insufficient_privilege then null; end;
  execute 'reset role';
end
$probe$;
select 'PASS: PRE catalogue without characters, image attach/replay/stale, Storage RLS actor matrix, selected listing, environment denial, Player equip/unequip and authoritative AC; fixtures rolled back' as result;
rollback;
