import { queryOptions } from '@tanstack/react-query'
import { loadCreatureArt, loadMonsterBodies, loadMonsterIndex } from './data/content'
import type { BestiaryLanguage } from './domain/types'

// Bundled public SRD content: never part of a private query key.
export const monsterIndexQuery = () =>
  queryOptions({
    queryKey: ['bestiary', 'index'],
    queryFn: loadMonsterIndex,
    staleTime: Infinity,
    gcTime: Infinity,
  })

export const monsterBodiesQuery = (language: BestiaryLanguage) =>
  queryOptions({
    queryKey: ['bestiary', 'bodies', language],
    queryFn: () => loadMonsterBodies(language),
    staleTime: Infinity,
    gcTime: Infinity,
  })

/** Credits of the bundled creature art (public content, like the index). */
export const creatureArtQuery = () =>
  queryOptions({
    queryKey: ['bestiary', 'art'],
    queryFn: loadCreatureArt,
    staleTime: Infinity,
    gcTime: Infinity,
  })

export const bestiaryLanguage = (language: string | undefined): BestiaryLanguage =>
  language?.startsWith('en') ? 'en' : 'es'
