import { z } from 'zod'

/** RYT-044: characters a Player may hold per campaign (also enforced in PostgreSQL). */
export const rosterLimit = 4

export const rosterEntrySchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  user_id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(100),
  is_active: z.boolean(),
  created_at: z.string(),
})
export type RosterEntry = z.infer<typeof rosterEntrySchema>

/** One Player's roster: characters in creation order and the free slots left. */
export function rosterOf<T extends RosterEntry>(entries: readonly T[], userId: string) {
  const own = entries.filter((entry) => entry.user_id === userId)
  return {
    entries: own,
    active: own.find((entry) => entry.is_active) ?? null,
    free: Math.max(0, rosterLimit - own.length),
  }
}

/** DM view: assigned characters grouped by Player, in the members' order. */
export function rostersByPlayer<T extends RosterEntry>(
  entries: readonly T[],
  players: readonly { user_id: string; display_name: string }[],
) {
  return players.map((player) => ({ player, ...rosterOf(entries, player.user_id) }))
}

/** Players who can still receive a character from the DM. */
export function playersWithFreeSlots<T extends { user_id: string }>(
  players: readonly T[],
  entries: readonly Pick<RosterEntry, 'user_id'>[],
) {
  return players.filter(
    (player) => entries.filter((entry) => entry.user_id === player.user_id).length < rosterLimit,
  )
}

export type RosterError = 'limit' | 'trading' | 'combat' | 'unavailable'
/** Maps server messages of the roster RPCs to user-facing error kinds. */
export function rosterError(message: string): RosterError {
  if (message.includes('Character limit')) return 'limit'
  if (message.includes('Trade busy')) return 'trading'
  if (message.includes('Character in combat')) return 'combat'
  return 'unavailable'
}
