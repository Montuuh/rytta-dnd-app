/**
 * RYT-054 encounter builder: the SRD 5.2.1 "Combat Encounters" method (Gameplay Toolbox, pages
 * 201–202, CC-BY-4.0). A party has an XP budget per difficulty (the sum of each character's row of
 * "XP Budget per Character"); an encounter spends the XP of its creatures without going over. The
 * troubleshooting advice becomes notes. Everything here is presentation: the server stores only
 * the combatants the DM adds.
 */

export const difficultyLevels = ['low', 'moderate', 'high'] as const
export type DifficultyLevel = (typeof difficultyLevels)[number]
/** Where the spent XP lands: within the Low, Moderate or High budget, or over the High one. */
export type DifficultyBand = 'none' | DifficultyLevel | 'aboveHigh'
export type Budget = Record<DifficultyLevel, number>

/** SRD 5.2.1 "XP Budget per Character" (CC-BY-4.0): Low, Moderate and High for levels 1–20. */
const budgetPerCharacter: readonly (readonly [number, number, number])[] = [
  [50, 75, 100],
  [100, 150, 200],
  [150, 225, 400],
  [250, 375, 500],
  [500, 750, 1100],
  [600, 1000, 1400],
  [750, 1300, 1700],
  [1000, 1700, 2100],
  [1300, 2000, 2600],
  [1600, 2300, 3100],
  [1900, 2900, 4100],
  [2200, 3700, 4700],
  [2600, 4200, 5400],
  [2900, 4900, 6200],
  [3300, 5400, 7800],
  [3800, 6100, 9800],
  [4500, 7200, 11700],
  [5000, 8700, 14200],
  [5500, 10700, 17200],
  [6400, 13200, 22000],
]

const clampLevel = (level: number) => Math.max(1, Math.min(20, Math.trunc(level) || 1))

export function characterBudget(level: number): Budget {
  const [low, moderate, high] = budgetPerCharacter[clampLevel(level) - 1]!
  return { low, moderate, high }
}

/** Mixed levels add up character by character (the SRD multiplies one row by the party size). */
export function partyBudget(levels: readonly number[]): Budget {
  return levels.reduce<Budget>(
    (sum, level) => {
      const row = characterBudget(level)
      return {
        low: sum.low + row.low,
        moderate: sum.moderate + row.moderate,
        high: sum.high + row.high,
      }
    },
    { low: 0, moderate: 0, high: 0 },
  )
}

/** "Spend as much of your XP budget as you can without going over": the smallest budget that holds it. */
export function difficultyBand(xp: number, budget: Budget): DifficultyBand {
  if (xp <= 0) return 'none'
  if (xp <= budget.low) return 'low'
  if (xp <= budget.moderate) return 'moderate'
  if (xp <= budget.high) return 'high'
  return 'aboveHigh'
}

/** The XP still free inside the band's budget, or over the High budget (negative). */
export function bandRoom(xp: number, budget: Budget): number {
  const band = difficultyBand(xp, budget)
  if (band === 'none') return budget.low
  if (band === 'aboveHigh') return budget.high - xp
  return budget[band] - xp
}

/** A challenge rating ("1/4", "5") as a number. */
export function crNumber(cr: string): number {
  const [a, b] = cr.split('/')
  return b ? Number(a) / Number(b) : Number(cr)
}

export type BalanceMember = {
  id: string
  name: string
  /** The sheet's level; null when the character has no sheet yet (counted as level 1). */
  level: number | null
  classLabel?: string | null
}

/** One combatant of the draft as the builder sees it (resolved by the UI from the bestiary). */
export type BalanceCreature = {
  /** Groups identical creatures: `srd:<id>`, `hb:<template>` or the typed name. */
  key: string
  name: string
  side: 'enemy' | 'ally'
  /** Null for creatures typed in by hand without a bestiary origin. */
  cr: string | null
  /** The XP it is worth here (the lair value when the fight has a lair); null when unrated. */
  xp: number | null
  hidden?: boolean
  swarm?: boolean
  /** The creature type, when it comes from the bestiary. */
  type?: string | null
}

export type BalanceGroup = {
  key: string
  name: string
  cr: string | null
  count: number
  hidden: number
  xpEach: number | null
  xp: number
  /** Why the group spends no budget: allies fight for the party; unrated creatures have no XP. */
  excluded: 'ally' | 'unrated' | null
}

export type BalanceNote =
  | { kind: 'many'; creatures: number; party: number; lowLevel: boolean }
  | { kind: 'statBlocks'; count: number }
  | { kind: 'powerful'; names: string[]; level: number }
  | { kind: 'cr0'; names: string[] }

export type Balance = {
  budget: Budget
  party: number
  /** The party's level for the SRD's comparisons: the rounded average. */
  level: number
  /** Characters without a sheet, counted as level 1. */
  assumed: string[]
  xp: number
  band: DifficultyBand
  room: number
  enemies: number
  /** The most common type among the rated enemies: suggestions start from it. */
  mainType: string | null
  groups: BalanceGroup[]
  notes: BalanceNote[]
}

export function encounterBalance(
  party: readonly BalanceMember[],
  creatures: readonly BalanceCreature[],
): Balance {
  const levels = party.map((m) => m.level ?? 1)
  const budget = partyBudget(levels)
  const level = levels.length
    ? Math.round(levels.reduce((s, l) => s + clampLevel(l), 0) / levels.length)
    : 0
  const groups = new Map<string, BalanceGroup>()
  for (const c of creatures) {
    const key = `${c.side}:${c.key}`
    const excluded = c.side === 'ally' ? 'ally' : c.xp === null ? 'unrated' : null
    const group = groups.get(key) ?? {
      key,
      name: c.name,
      cr: c.cr,
      count: 0,
      hidden: 0,
      xpEach: c.xp,
      xp: 0,
      excluded,
    }
    group.count += 1
    if (c.hidden) group.hidden += 1
    if (!excluded) group.xp += c.xp ?? 0
    groups.set(key, group)
  }
  const list = [...groups.values()].sort(
    (a, b) =>
      Number(a.excluded !== null) - Number(b.excluded !== null) ||
      b.xp - a.xp ||
      a.name.localeCompare(b.name),
  )
  const xp = list.reduce((s, g) => s + g.xp, 0)
  const enemyList = creatures.filter((c) => c.side === 'enemy')
  const notes: BalanceNote[] = []
  if (party.length > 0 && enemyList.length > 2 * party.length)
    notes.push({
      kind: 'many',
      creatures: enemyList.length,
      party: party.length,
      lowLevel: level <= 2,
    })
  // Stat blocks the DM has to run: every distinct creature of either side.
  const blocks = new Set(creatures.map((c) => c.key))
  if (blocks.size > 3) notes.push({ kind: 'statBlocks', count: blocks.size })
  if (party.length > 0) {
    const strong = unique(
      enemyList.filter((c) => c.cr !== null && crNumber(c.cr) > level).map((c) => c.name),
    )
    if (strong.length) notes.push({ kind: 'powerful', names: strong, level })
  }
  const critters = enemyList.filter((c) => c.cr === '0' && !c.swarm)
  if (critters.length > 3) notes.push({ kind: 'cr0', names: unique(critters.map((c) => c.name)) })
  return {
    budget,
    party: party.length,
    level,
    assumed: party.filter((m) => m.level === null).map((m) => m.name),
    xp,
    band: difficultyBand(xp, budget),
    room: bandRoom(xp, budget),
    enemies: enemyList.length,
    mainType: mostCommon(enemyList.filter((c) => c.xp !== null).map((c) => c.type ?? null)),
    groups: list,
    notes,
  }
}

const unique = (names: string[]) => [...new Set(names)]

function mostCommon(values: (string | null)[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | null = null
  for (const [v, n] of counts) if (best === null || n > counts.get(best)!) best = v
  return best
}

/** A creature the suggestions may use (an SRD creature or a campaign creature with a CR). */
export type SuggestionCreature = {
  key: string
  name: string
  cr: string
  xp: number
  type: string | null
  swarm?: boolean
}

export type Suggestion = {
  key: string
  xp: number
  groups: { creature: SuggestionCreature; count: number }[]
}

export type SuggestionRequest = {
  pool: readonly SuggestionCreature[]
  /** XP left before the chosen budget. */
  remaining: number
  party: number
  level: number
  /** Enemies already in the draft (they count toward two creatures per character). */
  enemies: number
  kinds: 1 | 2
  type?: string | null
}

/** How many more creatures fit the SRD's "two creatures per character" advice. */
export const creatureRoom = (party: number, enemies: number) => Math.max(0, 2 * party - enemies)

/**
 * Every good build that spends the XP left without going over, following the SRD's advice: no
 * creature above the party's level, no lone CR 0 critters, at most two creatures per character
 * (counting the enemies already in the draft) and one or two stat blocks. Two kinds are one leader
 * with at least two lower-XP creatures of the same type. The fullest builds come first.
 */
export function suggestionCandidates(request: SuggestionRequest): Suggestion[] {
  const { remaining, kinds, type } = request
  const cap = creatureRoom(request.party, request.enemies)
  if (remaining <= 0 || request.party <= 0 || cap < 1) return []
  const pool = request.pool.filter(
    (c) =>
      c.xp > 0 &&
      c.xp <= remaining &&
      crNumber(c.cr) <= Math.max(1, request.level) &&
      (!type || c.type === type) &&
      !(c.cr === '0' && !c.swarm),
  )
  const found = new Map<string, Suggestion>()
  const add = (groups: Suggestion['groups']) => {
    const xp = groups.reduce((s, g) => s + g.creature.xp * g.count, 0)
    if (xp <= 0 || xp > remaining) return
    const key = groups
      .map((g) => `${g.count}x${g.creature.key}`)
      .sort()
      .join('+')
    if (!found.has(key)) found.set(key, { key, xp, groups })
  }
  for (const lead of pool) {
    if (kinds === 1) {
      const most = Math.min(cap, Math.floor(remaining / lead.xp))
      if (most >= 1) add([{ creature: lead, count: most }])
      continue
    }
    if (cap < 3) continue
    for (const second of pool) {
      if (second.key === lead.key || second.xp >= lead.xp) continue
      if (!type && lead.type !== second.type) continue
      const others = Math.min(cap - 1, Math.floor((remaining - lead.xp) / second.xp))
      if (others >= 2)
        add([
          { creature: lead, count: 1 },
          { creature: second, count: others },
        ])
    }
  }
  const ranked = [...found.values()].sort((a, b) => b.xp - a.xp || a.key.localeCompare(b.key))
  if (!ranked.length) return []
  // A tenth of the budget below the fullest build still counts as a good fit.
  const best = ranked[0]!.xp
  return ranked.filter((s) => s.xp >= Math.max(best - remaining * 0.1, best * 0.6))
}

export type PickedSuggestions = { ideas: Suggestion[]; fresh: number }

/**
 * Draws `count` ideas from the candidates, new ones first (compositions in `avoid` were already
 * shown) and with different leading creatures, so the set reads as different encounters.
 */
export function pickSuggestions(
  candidates: readonly Suggestion[],
  options: { avoid?: ReadonlySet<string>; count?: number; random?: () => number } = {},
): PickedSuggestions {
  const { avoid, count = 3, random = Math.random } = options
  const fresh = shuffle(
    candidates.filter((s) => !avoid?.has(s.key)),
    random,
  )
  const seen = shuffle(
    candidates.filter((s) => avoid?.has(s.key)),
    random,
  )
  const picked: Suggestion[] = []
  const leads = new Set<string>()
  // Different leading creatures first, so the set reads as different encounters.
  for (const s of fresh) {
    if (picked.length >= count) break
    const lead = s.groups[0]!.creature.key
    if (leads.has(lead)) continue
    leads.add(lead)
    picked.push(s)
  }
  for (const s of [...fresh, ...seen]) {
    if (picked.length >= count) break
    if (!picked.includes(s)) picked.push(s)
  }
  return {
    ideas: picked.sort((a, b) => b.xp - a.xp),
    fresh: picked.filter((s) => !avoid?.has(s.key)).length,
  }
}

/** Candidates and a pick in one call (tests and simple callers). */
export function suggestEncounters(
  request: SuggestionRequest & {
    avoid?: ReadonlySet<string>
    count?: number
    random?: () => number
  },
): Suggestion[] {
  return pickSuggestions(suggestionCandidates(request), request).ideas
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** A small deterministic generator for tests and repeatable sets. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}
