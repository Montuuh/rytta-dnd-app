// Builds the bilingual basic-items catalogue (RYT-103) from the reviewed rows in ./data.
// Rules text, names, weights and costs come from the "Equipment" chapter of the System Reference
// Document 5.2.1 by Wizards of the Coast LLC (English and official Spanish editions), licensed
// under CC-BY-4.0: https://creativecommons.org/licenses/by/4.0/legalcode.
// Usage: node scripts/items/build-basic-items.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { armor } from './data/armor.mjs'
import { food } from './data/food.mjs'
import { gear } from './data/gear.mjs'
import { homebrew } from './data/homebrew.mjs'
import { tools } from './data/tools.mjs'
import { weapons } from './data/weapons.mjs'

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../tests/fixtures/srd/items',
)
const attribution =
  'Entries with source "srd" adapt the System Reference Document 5.2.1 by Wizards of the Coast LLC ' +
  '(English and Spanish editions), licensed under CC-BY-4.0: ' +
  'https://creativecommons.org/licenses/by/4.0/legalcode. Entries and descriptions marked "rytta" ' +
  'are original to this project.'

const rows = [...armor, ...weapons, ...gear, ...tools, ...food, ...homebrew]
const seen = new Set()
const items = []
const descriptions = { en: {}, es: {} }
for (const row of rows) {
  if (seen.has(row.key)) throw new Error(`Duplicate key ${row.key}`)
  seen.add(row.key)
  for (const language of ['en', 'es']) {
    const text = row.description[language]
    if (!text || text.length > 700) throw new Error(`Description ${row.key}.${language}`)
    descriptions[language][row.key] = text
  }
  if (!Number.isInteger(row.costCp)) throw new Error(`Cost ${row.key}`)
  items.push({
    key: row.key,
    source: row.source ?? 'srd',
    name: row.name,
    descriptionSource: row.descriptionSource ?? 'srd',
    category: row.category,
    icon: row.icon,
    slot_kind: row.slot_kind ?? 'none',
    weightLb: row.weightLb,
    costCp: row.costCp,
    properties: row.properties ?? {},
    ...(row.pack ? { pack: row.pack } : {}),
  })
}

const write = (name, value) =>
  writeFile(path.join(outDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
await mkdir(outDir, { recursive: true })
await write('basic-items.json', { attribution, items })
await write('basic-items.en.json', descriptions.en)
await write('basic-items.es.json', descriptions.es)
console.log(`Wrote ${items.length} basic items.`)
