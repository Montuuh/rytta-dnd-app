import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// Uses a separately installed, version-verified Supabase CLI. No shell interpolation.
const result = spawnSync('supabase', ['gen', 'types', 'typescript', '--local'], {
  encoding: 'utf8',
  shell: false,
})
if (result.error || result.status !== 0 || !result.stdout.includes('export type Database')) {
  console.error(
    'Could not generate types. Install the Supabase CLI and start the local stack first.',
  )
  process.exitCode = 1
} else {
  writeFileSync('src/shared/api/database.types.ts', result.stdout)
  console.log('Database types generated from local Supabase.')
}
