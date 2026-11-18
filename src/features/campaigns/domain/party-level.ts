/** A row of the party overview, as far as the party level needs it. */
export type PartyLevelRow = {
  sheet_status: 'draft' | 'complete' | null
  level: number | null
  below_party_level?: boolean
}

/** Finished characters the server marks below the party level; undefined until the list loads. */
export function partyBelow(rows: readonly PartyLevelRow[] | undefined) {
  return rows ? rows.filter((row) => row.below_party_level).length : undefined
}

/** The highest level among finished sheets: where the party level starts while it is unset. */
export function partySuggested(rows: readonly PartyLevelRow[] | undefined) {
  if (!rows) return undefined
  const top = Math.max(
    0,
    ...rows.flatMap((row) => (row.sheet_status === 'complete' && row.level ? [row.level] : [])),
  )
  return top || undefined
}

/**
 * One request id per intent. An intent is the change from the level the campaign holds now to
 * the level asked for, so a retry after a failure repeats the same id, while a request made
 * after the level moved (or to another level) never replays an older answer. `reset` drops every
 * id (the question closed or the campaign's level changed).
 */
export function createPartyRequestIds(newId: () => string) {
  const ids = new Map<string, string>()
  const key = (current: number | null, target: number | null) => `${current}>${target}`
  return {
    idFor(current: number | null, target: number | null) {
      const k = key(current, target)
      let id = ids.get(k)
      if (!id) {
        id = newId()
        ids.set(k, id)
      }
      return id
    },
    done(current: number | null, target: number | null) {
      ids.delete(key(current, target))
    },
    reset() {
      ids.clear()
    },
  }
}
