// Content from books the owner bought stays out of the repository: nothing under content-private/
// is ever tracked, and the folder stays ignored.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const folder = 'content-private'
const tracked = spawnSync('git', ['ls-files', '--', folder], { encoding: 'utf8', shell: false })
if (tracked.error || tracked.status !== 0) {
  console.error('Could not list tracked files.')
  process.exit(1)
}
const files = tracked.stdout.split('\n').filter(Boolean)
const ignored = readFileSync('.gitignore', 'utf8')
  .split(/\r?\n/)
  .some((line) => line.trim() === `${folder}/`)
if (files.length > 0 || !ignored) {
  if (files.length > 0) console.error(`Tracked files under ${folder}/: ${files.join(', ')}`)
  if (!ignored) console.error(`.gitignore no longer ignores ${folder}/`)
  process.exit(1)
}
console.log('Private content stays out of the repository.')
