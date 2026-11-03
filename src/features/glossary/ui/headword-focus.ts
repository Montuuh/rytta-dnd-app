/**
 * The entry about to open (or just saved) takes focus on its headword. Module state because the
 * navigation can remount the page, and an id because the previous entry can re-render before the
 * (transitioned) navigation commits. Set by Enter in search, by saving homebrew and by deleting
 * a house rule inside the entry that stays open.
 */
export const headwordFocus: { id: string | null } = { id: null }
