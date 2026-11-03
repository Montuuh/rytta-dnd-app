import { homebrewEntryId, type HomebrewEntry } from './homebrew'
import type {
  GlossaryLanguage,
  IndexRow,
  SpellClass,
  SpellSchool,
  SrdCategory,
  AbilityId,
} from './types'

export type GlossaryCategory = SrdCategory | 'lore' | 'other'

/** One searchable, linkable glossary entry: SRD (bundled) or campaign homebrew. */
export type GlossaryEntry = {
  id: string
  category: GlossaryCategory
  source: 'srd' | 'homebrew'
  edition: '2024' | '2014' | 'homebrew'
  name: string
  /** Name in the other language (SRD only), searchable and shown as a hint. */
  otherName: string | null
  aliases: string[]
  otherAliases: string[]
  autolink: boolean
  spell?: {
    level: number
    school: SpellSchool
    classes: SpellClass[]
    concentration: boolean
    ritual: boolean
  }
  ability?: AbilityId
  homebrew?: HomebrewEntry
}

export type Catalog = {
  language: GlossaryLanguage
  entries: GlossaryEntry[]
  byId: Map<string, GlossaryEntry>
  /** Homebrew house rules attached to an SRD entry (srd_ref). */
  houseRules: Map<string, HomebrewEntry[]>
}

const collator = (language: GlossaryLanguage) =>
  new Intl.Collator(language, { sensitivity: 'base', numeric: true })

export function buildCatalog(
  index: IndexRow[],
  language: GlossaryLanguage,
  homebrew: HomebrewEntry[] = [],
): Catalog {
  const entries: GlossaryEntry[] = index.map((row) => {
    const es = language === 'es'
    const entry: GlossaryEntry = {
      id: row.id,
      category: row.cat,
      source: 'srd',
      edition: row.ed ?? '2024',
      name: es ? row.es : row.en,
      otherName: es ? row.en : row.es,
      aliases: (es ? row.sa : row.ea) ?? [],
      otherAliases: (es ? row.ea : row.sa) ?? [],
      autolink: row.nl !== 1,
    }
    if (row.cat === 'spell' && row.lv !== undefined && row.sc && row.cl)
      entry.spell = {
        level: row.lv,
        school: row.sc,
        classes: row.cl,
        concentration: row.co === 1,
        ritual: row.ri === 1,
      }
    if (row.ab) entry.ability = row.ab
    return entry
  })
  const houseRules = new Map<string, HomebrewEntry[]>()
  for (const item of homebrew) {
    entries.push({
      id: homebrewEntryId(item.id),
      category: item.category,
      source: 'homebrew',
      edition: 'homebrew',
      name: item.name,
      otherName: null,
      aliases: item.aliases,
      otherAliases: [],
      autolink: true,
      homebrew: item,
    })
    if (item.srd_ref) houseRules.set(item.srd_ref, [...(houseRules.get(item.srd_ref) ?? []), item])
  }
  const compare = collator(language)
  entries.sort((a, b) => compare.compare(a.name, b.name) || a.id.localeCompare(b.id))
  return { language, entries, byId: new Map(entries.map((e) => [e.id, e])), houseRules }
}

/** First letter used to group the alphabetical index (accent-insensitive, "#" for others). */
export function indexLetter(name: string): string {
  const first = name.normalize('NFD')[0]?.toLocaleUpperCase() ?? '#'
  return /\p{L}/u.test(first) ? first : '#'
}

/** Ids of SRD entries for terms Rytta already renders from typed keys elsewhere in the app. */
export const glossaryIds = {
  condition: (key: string) => `condition.${key}`,
  ability: (key: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha') =>
    `ability.${({ str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' } as const)[key]}`,
  /** Character sheet skill keys are camelCase (animalHandling); glossary ids are kebab-case. */
  skill: (key: string) => `skill.${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
  damage: (key: string) => `damage.${key}`,
  property: (key: string) => `property.${key}`,
  rule: (key: string) => `rule.${key}`,
  action: (key: string) => `action.${key}`,
} as const
