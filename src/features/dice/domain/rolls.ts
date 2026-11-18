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
