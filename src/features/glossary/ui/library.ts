import { useMemo } from 'react'
import type { SpellSchool } from '../domain/types'
import { useGlossary } from './glossary-context'

/** RYT-071: SRD class features and spells for the character sheet's library picker. */
export type LibraryFeatureEntry = {
  id: string
  name: string
  classKey: string
  level: number
  subclass: string | null
  /** RYT-164: no longer offered by the campaign; characters that have it keep it. */
  hidden?: boolean
}
export type LibrarySpellEntry = {
  id: string
  name: string
  level: number
  school: SpellSchool
  classes: string[]
  concentration: boolean
  ritual: boolean
}

/** Null until the glossary index loads (or outside a glossary layer). */
export function useSrdLibrary() {
  const glossary = useGlossary()
  const catalog = glossary?.catalog ?? null
  const classRows = glossary?.classRows ?? null
  return useMemo(() => {
    if (!catalog || !classRows) return null
    const features: LibraryFeatureEntry[] = []
    const spells: LibrarySpellEntry[] = []
    for (const entry of catalog.entries) {
      if (entry.source !== 'srd') continue
      if (entry.feature)
        features.push({
          id: entry.id,
          name: entry.name,
          classKey: entry.feature.classKey,
          level: entry.feature.level,
          subclass: entry.feature.subclass,
        })
      if (entry.spell) spells.push({ id: entry.id, name: entry.name, ...entry.spell })
    }
    // Class features the campaign no longer offers: progression keeps them on characters that
    // already have them, and grants them to nobody new.
    for (const entry of catalog.unlisted)
      if (entry.feature)
        features.push({
          id: entry.id,
          name: entry.name,
          classKey: entry.feature.classKey,
          level: entry.feature.level,
          subclass: entry.feature.subclass,
          hidden: true,
        })
    return { features, spells, classes: classRows }
  }, [catalog, classRows])
}
