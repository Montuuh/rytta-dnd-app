import { queryOptions } from '@tanstack/react-query'
import { loadCreatureArt, loadMonsterBodies, loadMonsterIndex } from './data/content'
import type { BestiaryLanguage } from './domain/types'

// RYT-167: the published SRD's creatures (public content, read by signed-in accounts).
export const monsterIndexQuery = () =>
  queryOptions({
    queryKey: ['bestiary', 'srd', 'index'],
    queryFn: loadMonsterIndex,
    staleTime: 30 * 60_000,
    retry: 1,
  })

export const monsterBodiesQuery = (language: BestiaryLanguage) =>
  queryOptions({
    queryKey: ['bestiary', 'srd', 'bodies', language],
    queryFn: () => loadMonsterBodies(language),
    staleTime: 30 * 60_000,
    retry: 1,
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
