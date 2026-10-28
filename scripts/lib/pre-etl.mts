// No custom source, target or SQL arguments are accepted.
export function withExposureSql(query: string, exposureSql: string) {
  // A callback preserves PostgreSQL dollar quotes; string replacement expands $$ to $.
  return query.replace('commit;', () => `${exposureSql}\ncommit;`)
}

export function etlCommand(args: string[]) {
  const allowed = new Set(['--apply', '--replace-pre', '--restore', '--print-sql'])
  const flags = new Set()
  let restore: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!allowed.has(arg) || flags.has(arg))
      throw new Error('Use --apply [--replace-pre], or --apply --restore UUID.')
    flags.add(arg)
    if (arg === '--restore') {
      restore = args[++i]
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restore ?? ''))
        throw new Error('Restore requires a backup UUID.')
    }
  }
  const apply = flags.has('--apply')
  if (flags.has('--replace-pre') && !apply) throw new Error('--replace-pre requires --apply.')
  if (restore && (!apply || flags.has('--replace-pre')))
    throw new Error('Restore requires --apply and cannot combine with --replace-pre.')
  const expression = restore
    ? `pre_admin.restore('${restore}'::uuid)`
    : `pre_admin.refresh(${flags.has('--replace-pre')},${!apply})`
  return {
    apply,
    printSql: flags.has('--print-sql'),
    operation: restore ? 'restore' : apply ? 'refresh' : 'plan',
    query: `begin isolation level repeatable read${apply ? '' : ' read only'};
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select set_config('rytta.pre_report', (${expression})::text, false);
commit;
select current_setting('rytta.pre_report')::jsonb as result;`,
  }
}
