import { describe, expect, it } from 'vitest'
import { removeTracker, syncProgression, type LibraryFeature } from './progression'
import {
  actionsFor,
  classResources,
  grantedResources,
  managedResources,
  resourceActions,
  resourceId,
  resourceSpec,
  spendAction,
} from './resources'
import { applyRest, emptyBuild, restRecovery } from './rules'
import { chooseBackground, chooseSpecies } from './creation'
import { buildSchema, type Build, type Vitals } from './sheet'
import { backgroundKeys, classKeys, speciesKeys, subclassOf, traitChoices } from './srd'

type Row = { id: string; cat: string; es: string; lv?: number; fc?: string; sb?: string }
const [index] = Object.values(
  import.meta.glob<Row[]>('../../glossary/content/index.json', { eager: true, import: 'default' }),
)
const rows = new Map(index!.map((row) => [row.id, row]))
const library: LibraryFeature[] = index!
  .filter((row) => row.cat === 'feature' && row.fc)
  .map((row) => ({
    id: row.id,
    name: row.es,
    classKey: row.fc!,
    level: row.lv!,
    subclass: row.sb ?? null,
  }))
const names = { resource: (key: string) => `res:${key}` }
const namer = (kind: 'trait' | 'feat', key: string) => `${kind}:${key}`
const sync = (build: Build, level: number) => syncProgression(build, level, library, names)
const keys = (build: Build) => build.trackers.map((tracker) => tracker.key)
const vitals = (uses: Record<string, number> = {}): Vitals => ({
  current_hp: 10,
  temp_hp: 0,
  hit_dice_spent: 0,
  death_successes: 0,
  death_failures: 0,
  heroic_inspiration: false,
  conditions: [],
  slots_used: Array<number>(9).fill(0),
  tracker_uses: uses,
  revision: 1,
})
const goliath = (level = 1, choice?: string) => {
  const build = chooseSpecies({ ...emptyBuild(), classKey: 'fighter' }, 'goliath', 'Goliat', namer)
  return sync(choice ? { ...build, choices: { giantAncestry: choice } } : build, level)
}

describe('RYT-102 resource catalogue', () => {
  it('links every resource and option to an existing glossary entry', () => {
    for (const spec of managedResources) expect(rows.has(spec.feature), spec.key).toBe(true)
    for (const spec of classResources)
      expect(rows.get(spec.feature)?.fc, spec.key).toBe(spec.classKey)
    for (const action of resourceActions) {
      expect(rows.has(action.feature), action.key).toBe(true)
      expect(resourceSpec(action.parent), action.key).toBeDefined()
      if (action.uses) expect(resourceSpec(action.uses), action.key).toBeDefined()
      if (action.restores) expect(resourceSpec(action.restores), action.key).toBeDefined()
    }
    expect(new Set(managedResources.map((spec) => spec.key)).size).toBe(managedResources.length)
    expect(new Set(resourceActions.map((action) => action.key)).size).toBe(resourceActions.length)
  })

  it('keeps tracker ids within the play-state key limit', () => {
    for (const spec of managedResources) expect(resourceId(spec).length).toBeLessThanOrEqual(40)
  })

  it('only uses the SRD subclass of each class and the options its traits offer', () => {
    for (const spec of managedResources) {
      if (spec.subclass) expect(subclassOf[spec.classKey!], spec.key).toBe(spec.subclass)
      if (spec.choice) {
        const [key, option] = spec.choice
        expect(traitChoices[key].species, spec.key).toBe(spec.species)
        expect(traitChoices[key].options as readonly string[], spec.key).toContain(option)
      }
    }
    for (const action of resourceActions)
      if (action.subclass)
        expect(subclassOf[resourceSpec(action.parent)!.classKey!], action.key).toBe(action.subclass)
  })

  it('stays within 30 trackers for every class, subclass, species and background at level 20', () => {
    for (const classKey of classKeys)
      for (const speciesKey of speciesKeys)
        for (const backgroundKey of backgroundKeys) {
          const choices = Object.fromEntries(
            Object.entries(traitChoices)
              .filter(([, entry]) => entry.species === speciesKey)
              .map(([key, entry]) => [key, entry.options[0]]),
          )
          const build = sync(
            {
              ...emptyBuild(),
              classKey,
              subclassKey: subclassOf[classKey],
              speciesKey,
              backgroundKey,
              choices,
            },
            20,
          )
          expect(build.trackers.length, `${classKey} ${speciesKey}`).toBeLessThanOrEqual(30)
          expect(buildSchema.safeParse(build).success, `${classKey} ${speciesKey}`).toBe(true)
        }
  })
})

describe('RYT-102 species, feat and subclass trackers', () => {
  it('gives a goliath Giant Ancestry (PB per long rest) and Large Form from level 5', () => {
    expect(goliath(1).trackers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'origin-goliath-giant-ancestry',
          key: 'goliath-giant-ancestry',
          max: 2,
          reset: 'long',
        }),
      ]),
    )
    expect(keys(goliath(4))).not.toContain('goliath-large-form')
    const fifth = goliath(5, 'fire')
    expect(fifth.trackers.find((t) => t.key === 'goliath-giant-ancestry')?.max).toBe(3)
    expect(fifth.trackers.find((t) => t.key === 'goliath-large-form')).toMatchObject({
      max: 1,
      reset: 'long',
    })
    expect(fifth.features.find((f) => f.id === 'species-giantAncestry')?.ref).toBe(
      'feature.species-goliath-giant-ancestry',
    )
  })

  it('adds the trackers of other species, with lineage spells only for the chosen option', () => {
    const species = (key: string, level: number, choices?: Build['choices']) =>
      keys(sync({ ...chooseSpecies(emptyBuild(), key, key, namer), choices }, level))
    expect(species('dragonborn', 5)).toEqual([
      'dragonborn-breath-weapon',
      'dragonborn-draconic-flight',
    ])
    expect(species('dwarf', 1)).toEqual(['dwarf-stonecunning'])
    expect(species('orc', 1)).toEqual(['orc-adrenaline-rush', 'orc-relentless-endurance'])
    expect(species('elf', 5)).toEqual([])
    expect(species('elf', 5, { elvenLineage: 'drow' })).toEqual(['elf-faerie-fire', 'elf-darkness'])
    expect(species('elf', 3, { elvenLineage: 'wood' })).toEqual(['elf-longstrider'])
    expect(species('gnome', 1, { gnomishLineage: 'forest' })).toEqual(['gnome-speak-with-animals'])
    expect(species('gnome', 1, { gnomishLineage: 'rock' })).toEqual([])
    expect(species('tiefling', 5, { fiendishLegacy: 'infernal' })).toEqual([
      'tiefling-hellish-rebuke',
      'tiefling-darkness',
    ])
    // An option of another trait or an unknown value grants nothing.
    expect(species('tiefling', 5, { elvenLineage: 'drow' })).toEqual([])
    expect(species('human', 20)).toEqual([])
    const orc = sync(chooseSpecies(emptyBuild(), 'orc', 'Orco', namer), 9)
    expect(orc.trackers.find((t) => t.key === 'orc-adrenaline-rush')).toMatchObject({
      max: 4,
      reset: 'short',
    })
  })

  it('tracks Magic Initiate and a once-per-turn Savage Attacker from the background feat', () => {
    const soldier = sync(chooseBackground(emptyBuild(), 'soldier', 'Soldado', namer), 1)
    expect(soldier.trackers).toEqual([
      expect.objectContaining({
        id: 'origin-feat-savage-attacker',
        max: 1,
        reset: 'short',
        per: 'turn',
      }),
    ])
    expect(soldier.features.find((f) => f.source === 'feat')?.ref).toBe(
      'feature.feat-savage-attacker',
    )
    for (const background of ['acolyte', 'sage'])
      expect(keys(sync(chooseBackground(emptyBuild(), background, background, namer), 1))).toEqual([
        'feat-magic-initiate',
      ])
    expect(keys(sync(chooseBackground(emptyBuild(), 'criminal', 'Criminal', namer), 1))).toEqual([])
    // A feat linked by hand (a human's Versatile feat) counts too.
    const human = sync(
      {
        ...emptyBuild(),
        features: [
          {
            id: 'own-1',
            name: 'Atacante salvaje',
            source: 'feat',
            description: '',
            ref: 'feature.feat-savage-attacker',
          },
        ],
      },
      1,
    )
    expect(keys(human)).toEqual(['feat-savage-attacker'])
  })

  it('adds class and SRD subclass resources audited against the SRD', () => {
    const at = (classKey: string, level: number, subclass = true) =>
      sync(
        {
          ...emptyBuild(),
          classKey,
          subclassKey: subclass ? subclassOf[classKey as 'monk'] : '',
          baseAbilities: { ...emptyBuild().baseAbilities, wis: 16, cha: 14 },
        },
        level,
      ).trackers
    const find = (trackers: Build['trackers'], key: string) =>
      trackers.find((tracker) => tracker.key === key)
    expect(find(at('rogue', 1), 'rogue-sneak-attack')).toMatchObject({ per: 'turn', max: 1 })
    expect(find(at('monk', 6), 'monk-wholeness-of-body')).toMatchObject({ max: 3, reset: 'long' })
    expect(find(at('monk', 6, false), 'monk-wholeness-of-body')).toBeUndefined()
    expect(find(at('warlock', 6), 'warlock-dark-ones-own-luck')).toMatchObject({ max: 2 })
    expect(find(at('warlock', 15), 'warlock-mystic-arcanum')).toMatchObject({ max: 3 })
    expect(find(at('barbarian', 3), 'barbarian-frenzy')).toMatchObject({ per: 'turn' })
    expect(find(at('ranger', 14), 'ranger-natures-veil')).toMatchObject({ max: 3 })
    expect(find(at('paladin', 2), 'paladin-smite')).toMatchObject({ max: 1, reset: 'long' })
    expect(find(at('wizard', 20), 'wizard-signature-spells')).toMatchObject({
      max: 2,
      reset: 'short',
    })
    expect(at('cleric', 1)).toEqual([])
  })

  it('syncs existing sheets without duplicating, resetting or reviving what the player changed', () => {
    const first = goliath(5, 'stone')
    const renamed: Build = {
      ...first,
      trackers: first.trackers.map((tracker) =>
        tracker.key === 'goliath-giant-ancestry'
          ? { ...tracker, name: 'Piedra', display: 'counter' as const }
          : tracker,
      ),
    }
    const again = sync(sync(renamed, 5), 5)
    expect(again).toEqual(sync(renamed, 5))
    expect(again.trackers.filter((t) => t.key === 'goliath-giant-ancestry')).toEqual([
      expect.objectContaining({ name: 'Piedra', display: 'counter', max: 3 }),
    ])
    const removed = sync(removeTracker(again, 'origin-goliath-large-form'), 9)
    expect(keys(removed)).not.toContain('goliath-large-form')
    // A legacy sheet seeded before RYT-102 gets the trackers and links on its next sync.
    const legacy: Build = {
      ...emptyBuild(),
      speciesKey: 'goliath',
      features: [
        { id: 'species-largeForm', name: 'Forma grande', source: 'species', description: '' },
      ],
    }
    const synced = sync(legacy, 5)
    expect(keys(synced)).toEqual(['goliath-giant-ancestry', 'goliath-large-form'])
    expect(synced.features[0]?.ref).toBe('feature.species-goliath-large-form')
  })

  it('drops trackers of a species option the player no longer has', () => {
    const drow = sync(
      { ...chooseSpecies(emptyBuild(), 'elf', 'Elfo', namer), choices: { elvenLineage: 'drow' } },
      5,
    )
    const high = sync({ ...drow, choices: { elvenLineage: 'high' } }, 5)
    expect(keys(high)).toEqual(['elf-detect-magic', 'elf-misty-step'])
    // Changing species forgets the options of the old one.
    expect(chooseSpecies(high, 'dwarf', 'Enano', namer).choices).toBeUndefined()
  })
})

describe('RYT-102 options paid from a resource and once-per-turn marks', () => {
  const monk = (level: number, subclass = '') =>
    sync({ ...emptyBuild(), classKey: 'monk', subclassKey: subclass }, level)

  it('lists Focus options by level and subclass', () => {
    expect(actionsFor({ subclassKey: '' }, 2, 'monk-focus').map((a) => a.key)).toEqual([
      'monk-flurry-of-blows',
      'monk-patient-defense',
      'monk-step-of-the-wind',
    ])
    expect(actionsFor({ subclassKey: 'open-hand' }, 18, 'monk-focus')).toHaveLength(7)
    expect(actionsFor({ subclassKey: '' }, 18, 'monk-focus')).toHaveLength(6)
    expect(actionsFor({ subclassKey: 'life' }, 3, 'cleric-channel-divinity')).toHaveLength(3)
    expect(actionsFor({ subclassKey: '' }, 3, undefined)).toEqual([])
  })

  it('spends the cost from the parent tracker and refuses what cannot be paid', () => {
    const build = monk(18, 'open-hand')
    const focus = build.trackers.find((t) => t.key === 'monk-focus')!
    const flurry = resourceActions.find((a) => a.key === 'monk-flurry-of-blows')!
    const palm = resourceActions.find((a) => a.key === 'monk-quivering-palm')!
    expect(spendAction(flurry, build.trackers, {})).toEqual({ [focus.id]: 1 })
    expect(spendAction(palm, build.trackers, { [focus.id]: 14 })).toEqual({ [focus.id]: 18 })
    expect(spendAction(palm, build.trackers, { [focus.id]: 15 })).toBeNull()
    expect(spendAction(flurry, [], {})).toBeNull()
  })

  it('pays a limit or gives a use back when the option says so', () => {
    const druid = sync({ ...emptyBuild(), classKey: 'druid' }, 5)
    const resurgence = resourceActions.find((a) => a.key === 'druid-wild-resurgence')!
    const once = spendAction(resurgence, druid.trackers, {})!
    expect(once).toEqual({ 'class-druid-wild-shape': 1, 'class-druid-wild-resurgence': 1 })
    expect(spendAction(resurgence, druid.trackers, once)).toBeNull()
    const berserker = sync({ ...emptyBuild(), classKey: 'barbarian', subclassKey: 'berserker' }, 14)
    const presence = resourceActions.find((a) => a.key === 'barbarian-intimidating-presence')!
    expect(spendAction(presence, berserker.trackers, {})).toBeNull()
    expect(
      spendAction(presence, berserker.trackers, { 'class-barbarian-intimidating-presence': 1 }),
    ).toEqual({ 'class-barbarian-rage': 1, 'class-barbarian-intimidating-presence': 0 })
  })

  it('clears once-per-turn marks on any rest without listing them in the rest preview', () => {
    const rogue = sync({ ...emptyBuild(), classKey: 'rogue' }, 3)
    const used = vitals({ 'class-rogue-sneak-attack': 1 })
    expect(applyRest(used, rogue, 10, 'short').tracker_uses).toEqual({})
    expect(restRecovery(used, rogue, 10, 3, 'short').trackers).toEqual([])
    expect(
      grantedResources(rogue, 3)
        .find((s) => s.key === 'rogue-sneak-attack')
        ?.die?.(3),
    ).toBe('2d6')
  })
})
