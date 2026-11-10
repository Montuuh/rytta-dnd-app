import { z } from 'zod'

/** RYT-044: characters a Player may hold per campaign (also enforced in PostgreSQL). Archived
 * characters do not count. */
export const rosterLimit = 4

export const rosterEntrySchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  user_id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(100),
  is_active: z.boolean(),
  archived_at: z.string().nullable(),
  /** RYT-079: the DM marked the character as not coming to the session. */
  absent: z.boolean().default(false),
  created_at: z.string(),
})
export type RosterEntry = z.infer<typeof rosterEntrySchema>

/** One Player's roster: characters in the roster (creation order), archived ones and the free
 * slots left. */
export function rosterOf<T extends RosterEntry>(entries: readonly T[], userId: string) {
  const own = entries.filter((entry) => entry.user_id === userId)
  const active = own.filter((entry) => !entry.archived_at)
  return {
    entries: active,
    archived: own.filter((entry) => entry.archived_at),
    active: active.find((entry) => entry.is_active) ?? null,
    free: Math.max(0, rosterLimit - active.length),
    /** RYT-079: the DM marked the Player's character absent and none is active: the Player
     * cannot switch until the DM marks it present or picks another one. */
    benched: !active.some((entry) => entry.is_active) && active.some((entry) => entry.absent),
  }
}

/** DM view: characters without a Player that are still in the campaign (not archived). */
export const unassignedOf = <T extends RosterEntry>(entries: readonly T[]) =>
  entries.filter((entry) => !entry.user_id && !entry.archived_at)

/** DM view: assigned characters grouped by Player, in the members' order, active one first. */
export function rostersByPlayer<T extends RosterEntry>(
  entries: readonly T[],
  players: readonly { user_id: string; display_name: string }[],
) {
  return players.map((player) => {
    const roster = rosterOf(entries, player.user_id)
    return {
      player,
      ...roster,
      entries: [...roster.entries].sort((a, b) => Number(b.is_active) - Number(a.is_active)),
    }
  })
}

/** Players who can still receive a character from the DM (archived ones do not count). */
export function playersWithFreeSlots<T extends { user_id: string }>(
  players: readonly T[],
  entries: readonly { user_id: string | null; archived_at?: string | null }[],
) {
  return players.filter(
    (player) =>
      entries.filter((entry) => entry.user_id === player.user_id && !entry.archived_at).length <
      rosterLimit,
  )
}

/** Whether an archived character can come back now: its owner needs a free slot. */
export function canRestore(entry: RosterEntry, entries: readonly RosterEntry[]) {
  if (!entry.user_id) return true
  return rosterOf(entries, entry.user_id).free > 0
}

export type RosterError = 'limit' | 'trading' | 'combat' | 'active' | 'absent' | 'unavailable'
/** Maps server messages of the roster RPCs to user-facing error kinds. */
export function rosterError(message: string): RosterError {
  if (message.includes('Character absent')) return 'absent'
  if (message.includes('Character limit')) return 'limit'
  if (message.includes('Trade busy')) return 'trading'
  if (message.includes('Character in combat')) return 'combat'
  if (message.includes('Active character')) return 'active'
  return 'unavailable'
}
