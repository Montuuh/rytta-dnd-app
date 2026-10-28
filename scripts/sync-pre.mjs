import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { etlCommand, withExposureSql } from './lib/pre-etl.mts'

try {
  const command = etlCommand(process.argv.slice(2))
  const registry = JSON.parse(
    readFileSync(new URL('../supabase/environments.json', import.meta.url), 'utf8').replace(
      /^\uFEFF/,
      '',
    ),
  )
  if (
    registry.productionSchema !== 'public' ||
    registry.developmentSchema !== 'pre' ||
    registry.developmentPrivateSchema !== 'pre_private' ||
    !/^[a-z]{20}$/.test(registry.projectRef)
  )
    throw new Error('Unexpected environment registry; review it before running ETL.')
  const exposureSql = command.apply
    ? readFileSync(
        new URL('../supabase/maintenance/expose-pre.sql', import.meta.url),
        'utf8',
      ).replace(/^\uFEFF/, '')
    : ''
  const query = withExposureSql(command.query, exposureSql)
  if (command.printSql) {
    console.log(`-- Rytta project ${registry.projectRef}: ${command.operation}\n${query}`)
    process.exit(0)
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token)
    throw new Error(
      'Set SUPABASE_ACCESS_TOKEN in this terminal (Management API credential, never a VITE_ variable).',
    )
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${registry.projectRef}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(90000),
    },
  )
  if (!response.ok)
    throw new Error(
      `Supabase ETL failed (HTTP ${response.status}); inspect the query in Dashboard. No automatic retry was attempted.`,
    )
  const data = await response.json()
  const result = Array.isArray(data) ? data.at(-1)?.result : undefined
  if (
    !result ||
    typeof result !== 'object' ||
    (command.operation !== 'restore' && !Array.isArray(result.tables))
  )
    throw new Error(
      'Unexpected Management API result; inspect the database before repeating the operation.',
    )
  const report = {
    projectRef: registry.projectRef,
    operation: command.operation,
    createdAt: new Date().toISOString(),
    ...result,
  }
  const folder = fileURLToPath(new URL('../.tmp/pre-etl/', import.meta.url))
  mkdirSync(folder, { recursive: true })
  const path = `${folder}${Date.now()}-${command.operation}.json`
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify(report, null, 2))
  console.log(`Report saved: ${path}`)
  if (result.backupId)
    console.log(
      `Previous PRE retained as backup ${result.backupId}. Restore with: npm run pre:restore -- ${result.backupId}`,
    )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
