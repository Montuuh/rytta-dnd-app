/**
 * An overlay's own Escape listener is installed after it has rendered, so an Escape pressed in the
 * same frame as the control that opens it reaches nobody and the overlay stays open. Call this from
 * the opening handler: for a moment Escape closes the overlay from the page, then the overlay's own
 * listener takes over. Returns a function that stops it earlier (the overlay was closed another way).
 */
export function closeOnEscapeWhileOpening(close: () => void, duration = 600) {
  let timer = 0
  const stop = () => {
    window.clearTimeout(timer)
    window.removeEventListener('keydown', onKey, { capture: true })
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing) return
    // The overlay's own listener (registered later) must not close it a second time.
    event.stopImmediatePropagation()
    event.preventDefault()
    stop()
    close()
  }
  window.addEventListener('keydown', onKey, { capture: true })
  timer = window.setTimeout(stop, duration)
  return stop
}
