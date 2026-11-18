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

/**
 * The newest roll the viewer made of a kind for a character since a moment (the start of a rest,
 * of the initiative phase): the roller can always read their own rolls, so "already rolled" comes
 * from the roll log, not from what a screen remembers. Null `since` means the start is unknown and
 * nothing is derived.
 */
export function ownRollSince(
  rolls: readonly CampaignRoll[],
  query: {
    userId: string
    characterId: string | null
    kind: CampaignRoll['kind']
    since: string | null
  },
): CampaignRoll | undefined {
  if (!query.since) return undefined
  const from = Date.parse(query.since)
  if (Number.isNaN(from)) return undefined
  return rolls
    .filter(
      (roll) =>
        roll.roller_id === query.userId &&
        roll.character_id === query.characterId &&
        roll.kind === query.kind &&
        Date.parse(roll.created_at) >= from,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0]
}
