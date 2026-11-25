import { focusWhenReady } from '@/shared/ui/focus-when-ready'

/** The stat block's add button that is on screen (the phone sheet or the side pane). */
const visibleAdd = () =>
  [...document.querySelectorAll<HTMLElement>('[data-bst-add]')].find(
    (node) => node.getClientRects().length > 0,
  ) ?? null

/**
 * Puts focus back on the stat block's add button after something replaced the control that had it
 * (the add itself, Undo, the dialog). It never scrolls the sheet, and a user who already moved on
 * keeps their own focus.
 */
export function focusAddButton(
  from: Element | null,
  {
    leaving,
    fallback,
  }: {
    /** The overlay that is closing; omitted, it is the dialog that holds `from`. */
    leaving?: Element | null
    fallback?: () => HTMLElement | null
  } = {},
) {
  focusWhenReady(() => visibleAdd() ?? fallback?.() ?? null, {
    from,
    ...(leaving === undefined ? {} : { leaving }),
    preventScroll: true,
    timeout: 1000,
  })
}
