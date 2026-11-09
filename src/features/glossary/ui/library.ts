import { useMemo } from 'react'
import type { FeatureClass, FeatureSubclass, SpellClass, SpellSchool } from '../domain/types'
import { useGlossary } from './glossary-context'

/** RYT-071: SRD class features and spells for the character sheet's library picker. */
export type LibraryFeatureEntry = {
  id: string
  name: string
  classKey: FeatureClass
  level: number
  subclass: FeatureSubclass | null
}
export type LibrarySpellEntry = {
  id: string
  name: string
  level: number
  school: SpellSchool
  classes: SpellClass[]
  concentration: boolean
  ritual: boolean
}

/** Null until the glossary index loads (or outside a glossary layer). */
export function useSrdLibrary() {
  const glossary = useGlossary()
  const catalog = glossary?.catalog ?? null
  return useMemo(() => {
    if (!catalog) return null
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
    return { features, spells }
  }, [catalog])
}
