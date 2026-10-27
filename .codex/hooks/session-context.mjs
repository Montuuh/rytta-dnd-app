import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const backlog = JSON.parse(readFileSync(new URL('docs/backlog/items.json', root), 'utf8'))
const active = backlog.items.filter((item) =>
  ['ready', 'in_progress', 'review', 'blocked'].includes(item.status),
)
const context = `Rytta workspace: ${fileURLToPath(root)}. Read AGENTS.md and docs/ai-workflow.md. Current delivery queue: ${active.map((item) => `${item.id}: ${item.status} - ${item.title}`).join('; ')}. Check git status before editing. Do not infer authorization to publish or migrate production. After interface changes, invoke the user-authorized ui-ux reviewer and record its verdict per docs/ui-review.md. This hook is context only; CI enforces checks.`
console.log(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
  }),
)
