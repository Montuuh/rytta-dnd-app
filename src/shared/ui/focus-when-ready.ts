/**
 * Focus a control that may not exist yet: it appears after a refetch, or once a closing dialog's
 * transition ends. A single animation frame is not enough on a slow device, so this retries every
 * frame until `timeout`, then keeps the focus for a short `settle` window (and for as long as the
 * closing dialog is still mounted) in case it drops focus back onto the page. It gives up as soon as focus lands on another control,
 * so a user who has already moved on is never pulled back. Pass `from` (the control focused when
 * the action started) when the call comes after an await: by then the user may have moved. Pass
 * `leaving` (the overlay that is closing) when its focus trap can still land inside it late; by
 * default it is the dialog that holds `from`.
 */
export function focusWhenReady(
  target: string | (() => HTMLElement | null | undefined),
  {
    preventScroll = false,
    timeout = 3000,
    settle = 300,
    from = document.activeElement,
    // Called as an overlay closes, focus is still inside it: a slow unmount must not read as "the
    // user moved on" (which ends the return and lets the removal drop focus on the page).
    leaving = from?.closest('[role="dialog"]') ?? null,
  }: {
    preventScroll?: boolean
    timeout?: number
    settle?: number
    from?: Element | null
    leaving?: Element | null
  } = {},
) {
  const resolve = () =>
    (typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target()) ?? null
  const start = performance.now()
  let heldSince = 0

  // Focus that sits on the page, on the control that asked, on something removed, on a
  // dialog's own container or inside the closing overlay has fallen back rather than been moved
  // on purpose.
  const fallen = (active: Element | null) =>
    !active ||
    active === document.body ||
    active === from ||
    !active.isConnected ||
    active.getAttribute('role') === 'dialog' ||
    Boolean(leaving?.contains(active))

  const tick = () => {
    const now = performance.now()
    const el = resolve()
    const active = document.activeElement
    if (el && active === el) {
      heldSince ||= now
      // Done once the hold window has passed AND the closing overlay is gone: its late removal
      // would otherwise drop focus on the page with nobody left to give it back.
      if (now - heldSince >= settle && !leaving?.isConnected) return
    } else if (fallen(active) || (heldSince && active === document.body)) {
      if (el?.isConnected) {
        el.focus({ preventScroll })
        if (document.activeElement === el) heldSince ||= now
      }
    } else {
      return
    }
    if (now - start < timeout) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
