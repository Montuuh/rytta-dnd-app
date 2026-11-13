import type { EntryInput } from '../domain/library'

/** RYT-093: unsaved entry edits outlive leaving the entry by browser back or the account menu,
 * until they are saved or discarded. Kept in memory per account; a reload is guarded by the page.
 * `revision` is the server revision the edits started from. */
const edits = new Map<string, { entry: EntryInput; revision: number }>()

export type EditsKey = { userId: string; packId: string; kind: string; entryId: string }
const keyOf = ({ userId, packId, kind, entryId }: EditsKey) =>
  `${userId}:${packId}:${kind}:${entryId}`

/** The kept edits of an entry, when they started from its current server revision. */
export function keptEdits(key: EditsKey, revision: number) {
  const kept = edits.get(keyOf(key))
  return kept && kept.revision === revision ? kept.entry : null
}

export const hasKeptEdits = (key: EditsKey) => edits.has(keyOf(key))

export function keepEdits(key: EditsKey, value: { entry: EntryInput; revision: number } | null) {
  if (value) edits.set(keyOf(key), value)
  else edits.delete(keyOf(key))
}
