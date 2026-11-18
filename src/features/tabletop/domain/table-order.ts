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

/** What a name's box reports when it is set at the normal size without breaking inside words. */
export type NameFit = {
  /** The column the name has, and the width its words need when none is broken. */
  clientWidth: number
  scrollWidth: number
  /** The height of the whole name (no line limit) and of one line of it. */
  height: number
  lineHeight: number
}

/**
 * A name takes the smaller type only when it does not fit at the normal size: a word wider than the
 * column, or more than the two lines the row allows. One pixel of rounding is not an overflow.
 */
export const nameOverflows = (fit: NameFit) =>
  fit.scrollWidth > fit.clientWidth + 1 || fit.height > fit.lineHeight * 2 + 1

/** Who acts and when, as far as the table projection says (hidden turns carry no name). */
export type TurnMark = {
  activeId: string | null
  name: string | null
  hidden: boolean
  round: number
}

/** Each announcement is a new object, so the same sentence twice in a row still reads out twice. */
export type Announcement = { text: string; seq: number }
export const nextAnnouncement = (previous: Announcement, text: string): Announcement => ({
  text,
  seq: previous.seq + 1,
})

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
