import { describe, expect, it } from 'vitest'
import {
  assignStandard,
  buildGaps,
  chooseBackground,
  chooseClass,
  classChangeLoss,
  initialDraft,
  pointBuyCeiling,
  stepGaps,
  suggestedHpFor,
} from './creation'
import { reseedStandard, standardAbilitiesFor } from './quick'
import { syncChanges, syncProgression } from './progression'
import { pointBuySpent, standardArrayValid } from './rules'
import { pointBuyStart } from './creation'

const name = (_kind: 'trait' | 'feat', key: string) => key

describe('wizard class change (RYT-124)', () => {
  it('drops the subclass and the class skill picks, keeps background skills, and says what went', () => {
    let build = initialDraft().build
    build = chooseBackground(build, 'acolyte', 'Acólito', name)
    build = chooseClass(build, 'wizard', 'Mago')
    build = {
      ...build,
      subclass: 'Evocador',
      subclassKey: 'evoker',
      spells: [
        {
          id: 's1',
          name: 'Bola de fuego',
          level: 3,
          concentration: false,
          ritual: false,
          prepared: true,
          notes: '',
        },
      ],
      skills: { ...build.skills, arcana: 'proficient', history: 'proficient' },
    }
    const next = chooseClass(build, 'fighter', 'Guerrero')
    expect(next.subclass).toBe('')
    expect(next.subclassKey).toBe('')
    expect(Object.keys(next.skills).sort()).toEqual(['insight', 'religion'])
    expect(classChangeLoss(build, next)).toEqual({ subclass: 'Evocador', skills: 2, spells: 1 })
    // Picking the same class again changes nothing and loses nothing.
    expect(chooseClass(next, 'fighter', 'Guerrero')).toEqual(next)
    expect(classChangeLoss(next, chooseClass(next, 'fighter', 'Guerrero'))).toBeNull()
  })
  it('places the standard array by class and re-places it only while it is still the seed', () => {
    const wizard = standardAbilitiesFor('wizard')
    expect(wizard.int).toBe(15)
    expect(standardArrayValid(wizard)).toBe(true)
    expect(standardAbilitiesFor('').str).toBe(15)
    const start = initialDraft().build
    const asWizard = reseedStandard(start, chooseClass(start, 'wizard', 'Mago'))
    expect(asWizard.baseAbilities).toEqual(wizard)
    const asFighter = reseedStandard(asWizard, chooseClass(asWizard, 'fighter', 'Guerrero'))
    expect(asFighter.baseAbilities).toEqual(standardAbilitiesFor('fighter'))
    // A player's own arrangement survives a class change.
    const own = { ...asWizard, baseAbilities: { ...wizard, int: 8, str: 15 } }
    expect(reseedStandard(own, chooseClass(own, 'fighter', 'Guerrero')).baseAbilities).toEqual(
      own.baseAbilities,
    )
  })
  it('suggested HP follows class, level and Constitution', () => {
    const draft = initialDraft(3)
    const barbarian = { ...draft, build: chooseClass(draft.build, 'barbarian', 'Bárbaro') }
    expect(suggestedHpFor(barbarian)).toBeGreaterThan(suggestedHpFor(draft))
  })
})

describe('open choices (RYT-124)', () => {
  it('names unassigned ability increases and missing class skills, and only those', () => {
    let build = initialDraft().build
    expect(stepGaps('origin', build)).toEqual([])
    build = chooseBackground(build, 'acolyte', 'Acólito', name)
    expect(stepGaps('origin', build)).toEqual([{ kind: 'bonuses' }])
    expect(stepGaps('skills', build)).toEqual([])
    build = chooseClass(build, 'wizard', 'Mago')
    expect(stepGaps('skills', build)).toEqual([{ kind: 'skills', missing: 2 }])
    build = { ...build, bonuses: { ...build.bonuses, int: 2, wis: 1 } }
    build = { ...build, skills: { ...build.skills, arcana: 'proficient' } }
    expect(buildGaps(build)).toEqual([{ step: 'skills', gap: { kind: 'skills', missing: 1 } }])
    // A homebrew class has no skill count to miss.
    expect(stepGaps('skills', { ...build, classKey: 'custom' })).toEqual([])
  })
})

describe('ability scores (RYT-124)', () => {
  it('swaps instead of duplicating in the standard array', () => {
    const scores = standardAbilitiesFor('')
    const swapped = assignStandard(scores, 'str', 8)
    expect(swapped.str).toBe(8)
    expect(swapped.cha).toBe(15)
    expect(standardArrayValid(swapped)).toBe(true)
    expect(assignStandard(scores, 'str', 15)).toEqual(scores)
  })
  it('stops raising a point-buy score at the budget', () => {
    const start = pointBuyStart()
    expect(pointBuyCeiling(start, 'str')).toBe(15)
    const spent = { ...start, str: 15, dex: 15, con: 15 }
    expect(pointBuySpent(spent)).toBe(27)
    expect(pointBuyCeiling(spent, 'int')).toBe(8)
    expect(pointBuyCeiling(spent, 'str')).toBe(15)
  })
})

describe('resource names (RYT-124)', () => {
  const library = [] as never[]
  const build = () => {
    let next = initialDraft().build
    next = chooseClass(next, 'barbarian', 'Bárbaro')
    return next
  }
  it('stores the key, adopts a hand-typed localized name, and reports what a sync changed', () => {
    const names = { resource: (key: string) => key, match: () => ['Furia'] }
    const synced = syncProgression(build(), 1, library, names)
    const rage = synced.trackers.find((tracker) => tracker.key === 'barbarian-rage')
    expect(rage?.name).toBe('barbarian-rage')
    // A resource typed as "Furia" before the sync becomes the managed one.
    const typed = {
      ...build(),
      trackers: [{ id: 'mine', name: 'Furia', max: 9, reset: 'long' as const }],
    }
    const adopted = syncProgression(typed, 1, library, names)
    expect(adopted.trackers).toHaveLength(1)
    expect(adopted.trackers[0]).toMatchObject({ id: 'mine', key: 'barbarian-rage', name: 'Furia' })
    const changes = syncChanges(typed, adopted)
    expect(changes.changed).toEqual([{ tracker: adopted.trackers[0], from: 9 }])
    expect(changes.added).toEqual([])
  })
})

describe('wizard species options (RYT-111)', () => {
  it('blocks the origin step until a required species option is chosen', async () => {
    const { chooseSpecies, validateStep } = await import('./creation')
    const { grantedResources } = await import('./resources')
    const draft = initialDraft()
    const gnome = { ...draft, build: chooseSpecies(draft.build, 'gnome', 'Gnomo', name) }
    expect(validateStep('origin', gnome)).toContain('chooseSpeciesOption')
    const chosen = { ...gnome, build: { ...gnome.build, choices: { gnomishLineage: 'forest' } } }
    expect(validateStep('origin', chosen)).not.toContain('chooseSpeciesOption')
    // The same build.choices the sheet writes, so the lineage tracker is granted alike.
    expect(grantedResources(chosen.build, 1).map((spec) => spec.key)).toContain(
      'gnome-speak-with-animals',
    )
    // A species without options never asks; a new species drops the old choice.
    const human = { ...draft, build: chooseSpecies(chosen.build, 'human', 'Humano', name) }
    expect(validateStep('origin', human)).not.toContain('chooseSpeciesOption')
    expect(human.build.choices).toBeUndefined()
  })
})
