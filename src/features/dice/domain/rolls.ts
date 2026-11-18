import type { CampaignRoll } from '@/features/campaigns'

/** Merge a roll into the newest-first list the server returned: replaces the same roll, keeps the
 * order the server uses (time, then id) and never grows past `limit`. */
export function mergeRoll(
  rolls: readonly CampaignRoll[],
  roll: CampaignRoll,
  limit = 50,
): CampaignRoll[] {
  const rest = rolls.filter((item) => item.id !== roll.id)
  return [...rest, roll]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .slice(0, limit)
}

export type Roller = { kind: 'dm' } | { kind: 'character'; name: string } | { kind: 'unknown' }

/** Whose roll it is: the DM only when the roll has no character; a character the viewer cannot
 * name (a private sheet, a benched character) is neutral rather than credited to the DM. */
export function rollerOf(characterId: string | null, names: ReadonlyMap<string, string>): Roller {
  if (characterId === null) return { kind: 'dm' }
  const name = names.get(characterId)
  return name ? { kind: 'character', name } : { kind: 'unknown' }
}
