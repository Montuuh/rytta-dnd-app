import type { CreatureListItem } from '@/features/bestiary'
import type { SrdBestiary } from './combat'

/**
 * RYT-089: the campaign's bestiary. Its own creatures always; the official ones only once its DM
 * downloaded them, minus those removed since, and a creature with a campaign version shows that
 * version in its place. The official catalogue itself never changes.
 */
export function campaignBestiary<S extends CreatureListItem, T extends CreatureListItem>(
  own: T[],
  official: S[],
  state: SrdBestiary | undefined,
): (S | T)[] {
  if (!state?.downloaded) return own
  const removed = new Set(state.removed)
  const versioned = new Set(own.filter((item) => item.version).map((item) => item.srdId))
  return [...own, ...official.filter((item) => !removed.has(item.id) && !versioned.has(item.id))]
}
