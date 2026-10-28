-- RYT-017 administrative ETL. No browser role can execute these maintenance functions.
create schema if not exists pre_admin;
revoke all on schema pre_admin from public, anon, authenticated;

create table pre_admin.backups (
  id uuid primary key,
  public_schema text not null unique,
  private_schema text not null unique,
  created_at timestamptz not null default now(),
  restored_at timestamptz
);
alter table pre_admin.backups enable row level security;
revoke all on pre_admin.backups from public, anon, authenticated;

create function pre_admin.remap(definition text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(replace(replace(definition, '"public".', 'pre.'), '"private".', 'pre_private.'), '\mpublic\.', 'pre.', 'g'), '\mprivate\.', 'pre_private.', 'g');
$$;

create function pre_admin.snapshot() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t record; rows jsonb; result jsonb := '{}'::jsonb;
begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('pre','pre_private') and c.relkind='r' order by 1,2 loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I t',t.nspname,t.relname) into rows;
    result := result || jsonb_build_object(t.nspname||'.'||t.relname,rows);
  end loop;
  return result;
end;
$$;

create function pre_admin.refresh(replace_existing boolean default false, dry_run boolean default true) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t record; f record; x record; grant_row record; dst text; definition text; role_name text; roles_sql text;
  row_count bigint; report jsonb := '[]'::jsonb; target_exists boolean; backup_id uuid; backup_public text; backup_private text;
begin
  perform pg_advisory_xact_lock(172017,1);
  -- The caller must use REPEATABLE READ for a stable bulk snapshot.
  if current_setting('transaction_isolation') <> 'repeatable read' then
    raise exception 'ETL requires a REPEATABLE READ transaction';
  end if;
  target_exists := exists(select 1 from pg_namespace where nspname in ('pre','pre_private'));
  if target_exists and not replace_existing and not dry_run then raise exception 'PRE exists; backup and explicit replacement required'; end if;
  -- Fail before writing for object kinds this copier cannot safely reproduce yet.
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private')
    and c.relkind in ('v','m','S','p','f') and not exists(select 1 from pg_depend d where d.objid=c.oid and d.deptype='e')) then
    raise exception 'Unsupported views, sequences, partitions or foreign tables; extend ETL first';
  end if;
  if exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_type ty on ty.oid=a.atttypid join pg_namespace tn on tn.oid=ty.typnamespace
    where n.nspname in ('public','private') and c.relkind='r' and a.attnum>0 and not a.attisdropped
    and (a.attgenerated<>'' or tn.nspname in ('public','private'))) then
    raise exception 'Unsupported generated columns or application-defined types; extend ETL first';
  end if;
  -- Source locks prevent concurrent table DDL; REPEATABLE READ provides the data snapshot.
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r'
    and not exists(select 1 from pg_depend d where d.objid=c.oid and d.deptype='e') order by 1,2 loop
    execute format('lock table %I.%I in access share mode',t.nspname,t.relname);
    execute format('select count(*) from %I.%I',t.nspname,t.relname) into row_count;
    report := report || jsonb_build_array(jsonb_build_object('source',t.nspname||'.'||t.relname,
      'target',(case when t.nspname='public' then 'pre' else 'pre_private' end)||'.'||t.relname,'rows',row_count));
  end loop;
  if dry_run then return jsonb_build_object('dryRun',true,'targetExists',target_exists,'tables',report); end if;
  if replace_existing then
    if to_regnamespace('pre') is null or to_regnamespace('pre_private') is null then
      raise exception 'Incomplete PRE schema pair; repair explicitly before refresh';
    end if;
    if exists(select 1 from pg_depend d join pg_class c on d.refclassid='pg_class'::regclass and d.refobjid=c.oid
      join pg_namespace n on n.oid=c.relnamespace join pg_rewrite rw on d.classid='pg_rewrite'::regclass and d.objid=rw.oid
      join pg_class v on v.oid=rw.ev_class join pg_namespace vn on vn.oid=v.relnamespace
      where n.nspname in ('pre','pre_private') and vn.nspname not in ('pre','pre_private'))
      or exists(select 1 from pg_constraint k join pg_class c on c.oid=k.confrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_class r on r.oid=k.conrelid join pg_namespace rn on rn.oid=r.relnamespace
      where k.contype='f' and n.nspname in ('pre','pre_private') and rn.nspname not in ('pre','pre_private')) then
      raise exception 'External dependencies reference PRE; refusing replacement';
    end if;
    backup_id := gen_random_uuid();
    backup_public := 'pre_backup_'||replace(backup_id::text,'-','');
    backup_private := 'pre_private_backup_'||replace(backup_id::text,'-','');
    execute format('alter schema pre rename to %I',backup_public);
    execute format('alter schema pre_private rename to %I',backup_private);
    execute format('revoke all on schema %I,%I from public,anon,authenticated,service_role',backup_public,backup_private);
    insert into pre_admin.backups(id,public_schema,private_schema) values(backup_id,backup_public,backup_private);
  end if;
  execute 'create schema pre'; execute 'create schema pre_private';
  execute 'revoke all on schema pre, pre_private from public, anon, authenticated';
  execute 'grant usage on schema pre to anon, authenticated, service_role';
  execute 'grant usage on schema pre_private to authenticated, service_role';
  -- Tables and data first: triggers and foreign keys are installed only after copying.
  for t in select c.oid,n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r'
    and not exists(select 1 from pg_depend d where d.objid=c.oid and d.deptype='e') order by 1,2 loop
    dst := case when t.nspname='public' then 'pre' else 'pre_private' end;
    execute format('create table %I.%I (like %I.%I including all)',dst,t.relname,t.nspname,t.relname);
    for x in select a.attname,pg_get_expr(d.adbin,d.adrelid) expr from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum where d.adrelid=t.oid loop
      execute format('alter table %I.%I alter column %I set default %s',dst,t.relname,x.attname,pre_admin.remap(x.expr));
    end loop;
    execute format('insert into %I.%I select * from %I.%I',dst,t.relname,t.nspname,t.relname);
    execute format('revoke all on %I.%I from public, anon, authenticated, service_role',dst,t.relname);
    for grant_row in select acl.grantee,acl.privilege_type,acl.is_grantable from pg_class c,
      lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl where c.oid=t.oid and acl.grantee<>c.relowner loop
      role_name := case when grant_row.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(grant_row.grantee)) end;
      execute format('grant %s on %I.%I to %s%s',grant_row.privilege_type,dst,t.relname,role_name,case when grant_row.is_grantable then ' with grant option' else '' end);
    end loop;
    for grant_row in select at.attname,acl.grantee,acl.privilege_type,acl.is_grantable from pg_attribute at,
      lateral aclexplode(at.attacl) acl where at.attrelid=t.oid and at.attnum>0 loop
      role_name := case when grant_row.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(grant_row.grantee)) end;
      execute format('grant %s (%I) on %I.%I to %s%s',grant_row.privilege_type,grant_row.attname,dst,t.relname,role_name,case when grant_row.is_grantable then ' with grant option' else '' end);
    end loop;
    if t.relrowsecurity then execute format('alter table %I.%I enable row level security',dst,t.relname); end if;
    if t.relforcerowsecurity then execute format('alter table %I.%I force row level security',dst,t.relname); end if;
  end loop;
  for f in select p.oid,n.nspname,p.proacl,p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('private','public') and p.prokind='f' and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e') order by n.nspname,p.proname loop
    definition := pre_admin.remap(pg_get_functiondef(f.oid)); execute definition;
    definition := pre_admin.remap(f.oid::regprocedure::text);
    execute format('revoke all on function %s from public, anon, authenticated, service_role',definition);
    for grant_row in select * from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) where grantee<>f.proowner loop
      role_name := case when grant_row.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(grant_row.grantee)) end;
      execute format('grant execute on function %s to %s%s',definition,role_name,case when grant_row.is_grantable then ' with grant option' else '' end);
    end loop;
  end loop;
  for t in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r'
    and not exists(select 1 from pg_depend d where d.objid=c.oid and d.deptype='e') order by 1 loop
    dst := case when t.nspname='public' then 'pre' else 'pre_private' end;
    for x in select conname,pg_get_constraintdef(oid) def from pg_constraint where conrelid=t.oid and contype='f' loop
      execute format('alter table %I.%I add constraint %I %s',dst,t.relname,x.conname,pre_admin.remap(x.def));
    end loop;
    for x in select polname,polpermissive,polcmd,polroles,pg_get_expr(polqual,polrelid) qual,pg_get_expr(polwithcheck,polrelid) chk from pg_policy where polrelid=t.oid loop
      select string_agg(case when r=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(r)) end,',') into roles_sql from unnest(x.polroles) r;
      execute format('create policy %I on %I.%I as %s for %s to %s%s%s',x.polname,dst,t.relname,
        case when x.polpermissive then 'permissive' else 'restrictive' end,
        case x.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end,roles_sql,
        case when x.qual is null then '' else ' using ('||pre_admin.remap(x.qual)||')' end,
        case when x.chk is null then '' else ' with check ('||pre_admin.remap(x.chk)||')' end);
    end loop;
    for x in select pg_get_triggerdef(oid) def from pg_trigger where tgrelid=t.oid and not tgisinternal loop execute pre_admin.remap(x.def); end loop;
  end loop;
  perform pg_notify('pgrst','reload schema');
  return jsonb_build_object('dryRun',false,'tables',report,'backupId',backup_id);
end;
$$;
-- Restore a registered full schema+data backup. The current PRE becomes another backup.
create function pre_admin.restore(restore_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare prior pre_admin.backups; saved_id uuid := gen_random_uuid(); saved_public text; saved_private text;
begin
  perform pg_advisory_xact_lock(172017,1);
    if exists(select 1 from pg_depend d join pg_class c on d.refclassid='pg_class'::regclass and d.refobjid=c.oid
      join pg_namespace n on n.oid=c.relnamespace join pg_rewrite rw on d.classid='pg_rewrite'::regclass and d.objid=rw.oid
      join pg_class v on v.oid=rw.ev_class join pg_namespace vn on vn.oid=v.relnamespace
      where n.nspname in ('pre','pre_private') and vn.nspname not in ('pre','pre_private'))
      or exists(select 1 from pg_constraint k join pg_class c on c.oid=k.confrelid join pg_namespace n on n.oid=c.relnamespace
      join pg_class r on r.oid=k.conrelid join pg_namespace rn on rn.oid=r.relnamespace
      where k.contype='f' and n.nspname in ('pre','pre_private') and rn.nspname not in ('pre','pre_private')) then
      raise exception 'External dependencies reference PRE; refusing replacement';
    end if;
  select * into prior from pre_admin.backups where id=restore_id for update;
  if prior.id is null or prior.restored_at is not null or to_regnamespace(prior.public_schema) is null
    or to_regnamespace(prior.private_schema) is null then raise exception 'Backup unavailable'; end if;
  saved_public := 'pre_backup_'||replace(saved_id::text,'-','');
  saved_private := 'pre_private_backup_'||replace(saved_id::text,'-','');
  execute format('alter schema pre rename to %I',saved_public);
  execute format('alter schema pre_private rename to %I',saved_private);
  execute format('revoke all on schema %I,%I from public,anon,authenticated,service_role',saved_public,saved_private);
  insert into pre_admin.backups(id,public_schema,private_schema) values(saved_id,saved_public,saved_private);
  execute format('alter schema %I rename to pre',prior.public_schema);
  execute format('alter schema %I rename to pre_private',prior.private_schema);
  execute 'grant usage on schema pre to anon,authenticated,service_role';
  execute 'grant usage on schema pre_private to authenticated,service_role';
  update pre_admin.backups set restored_at=now() where id=restore_id;
  perform pg_notify('pgrst','reload schema');
  return jsonb_build_object('restored',restore_id,'backupId',saved_id);
end;
$$;
revoke all on all functions in schema pre_admin from public, anon, authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'revoke all on schema pre_admin from service_role';
    execute 'revoke all on all functions in schema pre_admin from service_role';
  end if;
end $$;
