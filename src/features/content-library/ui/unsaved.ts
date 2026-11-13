import { useSyncExternalStore } from 'react'
import type { EntryInput } from '../domain/library'

/** RYT-093: unsaved entry edits outlive leaving the entry by browser back or the account menu,
 * until they are saved or discarded. Kept in memory per account; a reload is guarded by the page.
 * `revision` is the server revision the edits started from. */
const edits = new Map<string, { entry: EntryInput; revision: number }>()
const listeners = new Set<() => void>()
let version = 0

export type EditsKey = { userId: string; packId: string; kind: string; entryId: string }
const keyOf = ({ userId, packId, kind, entryId }: EditsKey) =>
  `${userId}:${packId}:${kind}:${entryId}`

/** The kept edits of an entry and the revision they started from. */
export const keptEdits = (key: EditsKey) => edits.get(keyOf(key)) ?? null

export const hasKeptEdits = (key: EditsKey) => edits.has(keyOf(key))

export function keepEdits(key: EditsKey, value: { entry: EntryInput; revision: number } | null) {
  const id = keyOf(key)
  const had = edits.has(id)
  if (value) edits.set(id, value)
  else edits.delete(id)
  // Lists only show whether an entry has kept edits: tell them when that changes.
  if (had !== edits.has(id)) {
    version += 1
    listeners.forEach((listener) => listener())
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
/** Re-renders the caller when an entry gains or loses kept edits. */
export const useKeptEditsVersion = () => useSyncExternalStore(subscribe, () => version)
