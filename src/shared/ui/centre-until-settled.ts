/**
 * Scrolls an element reached by a link or a jump into place and keeps it there while the sections around it replace their
 * estimated spacers with real rows, until the user takes over the scroll (or ~650 ms pass).
 */
export function centreUntilSettled(row: HTMLElement, block: ScrollLogicalPosition = 'center') {
  let frame = 0
  let frames = 0
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
  const stop = () => {
    cancelAnimationFrame(frame)
    for (const name of events) window.removeEventListener(name, stop)
  }
  const step = () => {
    if (!row.isConnected) return stop()
    row.scrollIntoView({ block })
    if (++frames < 40) frame = requestAnimationFrame(step)
    else stop()
  }
  for (const name of events) window.addEventListener(name, stop, { passive: true })
  step()
}
