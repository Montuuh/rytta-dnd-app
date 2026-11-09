import { describe, expect, it } from 'vitest'
import { describeHistory } from './history'
import {
  addLibraryFeature,
  removeFeature,
  removeTracker,
  restoreTracker,
  syncProgression,
  type LibraryFeature,
} from './progression'
import { blankDraft, quickDraft } from './quick'
import { classResources } from './resources'
import { emptyBuild } from './rules'
import { buildSchema, type HistoryItem } from './sheet'
import { classKeys } from './srd'

type Row = { id: string; cat: string; es: string; lv?: number; fc?: string; sb?: string }
// The bundled glossary index (RYT-071 class features), read as data through Vite.
const [index] = Object.values(
  import.meta.glob<Row[]>('../../glossary/content/index.json', { eager: true, import: 'default' }),
)
const library: LibraryFeature[] = index!
  .filter((row) => row.cat === 'feature')
  .map((row) => ({
    id: row.id,
    name: row.es,
    classKey: row.fc!,
    level: row.lv!,
    subclass: row.sb ?? null,
  }))
const names = { resource: (key: string) => `res:${key}` }
const monk = (level: number) =>
  syncProgression({ ...emptyBuild(), classKey: 'monk', classLabel: 'Monje' }, level, library, names)

describe('RYT-071 class resources and features', () => {
  it('links every resource to an existing glossary feature of its class', () => {
    const ids = new Map(library.map((row) => [row.id, row.classKey]))
    for (const spec of classResources) expect(ids.get(spec.feature), spec.key).toBe(spec.classKey)
    expect(new Set(classResources.map((spec) => spec.key)).size).toBe(classResources.length)
  })

  it('adds class features up to the level and resources from their first level', () => {
    const first = monk(1)
    expect(first.trackers).toEqual([])
    expect(first.features.map((f) => f.ref)).toEqual([
      'feature.monk-martial-arts',
      'feature.monk-unarmored-defense',
    ])
    const fifth = syncProgression(first, 5, library, names)
    expect(fifth.trackers.find((t) => t.key === 'monk-focus')).toMatchObject({
      id: 'class-monk-focus',
      max: 5,
      reset: 'short',
      display: 'pips',
    })
    expect(fifth.features.some((f) => f.ref === 'feature.monk-stunning-strike')).toBe(true)
    expect(fifth.features.every((f) => (f.level ?? 0) <= 5)).toBe(true)
    expect(buildSchema.safeParse(fifth).success).toBe(true)
    // Levelling down drops what the level no longer grants.
    expect(syncProgression(fifth, 1, library, names).features).toHaveLength(2)
  })

  it('keeps removed resources and features removed, and restores them on request', () => {
    const fifth = monk(5)
    const strike = fifth.features.find((f) => f.ref === 'feature.monk-stunning-strike')!
    let build = removeFeature(removeTracker(fifth, 'class-monk-focus'), strike.id)
    build = syncProgression(build, 6, library, names)
    expect(build.trackers.some((t) => t.key === 'monk-focus')).toBe(false)
    expect(build.features.some((f) => f.ref === strike.ref)).toBe(false)
    build = syncProgression(restoreTracker(build, 'monk-focus'), 6, library, names)
    expect(build.trackers.find((t) => t.key === 'monk-focus')?.max).toBe(6)
    const row = library.find((r) => r.id === strike.ref)!
    build = syncProgression(addLibraryFeature(build, row, 6), 6, library, names)
    expect(build.features.filter((f) => f.ref === strike.ref)).toHaveLength(1)
  })

  it('adopts resources and features typed by hand instead of duplicating them', () => {
    const legacy = {
      ...emptyBuild(),
      classKey: 'monk',
      trackers: [{ id: 't1', name: 'RES:monk-focus ', max: 3, reset: 'short' as const }],
      features: [
        { id: 'f1', name: 'artes marciales', source: 'class' as const, description: 'Mis notas' },
      ],
    }
    const build = syncProgression(legacy, 4, library, names)
    expect(build.trackers.filter((t) => t.key === 'monk-focus')).toEqual([
      {
        id: 't1',
        name: 'RES:monk-focus ',
        max: 4,
        reset: 'short',
        key: 'monk-focus',
        display: 'pips',
      },
    ])
    expect(build.features.filter((f) => f.ref === 'feature.monk-martial-arts')).toEqual([
      {
        id: 'f1',
        name: 'artes marciales',
        source: 'class',
        description: 'Mis notas',
        ref: 'feature.monk-martial-arts',
        level: 1,
      },
    ])
  })

  it('adds subclass features only for the chosen SRD subclass', () => {
    const build = { ...monk(3), subclassKey: 'open-hand' }
    expect(
      syncProgression(build, 3, library, names).features.some(
        (f) => f.ref === 'feature.monk-open-hand-open-hand-technique',
      ),
    ).toBe(true)
    expect(monk(3).features.some((f) => f.ref?.startsWith('feature.monk-open-hand'))).toBe(false)
  })

  it('scales pools with the level and ability modifiers', () => {
    const paladin = syncProgression(
      { ...emptyBuild(), classKey: 'paladin' },
      7,
      library,
      names,
    ).trackers.find((t) => t.key === 'paladin-lay-on-hands')
    expect(paladin).toMatchObject({ max: 35, display: 'counter', reset: 'long' })
    const bard = (level: number) =>
      syncProgression(
        {
          ...emptyBuild(),
          classKey: 'bard',
          baseAbilities: { ...emptyBuild().baseAbilities, cha: 16 },
        },
        level,
        library,
        names,
      ).trackers.find((t) => t.key === 'bard-bardic-inspiration')
    expect(bard(1)).toMatchObject({ max: 3, reset: 'long' })
    expect(bard(5)).toMatchObject({ max: 3, reset: 'short' })
  })
})

describe('RYT-072 quick and blank sheets', () => {
  const namer = (kind: 'trait' | 'feat', key: string) => `${kind}:${key}`
  it('builds a valid level 1 sheet for every class', () => {
    for (const classKey of classKeys) {
      const draft = quickDraft({
        classKey,
        classLabel: classKey,
        speciesKey: 'human',
        speciesLabel: 'Humano',
        backgroundLabel: (key) => key,
        name: namer,
        library,
        names,
      })
      expect(buildSchema.safeParse(draft.build).success, classKey).toBe(true)
      expect(draft.level).toBe(1)
      expect([...Object.values(draft.build.baseAbilities)].sort((a, b) => b - a)).toEqual([
        15, 14, 13, 12, 10, 8,
      ])
      expect(Object.values(draft.build.bonuses).reduce((a, b) => a + b, 0)).toBe(3)
      expect(draft.build.features.some((f) => f.source === 'class')).toBe(true)
      expect(draft.build.origin).toBe('quick')
    }
  })

  it('gives a monk Unarmored Defense, focus-free level 1 and its usual skills', () => {
    const draft = quickDraft({
      classKey: 'monk',
      classLabel: 'Monje',
      speciesKey: 'human',
      speciesLabel: 'Humano',
      backgroundLabel: (key) => key,
      name: namer,
      library,
      names,
    })
    // DEX 15+2, WIS 14: 10 + 3 + 2.
    expect(draft.armorClass).toBe(15)
    // d8 + CON 13+1.
    expect(draft.maxHp).toBe(10)
    expect(draft.build.skills).toMatchObject({
      acrobatics: 'proficient',
      insight: 'proficient',
      stealth: 'proficient',
      sleightOfHand: 'proficient',
    })
    expect(draft.build.trackers).toEqual([])
  })

  it('creates a blank sheet with the class, level, resources and features only', () => {
    const draft = blankDraft({
      classKey: 'fighter',
      classLabel: 'Guerrero',
      level: 5,
      library,
      names,
    })
    expect(draft).toMatchObject({ level: 5, maxHp: 34, armorClass: 10 })
    expect(draft.build.trackers.map((t) => t.key)).toEqual([
      'fighter-second-wind',
      'fighter-action-surge',
    ])
    expect(draft.build.origin).toBe('blank')
    const custom = blankDraft({
      classKey: 'custom',
      classLabel: 'Artificiero',
      level: 2,
      library,
      names,
    })
    expect(custom.build).toMatchObject({
      classKey: 'custom',
      classLabel: 'Artificiero',
      features: [],
    })
  })
})

describe('RYT-070 history lines', () => {
  const item = (kind: string, changes: HistoryItem['changes']): HistoryItem => ({
    id: '00000000-0000-4000-8000-000000000000',
    at: '2026-11-09T10:00:00Z',
    kind,
    actor: 'dm',
    actor_name: null,
    changes,
  })
  it('names HP, slot, resource and condition changes', () => {
    expect(
      describeHistory(
        item('character_vitals:UPDATE', [
          { field: 'current_hp', before: 25, after: 18 },
          { field: 'conditions', before: [], after: ['poisoned'] },
          { field: 'slots_used', before: [0, 0], after: [1, 0] },
          { field: 'tracker_uses', before: {}, after: { 'class-monk-focus': 2 } },
        ]),
      ),
    ).toEqual([
      { key: 'number', field: 'current_hp', before: 25, after: 18 },
      { key: 'added', field: 'conditions', name: 'poisoned' },
      { key: 'slot', level: 1, before: 0, after: 1 },
      { key: 'tracker', id: 'class-monk-focus', before: 0, after: 2 },
    ])
  })
  it('names level, ability, skill and spell changes and summarises a completed draft', () => {
    expect(
      describeHistory(
        item('character_sheets:UPDATE', [
          { field: 'level', before: 4, after: 5 },
          { field: 'build.baseAbilities', before: { wis: 14 }, after: { wis: 16 } },
          { field: 'build.skills', before: {}, after: { stealth: 'proficient' } },
          {
            field: 'build.spells',
            before: [],
            after: [{ id: 's1', name: 'Bola de fuego', level: 3 }],
          },
          { field: 'build.layout', before: null, after: { hidden: ['notes'] } },
          { field: 'build.notes', before: 'a', after: 'b' },
        ]),
      ),
    ).toEqual([
      { key: 'number', field: 'level', before: 4, after: 5 },
      { key: 'ability', ability: 'wis', before: 14, after: 16 },
      { key: 'skill', skill: 'stealth', before: null, after: 'proficient' },
      { key: 'added', field: 'spells', name: 'Bola de fuego' },
      { key: 'edited', field: 'notes' },
    ])
    expect(
      describeHistory(
        item('character_sheets:UPDATE', [
          { field: 'status', before: 'draft', after: 'complete' },
          { field: 'build.classKey', before: null, after: 'monk' },
        ]),
      ),
    ).toEqual([{ key: 'completed' }])
  })
})
