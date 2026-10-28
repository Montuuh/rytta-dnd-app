-- Run only after PRE exists. Keep the previous role override if one is configured.
do $$
declare exposed text;
begin
  if exists(select 1 from pg_roles where rolname='authenticator') and to_regnamespace('pre') is not null then
    select substring(setting from length('pgrst.db_schemas=')+1) into exposed
      from pg_roles r,lateral unnest(r.rolconfig) setting where r.rolname='authenticator' and setting like 'pgrst.db_schemas=%';
    if exposed is null then
      exposed := 'public';
      if to_regnamespace('graphql_public') is not null then exposed := exposed || ',graphql_public'; end if;
    end if;
    if not ('pre'=any(string_to_array(replace(exposed,' ',''),','))) then exposed := exposed || ',pre'; end if;
    execute format('alter role authenticator set pgrst.db_schemas = %L',exposed);
    perform pg_notify('pgrst','reload config');
    perform pg_notify('pgrst','reload schema');
  end if;
end $$;
