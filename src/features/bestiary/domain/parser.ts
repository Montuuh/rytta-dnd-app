import { abilityModifier, averageDice, diceKey, parseDice } from './stats'
import { usageFromName } from './trackers'
import {
  abilityKeys,
  challengeRatings,
  type AbilityKey,
  type AbilityScore,
  type CreatureSize,
  type CreatureType,
  type DetailKey,
  type SectionKind,
  type StatBlock,
  type StatEntry,
  type StatSection,
} from './types'

/**
 * Turns a pasted stat block (English or Spanish; 2024 or 2014 layout) into a draft the DM reviews
 * before saving (ADR 028). It is a best effort: lines it cannot place are reported, nothing is
 * stored until the DM saves, and text is plain (never HTML).
 */
export type ParsedCreature = {
  block: StatBlock
  core: {
    ac: number | null
    hp: number | null
    initiative: number | null
    formula: string | null
    cr: string | null
    type: CreatureType | null
    size: CreatureSize | null
    legendary: number
  }
  /** Lines that could not be placed in any field or entry. */
  unplaced: string[]
}

const SIZE_WORDS: Record<string, CreatureSize> = {
  tiny: 'tiny',
  small: 'small',
  medium: 'medium',
  large: 'large',
  huge: 'huge',
  gargantuan: 'gargantuan',
  diminuto: 'tiny',
  diminuta: 'tiny',
  pequeño: 'small',
  pequeña: 'small',
  mediano: 'medium',
  mediana: 'medium',
  grande: 'large',
  enorme: 'huge',
  gargantuesco: 'gargantuan',
  gargantuesca: 'gargantuan',
}
const TYPE_WORDS: [RegExp, CreatureType][] = [
  [/\baberra(tion|ción)/i, 'aberration'],
  [/\bbeasts?\b|\bbestias?\b/i, 'beast'],
  [/\bcelestial/i, 'celestial'],
  [/\bconstruct|\baut[oó]mata/i, 'construct'],
  [/\bdrag(on|ón)\b/i, 'dragon'],
  [/\belemental/i, 'elemental'],
  [/\bfey\b|\bfe[eé]ric/i, 'fey'],
  [/\bfiend|\binfernal/i, 'fiend'],
  [/\bgiant|\bgigante/i, 'giant'],
  [/\bhumanoid/i, 'humanoid'],
  [/\bmonstrosit|\bmonstruosidad/i, 'monstrosity'],
  [/\booze|\bcieno/i, 'ooze'],
  [/\bplant|\bplanta/i, 'plant'],
  [/\bundead|\bmuertos? vivientes?/i, 'undead'],
]
const ABILITY_WORDS: Record<string, AbilityKey> = {
  str: 'str',
  dex: 'dex',
  con: 'con',
  int: 'int',
  wis: 'wis',
  cha: 'cha',
  fue: 'str',
  des: 'dex',
  sab: 'wis',
  car: 'cha',
}
const SECTION_WORDS: Record<string, SectionKind> = {
  traits: 'traits',
  atributos: 'traits',
  rasgos: 'traits',
  actions: 'actions',
  acciones: 'actions',
  'bonus actions': 'bonusActions',
  'acciones adicionales': 'bonusActions',
  'acciones bonus': 'bonusActions',
  reactions: 'reactions',
  reacciones: 'reactions',
  'legendary actions': 'legendaryActions',
  'acciones legendarias': 'legendaryActions',
}
type FieldKey = 'ac' | 'initiative' | 'hp' | 'speed' | 'cr' | 'saves' | DetailKey
const FIELD_PATTERNS: [RegExp, FieldKey][] = [
  [/^(?:armor class|armour class|clase de armadura|ac|ca)\b\s*:?\s*/i, 'ac'],
  [/^(?:initiative|iniciativa)\b\s*:?\s*/i, 'initiative'],
  [/^(?:hit points|puntos de golpe|hp|pg)\b\s*:?\s*/i, 'hp'],
  [/^(?:speed|velocidad)\b\s*:?\s*/i, 'speed'],
  [/^(?:saving throws|tiradas de salvación)\b\s*:?\s*/i, 'saves'],
  [/^(?:skills|habilidades)\b\s*:?\s*/i, 'skills'],
  [
    /^(?:damage vulnerabilities|vulnerabilities|vulnerabilidades(?: al daño)?)\b\s*:?\s*/i,
    'vulnerabilities',
  ],
  [/^(?:damage resistances|resistances|resistencias(?: al daño)?)\b\s*:?\s*/i, 'resistances'],
  [
    /^(?:damage immunities|condition immunities|immunities|inmunidades(?: al daño| a estados)?)\b\s*:?\s*/i,
    'immunities',
  ],
  [/^(?:gear|equipo)\b\s*:?\s*/i, 'gear'],
  [/^(?:senses|sentidos)\b\s*:?\s*/i, 'senses'],
  [/^(?:languages|idiomas)\b\s*:?\s*/i, 'languages'],
  [/^(?:challenge|desafío|cr|vd)\b\s*:?\s*/i, 'cr'],
]
const SPELL_LEAD =
  /^((?:at will|a voluntad|\d+\s*\/\s*(?:day|día)(?:\s+(?:each|cada uno))?)\s*:)\s*/i
const NUMBER = /[+−–-]?\d+/

const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'entry'

const toInt = (text: string | undefined) => {
  const m = text?.match(NUMBER)
  return m ? Number(m[0].replace(/[−–]/, '-')) : null
}

const joinLine = (a: string, b: string) => {
  if (!a) return b
  if (/[a-záéíóúñ]-$/i.test(a) && /^[a-záéíóúñ]/.test(b)) return a.slice(0, -1) + b
  return `${a} ${b}`
}

/** "Name. Text" or "Name (Recharge 5–6). Text" at the start of a line. */
function entryStart(line: string): { name: string; rest: string } | null {
  const m = line.match(/^([\p{Lu}][^.:!?,]{0,70}?(?:\s*\([^)]{1,60}\))?)\.\s+(\S.*)$/u)
  if (!m) return null
  const words = m[1]!
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
  if (words.length > 8) return null
  return { name: m[1]!.trim(), rest: m[2]! }
}

export function parseStatBlockText(source: string): ParsedCreature {
  const lines = source
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const unplaced: string[] = []
  const fields: Partial<Record<FieldKey, string>> = {}
  const abilities: Partial<Record<AbilityKey, AbilityScore>> = {}
  const sections: StatSection[] = []
  let name = ''
  let meta = ''
  let i = 0
  if (lines[0]) name = lines[i++]!
  if (
    lines[i] &&
    Object.keys(SIZE_WORDS).some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lines[i]!))
  )
    meta = lines[i++]!
  let field: FieldKey | null = null
  let section: StatSection | null = null
  let entry: (StatEntry & { open: string }) | null = null
  const flush = () => {
    if (!entry || !section) return
    if (entry.open) entry.text.push(entry.open)
    const { open: _, ...done } = entry
    section.entries.push(done)
    entry = null
  }
  const openSection = (kind: SectionKind) => {
    flush()
    section = sections.find((s) => s.kind === kind) ?? null
    if (!section) {
      section = { kind, entries: [] }
      sections.push(section)
    }
    field = null
  }
  // 2014 layout: "STR DEX CON INT WIS CHA" then "21 (+5) 9 (−1) …".
  let pendingHeader: AbilityKey[] | null = null
  for (; i < lines.length; i++) {
    const line = lines[i]!
    const heading = SECTION_WORDS[line.toLowerCase().replace(/[:.]$/, '')]
    if (heading) {
      openSection(heading)
      continue
    }
    if (!section) {
      const header = line.split(/\s+/).map((w) => ABILITY_WORDS[w.toLowerCase()])
      if (header.length === 6 && header.every(Boolean)) {
        pendingHeader = header as AbilityKey[]
        continue
      }
      const scores2014 = [...line.matchAll(/(\d+)\s*\(([+−–-]?\d+)\)/g)]
      if (pendingHeader && scores2014.length) {
        for (const m of scores2014) {
          const key = pendingHeader.shift()
          if (!key) break
          const score = Number(m[1])
          const mod = abilityModifier(score)
          abilities[key] = { score, mod, save: mod }
        }
        if (!pendingHeader.length) pendingHeader = null
        continue
      }
      const rows2024 = [
        ...line.matchAll(/\b([A-Za-z]{3})\s*:?\s*(\d{1,2})\s+([+−–-]\d+)\s+([+−–-]?\d+)/g),
        ...line.matchAll(/\b([A-Za-z]{3})\s*:?\s*(\d{1,2})\s*\(([+−–-]\d+)\)/g),
      ]
      const known = rows2024.filter((m) => ABILITY_WORDS[m[1]!.toLowerCase()])
      if (known.length) {
        for (const m of known) {
          const score = Number(m[2])
          const mod = abilityModifier(score)
          const save = m[4] !== undefined ? (toInt(m[4]) ?? mod) : mod
          abilities[ABILITY_WORDS[m[1]!.toLowerCase()]!] = { score, mod, save }
        }
        continue
      }
      if (/^(mod\.?\s+(save|salv\.?)\s*)+$/i.test(line)) continue
      const matched = FIELD_PATTERNS.find(([re]) => re.test(line))
      if (matched) {
        const [re, key] = matched
        const value = line.replace(re, '')
        if (key === 'ac') {
          // "AC 17 Initiative +7 (17)" in one line (2024).
          const [ac, init] = value.split(/\s+(?:initiative|iniciativa)\s*:?\s*/i)
          fields.ac = ac!.trim()
          if (init) fields.initiative = init.trim()
        } else if (key === 'immunities' && fields.immunities) {
          fields.immunities = `${fields.immunities}; ${value}`
        } else fields[key] = value
        field = key
        continue
      }
      // Once the challenge line is read, entries before any heading are traits (2014).
      if (fields.cr && entryStart(line)) {
        openSection('traits')
      } else if (field && field !== 'cr') {
        fields[field] = joinLine(fields[field] ?? '', line)
        continue
      } else {
        unplaced.push(line)
        continue
      }
    }
    const current = section as StatSection | null
    if (!current) continue
    const start = entryStart(line)
    const previous = entry as (StatEntry & { open: string }) | null
    // A finished sentence or a spell list ("**1/Day Each:** …") closes the previous entry.
    const last = previous ? previous.open || previous.text.at(-1) || '.' : '.'
    const closed = !previous || /[.:)”"]$/.test(last) || /^\*\*[^*]+:\*\*/.test(last)
    if (current.kind === 'legendaryActions' && !previous && !start) {
      current.intro = joinLine(current.intro ?? '', line)
      continue
    }
    if (start && closed) {
      flush()
      const usage = usageFromName(start.name)
      entry = {
        key: '',
        name: start.name,
        text: [],
        open: start.rest,
        ...(usage.recharge || usage.perDay ? { usage } : {}),
      }
      continue
    }
    if (!previous) {
      if (current.kind === 'legendaryActions') current.intro = joinLine(current.intro ?? '', line)
      else unplaced.push(line)
      continue
    }
    const lead = line.match(SPELL_LEAD)
    if (lead) {
      if (previous.open) previous.text.push(previous.open)
      previous.open = `**${lead[1]!.trim()}** ${line.slice(lead[0].length)}`
      continue
    }
    previous.open = joinLine(previous.open, line)
  }
  flush()

  // Unique entry keys within the stat block.
  const used = new Set<string>()
  for (const s of sections)
    for (const e of s.entries) {
      let key = slugify(e.name)
      for (let n = 2; used.has(key); n++) key = `${slugify(e.name)}-${n}`
      used.add(key)
      e.key = key
    }
  // 2014 saving throws: "Dex +5, Con +9".
  for (const m of (fields.saves ?? '').matchAll(/([A-Za-z]{3})\w*\s*([+−–-]\d+)/g)) {
    const key = ABILITY_WORDS[m[1]!.toLowerCase()]
    if (key && abilities[key]) abilities[key]!.save = toInt(m[2]) ?? abilities[key]!.save
  }
  const hpText = fields.hp ?? ''
  const dice = parseDice(hpText.match(/\(([^)]*)\)/)?.[1] ?? '')
  const hp = toInt(hpText) ?? (dice ? averageDice(dice) : null)
  const initiative = toInt(fields.initiative) ?? (abilities.dex ? abilities.dex.mod : null)
  const crToken = fields.cr?.match(/^\s*(\d+(?:\/\d+)?)/)?.[1] ?? null
  const cr = crToken && (challengeRatings as readonly string[]).includes(crToken) ? crToken : null
  const head = meta.split(',')[0] ?? ''
  const size =
    Object.entries(SIZE_WORDS).find(([w]) => new RegExp(`\\b${w}\\b`, 'i').test(head))?.[1] ?? null
  const type = TYPE_WORDS.find(([re]) => re.test(head))?.[1]
  const legendaryIntro = sections.find((s) => s.kind === 'legendaryActions')?.intro
  const legendary = legendaryIntro ? Math.min(9, toInt(legendaryIntro) ?? 3) : 0
  const details: StatBlock['details'] = {}
  for (const key of [
    'skills',
    'resistances',
    'vulnerabilities',
    'immunities',
    'gear',
    'senses',
    'languages',
  ] as const)
    if (fields[key]) details[key] = fields[key]!.slice(0, 600)
  const block: StatBlock = {
    name: (name || '?').slice(0, 120),
    meta: meta.slice(0, 200),
    ac: (fields.ac ?? '').slice(0, 80),
    initiative: (
      fields.initiative ?? (initiative !== null ? `${initiative >= 0 ? '+' : ''}${initiative}` : '')
    ).slice(0, 40),
    hp: hpText.slice(0, 80),
    ...(dice ? { hpFormula: diceKey(dice) } : {}),
    speed: (fields.speed ?? '').slice(0, 200),
    abilities: Object.fromEntries(
      abilityKeys.filter((k) => abilities[k]).map((k) => [k, abilities[k]!]),
    ),
    details,
    cr: (fields.cr ?? '').slice(0, 80),
    sections: sections.slice(0, 6).map((s) => ({
      ...s,
      entries: s.entries.slice(0, 40).map((e) => ({ ...e, text: e.text.slice(0, 12) })),
    })),
  }
  return {
    block,
    core: {
      ac: toInt(fields.ac),
      hp,
      initiative,
      formula: dice ? diceKey(dice) : null,
      cr,
      type: type ?? null,
      size,
      legendary,
    },
    unplaced,
  }
}

const SECTION_TITLES: Record<SectionKind, { en: string; es: string }> = {
  traits: { en: 'Traits', es: 'Atributos' },
  actions: { en: 'Actions', es: 'Acciones' },
  bonusActions: { en: 'Bonus Actions', es: 'Acciones adicionales' },
  reactions: { en: 'Reactions', es: 'Reacciones' },
  legendaryActions: { en: 'Legendary Actions', es: 'Acciones legendarias' },
}

/** Plain text of a stat block in its own language (copy, share and the parser round trip). */
export function statBlockToText(block: StatBlock, language: 'en' | 'es'): string {
  const strip = (t: string) => t.replace(/\*+/g, '')
  const label = (en: string, es: string) => (language === 'es' ? es : en)
  const lines = [block.name, block.meta]
  lines.push(
    `${label('AC', 'CA')} ${block.ac} ${label('Initiative', 'Iniciativa')} ${block.initiative}`,
  )
  lines.push(`${label('HP', 'PG')} ${block.hp}`, `${label('Speed', 'Velocidad')} ${block.speed}`)
  const names: Record<AbilityKey, string> =
    language === 'es'
      ? { str: 'Fue', dex: 'Des', con: 'Con', int: 'Int', wis: 'Sab', cha: 'Car' }
      : { str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha' }
  const sign = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`)
  const row = (keys: AbilityKey[]) =>
    keys
      .filter((k) => block.abilities[k])
      .map(
        (k) =>
          `${names[k]} ${block.abilities[k]!.score} ${sign(block.abilities[k]!.mod)} ${sign(block.abilities[k]!.save)}`,
      )
      .join(' ')
  lines.push(row(['str', 'dex', 'con']), row(['int', 'wis', 'cha']))
  const detailLabels: Record<DetailKey, [string, string]> = {
    skills: ['Skills', 'Habilidades'],
    resistances: ['Resistances', 'Resistencias'],
    vulnerabilities: ['Vulnerabilities', 'Vulnerabilidades'],
    immunities: ['Immunities', 'Inmunidades'],
    gear: ['Gear', 'Equipo'],
    senses: ['Senses', 'Sentidos'],
    languages: ['Languages', 'Idiomas'],
  }
  for (const [key, [en, es]] of Object.entries(detailLabels) as [DetailKey, [string, string]][])
    if (block.details[key]) lines.push(`${label(en, es)} ${strip(block.details[key]!)}`)
  lines.push(`${label('CR', 'VD')} ${block.cr}`)
  for (const s of block.sections) {
    lines.push(SECTION_TITLES[s.kind][language])
    if (s.intro) lines.push(strip(s.intro))
    for (const e of s.entries) {
      const [first, ...rest] = e.text.map(strip)
      lines.push(`${e.name}. ${first ?? ''}`.trim(), ...rest)
    }
  }
  return lines.filter(Boolean).join('\n')
}
