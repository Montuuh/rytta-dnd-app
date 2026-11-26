/** A campaign member, as far as the first-session steps need it. */
type StepMember = { user_id: string; role: string }

/** A roster character, as far as the first-session steps need it. */
type StepCharacter = { user_id: string | null; archived_at: string | null; absent: boolean }

/**
 * Where the three first-session steps stand: a player has joined, the DM has chosen at least one
 * shipped module for players, and every joined player has a character. `unlinked` lists the
 * players still without a character; `available` says whether a free character is ready for them.
 */
export function firstSessionSteps<Member extends StepMember>({
  members,
  pendingInvitations,
  roster,
  modules,
  implemented,
}: {
  members: readonly Member[]
  pendingInvitations: number
  roster: readonly StepCharacter[]
  /** The campaign's player modules. */
  modules: readonly string[]
  /** The module keys that have shipped: a planned module does not count as a choice. */
  implemented: ReadonlySet<string>
}) {
  const players = members.filter((member) => member.role === 'player')
  const unlinked = players.filter(
    (member) =>
      !roster.some((character) => character.user_id === member.user_id && !character.archived_at),
  )
  const joined = players.length > 0
  const linked = joined && unlinked.length === 0
  const modulesChosen = modules.some((key) => implemented.has(key))
  return {
    joined,
    pending: pendingInvitations,
    modules: modulesChosen,
    linked,
    available: roster.some(
      (character) => !character.user_id && !character.archived_at && !character.absent,
    ),
    unlinked,
    nextMember: unlinked[0],
    complete: joined && modulesChosen && linked,
  }
}

export type FirstSessionSteps = ReturnType<typeof firstSessionSteps>
