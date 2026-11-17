import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { artUrl } from '@/shared/ui/art-url'
import { partyOverviewQuery } from '../api'
import { isClassKey } from '../domain/rules'

/** The painted emblem of an SRD class: 512px for plates, 128px for small medallions. */
export type ClassEmblem = { thumb: string; full: string }

/** The emblem of a class key, or null for unknown or homebrew classes (those keep initials). */
export function classEmblem(key: string | null | undefined): ClassEmblem | null {
  if (!key || !isClassKey(key)) return null
  return { thumb: artUrl(`classes/thumbs/${key}`), full: artUrl(`classes/${key}`) }
}

/**
 * Emblems by character id for screens that only hold a character id (initiative, the campfire).
 * It reads the party overview from the cache the Party screen fills and fetches it once when cold
 * (no polling), so a character whose class is not known yet keeps its initials.
 */
export function useClassEmblems(campaignId: string) {
  const { state } = useAuth()
  const overview = useQuery({
    ...partyOverviewQuery(state.user?.id ?? 'anon', campaignId),
    // Shares the Party cache; when it is cold, read it once instead of polling every 10 s.
    refetchInterval: false,
    staleTime: 60_000,
  })
  const rows = overview.data
  return (characterId: string | null | undefined): ClassEmblem | null => {
    if (!characterId || !rows) return null
    return classEmblem(rows.find((row) => row.id === characterId)?.class_key)
  }
}
