import { queryOptions } from '@tanstack/react-query'
import { loadMonsterBodies, loadMonsterIndex } from './data/content'
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

export const bestiaryLanguage = (language: string | undefined): BestiaryLanguage =>
  language?.startsWith('en') ? 'en' : 'es'
