// SessionStart: fetch origin and tell the agent to pull before anything else when the
// current branch is behind. Never pulls, merges or writes the working tree itself.
import { execFileSync } from 'node:child_process'

const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    timeout: 8000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
let context
try {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  let fetched = true
  try {
    git('fetch', '--quiet', 'origin')
  } catch {
    fetched = false
  }
  const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')
  const [ahead, behind] = git('rev-list', '--left-right', '--count', `HEAD...${upstream}`)
    .split(/\s+/)
    .map(Number)
  const dirty = git('status', '--porcelain').length > 0
  context =
    behind > 0
      ? `GIT SYNC REQUIRED: ${branch} is ${behind} commit(s) behind ${upstream}${ahead ? ` and ${ahead} ahead` : ''}. Before reading tickets, planning or editing, run \`git pull --ff-only\`${dirty ? ' (the working tree has local changes: stash or back them up first and report it)' : ''}. Merged deliveries may already cover the requested work.`
      : `Git sync: ${branch} is up to date with ${upstream}${fetched ? '' : ' (fetch failed: offline, verify before relying on it)'}${ahead ? `; ${ahead} local commit(s) not pushed` : ''}.`
} catch {
  context =
    'Git sync: could not compare with the remote. Run `git fetch` and `git status` before any work.'
}
console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
  }),
)
