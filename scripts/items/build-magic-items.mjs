// Builds the magic items of the base pack (RYT-176) from the raw extraction of the "Magic Items
// A–Z" section of the System Reference Document 5.2.1 by Wizards of the Coast LLC (English and
// official Spanish editions), licensed under CC-BY-4.0:
// https://creativecommons.org/licenses/by/4.0/legalcode.
// Usage: node scripts/items/build-magic-items.mjs <raw-dir>   (see README.md)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { magicItemNames } from './data/magic-item-names.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.join(here, '../../tests/fixtures/srd/items')
const rawDir = process.argv[2]
if (!rawDir) throw new Error('Usage: node scripts/items/build-magic-items.mjs <raw-dir>')
const load = (language) =>
  JSON.parse(readFileSync(path.join(rawDir, `magic-items.${language}.json`), 'utf8'))
const mundane = JSON.parse(readFileSync(path.join(fixtures, 'basic-items.json'), 'utf8')).items
const descriptionLimit = 10000

// "Magic Item Rarities and Values" (SRD 5.2.1, page 206), in copper pieces. An artifact has no
// price. A potion is worth half; ten pieces of magic ammunition are worth one potion.
const valueCp = {
  common: 10_000,
  uncommon: 40_000,
  rare: 400_000,
  very_rare: 4_000_000,
  legendary: 20_000_000,
  artifact: 0,
}
const rarityWords = [
  ['very_rare', /very rare/i, /muy rar[oa]/i],
  ['uncommon', /uncommon/i, /infrecuente/i],
  ['common', /common/i, /común/i],
  ['rare', /rare/i, /rar[oa]/i],
  ['legendary', /legendary/i, /legendari[oa]/i],
  ['artifact', /artifact/i, /artefacto/i],
]
const rarityOf = (text) => rarityWords.find(([, english]) => english.test(text))?.[0]
// Items whose rarity depends on the variant named in their text enter once, with the lowest
// rarity the text lists and no price.
const lowestRarity = {
  'Belt of Giant Strength': 'rare',
  'Feather Token': 'uncommon',
  'Figurine of Wondrous Power': 'uncommon',
  'Horn of Valhalla': 'rare',
  'Ioun Stone': 'rare',
  'Potion of Giant Strength': 'uncommon',
  'Potions of Healing': 'common',
  'Spell Scroll': 'common',
}

const camel = (name) =>
  name
    .replace(/[’']/g, '')
    .replace(/\+/g, ' Plus')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word, at) =>
      at === 0 ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('')
const entryKeyOf = (key) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

const wornSlots = [
  [/^(Helm|Hat|Circlet|Headband|Goggles|Eyes) /, 'head', 'crown'],
  [/^(Amulet|Necklace|Periapt|Medallion|Scarab) /, 'neck', 'medal'],
  [/^(Cloak|Cape|Mantle|Wings) /, 'cloak', 'shirt'],
  [/^Robe /, 'body', 'shirt'],
  [/^(Gloves|Gauntlets|Bracers) /, 'hands', 'hand'],
  [/^Belt /, 'belt', 'ribbon'],
  [/(^(Boots|Slippers) | Boots$)/, 'feet', 'footprints'],
]

/** Category, slot, icon and the mundane item a magic item is made from, when it names one. */
function mechanics(heading, subtitle) {
  const kind = subtitle.match(/^[A-Za-z ]+?(?=,| \()/)?.[0]
  const inside = subtitle.match(/^[A-Za-z ]+ \(([^)]*)\)/)?.[1] ?? ''
  const base = mundane.find((item) => item.name.en === inside)
  const made = (category, slot, icon) =>
    base
      ? {
          category: base.category,
          slot_kind: base.slot_kind,
          icon: base.icon,
          weightLb: base.weightLb,
          properties: base.properties,
          baseCostCp: base.costCp,
        }
      : { category, slot_kind: slot, icon, weightLb: 0, properties: {}, baseCostCp: 0 }
  switch (kind) {
    case 'Armor':
      return made('armor', 'none', 'shirt')
    case 'Weapon':
      return /ammunition/i.test(inside)
        ? { ...made('ammo', 'none', 'feather'), consumable: 20 }
        : made('weapon', 'none', 'sword')
    case 'Potion':
      return { ...made('consumable', 'none', 'flask-conical'), consumable: 2 }
    case 'Scroll':
      return made('consumable', 'none', 'scroll')
    case 'Ring':
      return made('gear', 'ring', 'gem')
    case 'Rod':
    case 'Staff':
    case 'Wand':
      return made('gear', 'none', 'wand-sparkles')
    case 'Wondrous Item': {
      const worn = wornSlots.find(([pattern]) => pattern.test(heading))
      if (worn) return made('gear', worn[1], worn[2])
      return made('gear', 'none', /^(Manual|Tome) /.test(heading) ? 'book-open' : 'sparkles')
    }
    default:
      throw new Error(`Unknown kind in "${subtitle}" (${heading})`)
  }
}

/** "Uncommon (+1), Rare (+2), or Very Rare (+3)": one item per bonus. */
function bonuses(subtitle, language) {
  const word =
    language === 'en'
      ? /(Uncommon|Very Rare|Rare|Legendary) \(\+(\d)\)/g
      : /(infrecuente|muy rar[oa]|rar[oa]|legendari[oa]) \(\+(\d)\)/g
  const found = [...subtitle.matchAll(word)]
  if (found.length === 0) return null
  const lead = subtitle.slice(0, found[0].index).replace(/,\s*$/, '')
  const attunement = subtitle.match(
    /\((requires attunement|requiere sintonización)[^)]*\)\s*$/i,
  )?.[0]
  return found.map((match) => ({
    bonus: Number(match[2]),
    rarityWord: match[1],
    subtitle: `${lead}, ${match[1]}${attunement ? ` ${attunement}` : ''}`,
  }))
}

const english = new Map(load('en').map((item) => [item.heading, item]))
const spanish = new Map(load('es').map((item) => [item.heading, item]))
if (english.size !== magicItemNames.length || spanish.size !== magicItemNames.length)
  throw new Error(
    `The SRD has ${english.size}/${spanish.size} items; ${magicItemNames.length} are paired`,
  )

const taken = new Set(mundane.map((item) => item.key))
const entries = []
function add({ nameEn, nameEs, subtitleEn, subtitleEs, textEn, textEs, rarity, priced, heading }) {
  const key = camel(nameEn)
  if (!/^[a-z][A-Za-z0-9]{1,48}$/.test(key)) throw new Error(`Key ${key}`)
  if (taken.has(key)) throw new Error(`Duplicate key ${key}`)
  taken.add(key)
  const { baseCostCp, consumable, ...index } = mechanics(heading, subtitleEn)
  const value = priced ? valueCp[rarity] : 0
  const costCp = value === 0 ? 0 : Math.round(value / (consumable ?? 1)) + baseCostCp
  const description = { en: `${subtitleEn}\n\n${textEn}`, es: `${subtitleEs}\n\n${textEs}` }
  for (const language of ['en', 'es'])
    if (description[language].length > descriptionLimit)
      throw new Error(`Too long: ${key}.${language}`)
  if (nameEn.length > 100 || nameEs.length > 100) throw new Error(`Name ${key}`)
  entries.push({
    key: entryKeyOf(key),
    name_en: nameEn,
    name_es: nameEs,
    data: {
      index: { key, ...index, rarity, costCp },
      en: { description: description.en },
      es: { description: description.es },
    },
  })
}

for (const [headingEn, headingEs] of magicItemNames) {
  const en = english.get(headingEn)
  const es = spanish.get(headingEs)
  if (!en || !es) throw new Error(`Missing ${headingEn} / ${headingEs}`)
  const split = bonuses(en.subtitle, 'en')
  if (split) {
    const other = bonuses(es.subtitle, 'es')
    if (other?.length !== split.length) throw new Error(`Bonuses of ${headingEn}`)
    const baseEn = headingEn.replace(/,? \+1.*$/, '')
    const baseEs = headingEs.replace(/,? \+1.*$/, '')
    split.forEach((variant, at) =>
      add({
        heading: headingEn,
        nameEn: `${baseEn} +${variant.bonus}`,
        nameEs: `${baseEs} +${variant.bonus}`,
        subtitleEn: variant.subtitle,
        subtitleEs: other[at].subtitle,
        textEn: en.text,
        textEs: es.text,
        rarity: rarityOf(variant.rarityWord),
        priced: true,
      }),
    )
    continue
  }
  const varies = lowestRarity[headingEn]
  const tail = en.subtitle.replace(/^[A-Za-z ]+(\([^)]*\))?,/, '')
  const rarity = varies ?? rarityOf(tail)
  if (!rarity) throw new Error(`Rarity of ${headingEn}: ${en.subtitle}`)
  if (!varies && /varies|\), /i.test(tail)) throw new Error(`Rarity varies: ${headingEn}`)
  add({
    heading: headingEn,
    nameEn: headingEn,
    nameEs: headingEs,
    subtitleEn: en.subtitle,
    subtitleEs: es.subtitle,
    textEn: en.text,
    textEs: es.text,
    rarity,
    priced: !varies,
  })
}

writeFileSync(
  path.join(fixtures, 'magic-items.json'),
  `${JSON.stringify({ format: 'rytta-content', version: 1, kind: 'item', entries }, null, 1)}\n`,
)
const count = (pick) =>
  Object.entries(
    entries.reduce((sum, entry) => {
      const value = pick(entry.data.index)
      sum[value] = (sum[value] ?? 0) + 1
      return sum
    }, {}),
  )
    .map(([value, total]) => `${value} ${total}`)
    .join(', ')
const longest = Math.max(
  ...entries.flatMap((entry) => [
    entry.data.en.description.length,
    entry.data.es.description.length,
  ]),
)
console.log(`Wrote ${entries.length} magic items from ${magicItemNames.length} SRD headings.`)
console.log(`Rarity: ${count((index) => index.rarity)}`)
console.log(`Category: ${count((index) => index.category)}`)
console.log(`Slot: ${count((index) => index.slot_kind)}`)
console.log(`Longest description: ${longest} characters.`)
