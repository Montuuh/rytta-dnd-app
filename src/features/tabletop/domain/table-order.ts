// The table screen without a map (RYT-131): how the whole initiative order is laid out and what is
// announced when the turn moves. Pure functions; the screen only paints them.

/**
 * Columns and rows for `count` combatants on a screen `width` CSS pixels wide. Order reads down each
 * column, then across. Few combatants get one wide column; up to ten take two; more take three where
 * the screen is wide enough (a tablet in portrait keeps two). 16 combatants fit in 6 rows of three
 * or 8 of two, so a 720px-high screen shows them all without scrolling.
 */
export function orderLayout(count: number, width: number) {
  const n = Math.max(0, Math.floor(count))
  const columns = width < 640 || n <= 4 ? 1 : n <= 10 || width < 1000 ? 2 : 3
  return { columns, rows: Math.max(1, Math.ceil(n / columns)) }
}

/** Who acts and when, as far as the table projection says (hidden turns carry no name). */
export type TurnMark = {
  activeId: string | null
  name: string | null
  hidden: boolean
  round: number
}

export type AnnounceKey = 'tabletop.table.announce' | 'tabletop.table.announceHidden'
export type AnnounceTranslate = (
  key: AnnounceKey,
  params: { name: string; round: number },
) => string

/** The mark of a live fight, or null while nobody acts yet (initiative, ended, no fight). */
export function turnMark(
  status: string | undefined,
  round: number,
  activeId: string | null | undefined,
  active: { name: string } | undefined,
): TurnMark | null {
  if (status !== 'active') return null
  return {
    activeId: active ? (activeId ?? null) : null,
    name: active?.name ?? null,
    hidden: !active,
    round,
  }
}

export const sameTurn = (a: TurnMark | null, b: TurnMark | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.activeId === b.activeId &&
    a.hidden === b.hidden &&
    a.round === b.round)

/**
 * The sentence for a turn change, or null when nothing changed or nobody acts. A hidden creature's
 * turn is announced without a name (the projection has none).
 */
export function turnAnnouncement(
  previous: TurnMark | null,
  next: TurnMark | null,
  t: AnnounceTranslate,
): string | null {
  if (!next || sameTurn(previous, next)) return null
  return next.hidden
    ? t('tabletop.table.announceHidden', { name: '', round: next.round })
    : t('tabletop.table.announce', { name: next.name ?? '', round: next.round })
}
