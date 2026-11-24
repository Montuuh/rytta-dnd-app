import type { QuestDraft } from './quest'

/** Unsaved quest edits by quest id, for this page session and this account only. The editor can
 * unmount without the DM choosing to leave (switching to the Player view and back) and must come
 * back as it was; another account signed in on the same tab never sees them. */
const unsaved = new Map<string, QuestDraft>()
let owner = ''

function claim(account: string) {
  if (account === owner) return
  unsaved.clear()
  owner = account
}

export function unsavedDraft(account: string, id: string) {
  claim(account)
  return unsaved.get(id)
}

export function keepUnsaved(account: string, id: string, draft: QuestDraft | null) {
  claim(account)
  if (draft) unsaved.set(id, draft)
  else unsaved.delete(id)
}
