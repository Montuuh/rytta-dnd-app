/** The nearest ancestor that scrolls on its own, or null when the page itself scrolls. */
export function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return el
  }
  return null
}

/** A new set of results starts at its top: bring the list's start back into view if it is above. */
export function showTopOf(node: HTMLElement) {
  const own = getComputedStyle(node).overflowY
  const root = own === 'auto' || own === 'scroll' ? node : scrollParent(node)
  if (root) {
    if (root.scrollTop > 0) root.scrollTop = 0
  } else if (node.getBoundingClientRect().top < 0) node.scrollIntoView({ block: 'start' })
}
