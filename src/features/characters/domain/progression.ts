import type { Build, Feature, Tracker } from './sheet'
import { classResourceId, classResources } from './resources'
import { finalAbilities, isClassKey, modifier } from './rules'
import { abilityKeys, type Ability } from './srd'

export type RestKind = 'short' | 'long' | 'none'

/** One SRD class feature from the glossary index (RYT-071), in the interface language. */
export type LibraryFeature = {
  id: string
  name: string
  classKey: string
  level: number
  subclass: string | null
}

/** Localized names for resources Rytta adds (the build stores them as written). */
export type ProgressionNames = { resource: (key: string) => string }

export const removedTracker = (key: string) => `tracker:${key}`
export const removedFeature = (ref: string) => `feature:${ref}`
/** Ids of features Rytta manages from the class and level (others are the player's own). */
export const managedFeatureId = (ref: string) => `srd-${ref.replace(/^feature\./, '')}`
const isManaged = (feature: Feature) => feature.id.startsWith('srd-') && Boolean(feature.ref)
const maxTrackers = 30
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

/** SRD features of the build's class (and SRD subclass) up to a level, in level order. */
export function classFeaturesFor(build: Build, level: number, library: LibraryFeature[]) {
  return library
    .filter(
      (row) =>
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
  const removed = new Set(build.removed ?? [])
  const mods = modifiers(build)
  const specs = isClassKey(build.classKey)
    ? classResources.filter(
        (spec) =>
          spec.classKey === build.classKey &&
          level >= spec.from &&
          !removed.has(removedTracker(spec.key)),
      )
    : []
  const wanted = new Map(specs.map((spec) => [spec.key, spec]))
  const trackers: Tracker[] = []
  for (const original of build.trackers) {
    let tracker = original
    if (!tracker.key) {
      // A resource typed by hand with the class resource's name becomes that resource.
      const match = [...wanted.values()].find(
        (spec) => plain(names.resource(spec.key)) === plain(tracker.name),
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
    trackers.push({
      ...tracker,
      max: Math.min(999, Math.max(1, spec.max(level, mods))),
      reset: spec.reset(level),
      display: tracker.display ?? spec.display,
    })
  }
  for (const spec of wanted.values()) {
    if (trackers.length >= maxTrackers) break
    trackers.push({
      id: classResourceId(spec.key),
      key: spec.key,
      name: names.resource(spec.key),
      max: Math.min(999, Math.max(1, spec.max(level, mods))),
      reset: spec.reset(level),
      display: spec.display,
    })
  }
  const rows = classFeaturesFor(build, level, library).filter(
    (row) => !removed.has(removedFeature(row.id)),
  )
  const refs = new Set(rows.map((row) => row.id))
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
  return { ...build, trackers, features: [...kept, ...added].slice(0, 120) }
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
