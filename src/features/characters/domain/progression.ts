import type { Build, Feature, Tracker } from './sheet'
import { featRefs, grantedResources, resourceId, traitRef, type ResourceSpec } from './resources'
import { finalAbilities, isSpeciesKey, modifier } from './rules'
import { abilityKeys, species, type Ability } from './srd'

export type RestKind = 'short' | 'long' | 'none'

/** One SRD class feature from the glossary index (RYT-071), in the interface language. */
export type LibraryFeature = {
  id: string
  name: string
  classKey: string
  level: number
  subclass: string | null
  /** No longer offered by the campaign (RYT-164): kept where a character has it. */
  hidden?: boolean
}

/**
 * The name stored on a resource Rytta adds. Callers pass the resource key, so a sheet is not
 * frozen in the language it was created in (the interface translates keyed resources at render).
 * `match` lists the localized names a hand-typed resource may carry to be adopted.
 */
export type ProgressionNames = {
  resource: (key: string) => string
  match?: (key: string) => string[]
}

export const removedTracker = (key: string) => `tracker:${key}`
export const removedFeature = (ref: string) => `feature:${ref}`
/** Ids of features Rytta manages from the class and level (others are the player's own). */
export const managedFeatureId = (ref: string) => `srd-${ref.replace(/^feature\./, '')}`
const isManaged = (feature: Feature) => feature.id.startsWith('srd-') && Boolean(feature.ref)
/** Resources a sheet holds (the sheet schema's limit). */
export const maxTrackers = 30
/** Accent- and case-insensitive name, to adopt entries typed by hand before RYT-071. */
const plain = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase()

function modifiers(build: Build): Record<Ability, number> {
  const scores = finalAbilities(build)
  return Object.fromEntries(abilityKeys.map((key) => [key, modifier(scores[key])])) as Record<
    Ability,
    number
  >
}

/** Maximum, reset, display and turn mark follow the spec; the name and a chosen display stay. */
function withSpec(
  tracker: Tracker,
  spec: ResourceSpec,
  level: number,
  mods: Record<Ability, number>,
): Tracker {
  const { per: _per, ...rest } = tracker
  return {
    ...rest,
    max: Math.min(999, Math.max(1, spec.max(level, mods))),
    reset: spec.reset(level),
    display: tracker.display ?? spec.display,
    ...(spec.per ? { per: spec.per } : {}),
  }
}

/** Seeded species traits (`species-<trait>`) and background feats (`background-<feat>`) get the
 * glossary entry of their trait or feat; the player's own entries are untouched. */
function linkOriginFeatures(build: Build): Feature[] {
  const traits: readonly string[] = isSpeciesKey(build.speciesKey)
    ? species[build.speciesKey].traits
    : []
  return build.features.map((feature) => {
    if (feature.ref) return feature
    if (feature.source === 'species' && feature.id.startsWith('species-')) {
      const trait = feature.id.slice('species-'.length)
      return traits.includes(trait)
        ? { ...feature, ref: traitRef(build.speciesKey, trait) }
        : feature
    }
    if (feature.source === 'feat' && feature.id.startsWith('background-')) {
      const ref = featRefs[feature.id.slice('background-'.length)]
      return ref ? { ...feature, ref } : feature
    }
    return feature
  })
}

/**
 * SRD features of the build's class (and SRD subclass) up to a level, in level order. Features the
 * campaign no longer offers are left out unless `withHidden` (to keep what characters have).
 */
export function classFeaturesFor(
  build: Build,
  level: number,
  library: LibraryFeature[],
  withHidden = false,
) {
  return library
    .filter(
      (row) =>
        (withHidden || !row.hidden) &&
        row.classKey === build.classKey &&
        row.level <= level &&
        (!row.subclass || row.subclass === build.subclassKey),
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
}

/**
 * RYT-071 progression: class resources and SRD class features follow class, subclass and level.
 * Resources keep their spent uses (vitals) and get the new maximum and reset; resources and
 * features the player removed stay removed; the player's own entries are never touched.
 */
export function syncProgression(
  build: Build,
  level: number,
  library: LibraryFeature[],
  names: ProgressionNames,
): Build {
  return syncProgressionReport(build, level, library, names).build
}

/**
 * The synced build and how many granted resources were left out because the sheet already holds
 * `maxTrackers`; the sheet says so instead of dropping them silently.
 */
export function syncProgressionReport(
  build: Build,
  level: number,
  library: LibraryFeature[],
  names: ProgressionNames,
): { build: Build; leftOut: number } {
  const removed = new Set(build.removed ?? [])
  const mods = modifiers(build)
  // RYT-102: species traits and feats link to their glossary entries, so their trackers (and the
  // player) find the rules text; this also covers sheets seeded before the entries existed.
  build = { ...build, features: linkOriginFeatures(build) }
  const specs = grantedResources(build, level).filter(
    (spec) => !removed.has(removedTracker(spec.key)),
  )
  const wanted = new Map(specs.map((spec) => [spec.key, spec]))
  const trackers: Tracker[] = []
  for (const original of build.trackers) {
    let tracker = original
    if (!tracker.key) {
      // A resource typed by hand with the class resource's name becomes that resource.
      const match = [...wanted.values()].find((spec) =>
        [names.resource(spec.key), ...(names.match?.(spec.key) ?? [])].some(
          (name) => plain(name) === plain(tracker.name),
        ),
      )
      if (!match) {
        trackers.push(tracker)
        continue
      }
      tracker = { ...tracker, key: match.key }
    }
    const spec = wanted.get(tracker.key!)
    if (!spec) continue
    wanted.delete(tracker.key!)
    trackers.push(withSpec(tracker, spec, level, mods))
  }
  let leftOut = 0
  for (const spec of wanted.values()) {
    if (trackers.length >= maxTrackers) {
      leftOut += 1
      continue
    }
    trackers.push(
      withSpec(
        {
          id: resourceId(spec),
          key: spec.key,
          name: names.resource(spec.key),
          max: 1,
          reset: 'long',
        },
        spec,
        level,
        mods,
      ),
    )
  }
  const all = classFeaturesFor(build, level, library, true).filter(
    (row) => !removed.has(removedFeature(row.id)),
  )
  // RYT-164: a hidden feature stays where a character has it, and is added to nobody.
  const rows = all.filter((row) => !row.hidden)
  const refs = new Set(all.map((row) => row.id))
  const byName = new Map(rows.map((row) => [plain(row.name), row]))
  const kept = build.features
    .filter((feature) => !isManaged(feature) || refs.has(feature.ref!))
    .map((feature) => {
      // A class feature typed by hand with the SRD name links to the glossary instead of
      // getting a duplicate; it keeps its id and description.
      const row =
        !feature.ref && feature.source === 'class' ? byName.get(plain(feature.name)) : null
      return row ? { ...feature, ref: row.id, level: row.level } : feature
    })
  const present = new Set(kept.map((feature) => feature.ref).filter(Boolean))
  const added: Feature[] = rows
    .filter((row) => !present.has(row.id))
    .map((row) => ({
      id: managedFeatureId(row.id),
      name: row.name,
      source: 'class',
      description: '',
      ref: row.id,
      level: row.level,
    }))
  return { build: { ...build, trackers, features: [...kept, ...added].slice(0, 120) }, leftOut }
}

/** Removing a managed resource or feature remembers it so levelling up does not add it back. */
export function removeTracker(build: Build, id: string): Build {
  const tracker = build.trackers.find((item) => item.id === id)
  if (!tracker) return build
  return {
    ...build,
    trackers: build.trackers.filter((item) => item.id !== id),
    removed: tracker.key
      ? [...new Set([...(build.removed ?? []), removedTracker(tracker.key)])]
      : build.removed,
  }
}
export function removeFeature(build: Build, id: string): Build {
  const feature = build.features.find((item) => item.id === id)
  if (!feature) return build
  return {
    ...build,
    features: build.features.filter((item) => item.id !== id),
    removed:
      feature.ref && isManaged(feature)
        ? [...new Set([...(build.removed ?? []), removedFeature(feature.ref)])]
        : build.removed,
  }
}
/** Restores a removed class resource; the next sync adds it again with its maximum. */
export function restoreTracker(build: Build, key: string): Build {
  return { ...build, removed: (build.removed ?? []).filter((item) => item !== removedTracker(key)) }
}
/** Library add: a feature the class grants returns as managed; any other is the player's own. */
export function addLibraryFeature(build: Build, row: LibraryFeature, level: number): Build {
  if (build.features.some((feature) => feature.ref === row.id)) return build
  const granted =
    row.classKey === build.classKey &&
    row.level <= level &&
    (!row.subclass || row.subclass === build.subclassKey)
  const removed = (build.removed ?? []).filter((item) => item !== removedFeature(row.id))
  const feature: Feature = {
    id: granted ? managedFeatureId(row.id) : `lib-${row.id.replace(/^feature\./, '')}`.slice(0, 90),
    name: row.name,
    source: 'class',
    description: '',
    ref: row.id,
    level: row.level,
  }
  return { ...build, removed, features: [...build.features, feature].slice(0, 120) }
}

/** What a sync changed on the resources and features, so the sheet can say it (RYT-071). */
export type SyncChanges = {
  added: Tracker[]
  changed: { tracker: Tracker; from: number }[]
  features: number
}
export function syncChanges(before: Build, after: Build): SyncChanges {
  const old = new Map(before.trackers.map((tracker) => [tracker.id, tracker]))
  const added = after.trackers.filter((tracker) => !old.has(tracker.id))
  const changed = after.trackers.flatMap((tracker) => {
    const prev = old.get(tracker.id)
    return prev && prev.max !== tracker.max ? [{ tracker, from: prev.max }] : []
  })
  const had = new Set(before.features.map((feature) => feature.id))
  return {
    added,
    changed,
    features: after.features.filter((feature) => !had.has(feature.id)).length,
  }
}
