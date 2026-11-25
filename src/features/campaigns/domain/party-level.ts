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

/**
 * One character of the party overview as the Party level panel lists it. The page builds it from
 * the characters feature's data, so the campaigns feature never imports that feature.
 */
export type PartyCharacter = {
  id: string
  name: string
  /** The Player's name; `null` when no Player holds the character, `undefined` while unknown. */
  ownerName?: string | null
  /** The sheet's level; `null` for a sheet that is not finished. */
  level: number | null
  /** A finished sheet below the party level. */
  below: boolean
  /** The sheet is a draft: no level to show yet. */
  draft: boolean
  /** Where the sheet lives. */
  href: string
}

/** Characters below the party level first, then the rest; each group by name. */
export function orderPartyCharacters(rows: readonly PartyCharacter[], language = 'es') {
  return [...rows].sort(
    (a, b) => Number(b.below) - Number(a.below) || a.name.localeCompare(b.name, language),
  )
}

/** How many finished sheets there are and how many of them are below the party level. */
export function partyStanding(rows: readonly PartyCharacter[]) {
  const finished = rows.filter((row) => !row.draft)
  return { below: finished.filter((row) => row.below).length, total: finished.length }
}

/** The level a "Raise" action goes to; `null` when the level is already the highest. */
export function raiseTarget(current: number | null, suggested: number | undefined, max = 20) {
  if (current === null) return suggested ?? 1
  return current >= max ? null : current + 1
}
