import { readFile, access } from 'node:fs/promises'

const backlog = JSON.parse(await readFile('docs/backlog/items.json', 'utf8'))
const ids = new Set(backlog.items.map((item) => item.id))
const allowed = ['planned', 'ready', 'in_progress', 'review', 'done', 'blocked']
if (ids.size !== backlog.items.length) throw new Error('Duplicate backlog ID')
for (const item of backlog.items) {
  if (
    !/^RYT-\d{3}$/.test(item.id) ||
    !allowed.includes(item.status) ||
    !item.title ||
    !item.owner ||
    !item.priority ||
    !item.scope ||
    !item.acceptance?.length ||
    !item.validation?.length ||
    !item.sources?.length ||
    !item.dependsOn
  )
    throw new Error(`Incomplete ticket: ${item.id}`)
  for (const dependency of item.dependsOn)
    if (!ids.has(dependency)) throw new Error(`Missing dependency ${dependency}`)
  if (item.status === 'done' && !item.evidence?.length)
    throw new Error(`Done without evidence: ${item.id}`)
  for (const file of item.evidence ?? []) await access(file)
}
function visit(id, ancestry = []) {
  if (ancestry.includes(id)) throw new Error(`Dependency cycle: ${[...ancestry, id].join(' -> ')}`)
  for (const dependency of backlog.items.find((item) => item.id === id).dependsOn)
    visit(dependency, [...ancestry, id])
}
for (const id of ids) visit(id)
for (const file of ['docs/README.md', 'docs/architecture.md', 'docs/security.md'])
  await access(file)
console.log(`Documentation contracts passed (${ids.size} tickets).`)
