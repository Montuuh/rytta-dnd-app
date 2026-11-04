/**
 * Focus a control that may not exist yet: it appears after a refetch, or once a closing dialog's
 * transition ends. A single animation frame is not enough on a slow device, so this retries every
 * frame until `timeout`, then keeps the focus for a short `settle` window in case a closing
 * dialog drops it back onto the page. It gives up as soon as focus lands on another control,
 * so a user who has already moved on is never pulled back. Pass `from` (the control focused when
 * the action started) when the call comes after an await: by then the user may have moved.
 */
export function focusWhenReady(
  target: string | (() => HTMLElement | null | undefined),
  {
    preventScroll = false,
    timeout = 3000,
    settle = 300,
    from = document.activeElement,
  }: { preventScroll?: boolean; timeout?: number; settle?: number; from?: Element | null } = {},
) {
  const resolve = () =>
    (typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target()) ?? null
  const start = performance.now()
  let heldSince = 0

  // Focus that sits on the page, on the control that asked, on something removed or on a
  // dialog's own container has fallen back rather than been moved on purpose.
  const fallen = (active: Element | null) =>
    !active ||
    active === document.body ||
    active === from ||
    !active.isConnected ||
    active.getAttribute('role') === 'dialog'

  const tick = () => {
    const now = performance.now()
    const el = resolve()
    const active = document.activeElement
    if (el && active === el) {
      heldSince ||= now
      if (now - heldSince >= settle) return
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
