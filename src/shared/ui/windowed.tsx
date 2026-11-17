import { scrollParent } from './scroll-parent'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const anchorOff = new WeakMap<HTMLElement, number>()
/**
 * Switches scroll anchoring off on a scroller while any section needs it; returns the release.
 * The page scroller is the document element and, in some engines, the body: both are switched.
 */
function disableAnchoring(scroller: HTMLElement | null) {
  const targets = scroller ? [scroller] : [document.documentElement, document.body]
  for (const target of targets) {
    anchorOff.set(target, (anchorOff.get(target) ?? 0) + 1)
    target.style.overflowAnchor = 'none'
  }
  return () => {
    for (const target of targets) {
      const left = (anchorOff.get(target) ?? 1) - 1
      anchorOff.set(target, left)
      if (left === 0) target.style.overflowAnchor = ''
    }
  }
}

/**
 * RYT-117: long lists mount only the sections near the viewport. A section outside the margin is
 * replaced by a spacer of its last measured height (its estimate until first measured), so the
 * scroll length and the user's place stay put while the DOM stays bounded. Headings and counts
 * belong outside this wrapper so they always exist for navigation and screen readers.
 */
export function Windowed({
  estimate,
  pinned = false,
  initiallyMounted = false,
  onMeasure,
  margin,
  children,
}: {
  /** Height used before the section was ever on screen. */
  estimate: number
  /** Keeps the children mounted regardless of distance (the open entry, a jump or focus target). */
  pinned?: boolean
  initiallyMounted?: boolean
  /** The measured height of the section once it was rendered, for better estimates elsewhere. */
  onMeasure?: (height: number) => void
  /** How far outside the scroll area, in px, a section stays rendered (default: 1.5 screens). */
  margin?: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const supported = typeof IntersectionObserver !== 'undefined'
  const [near, setNear] = useState(initiallyMounted || !supported)
  // The last measured height of the section: a spacer always has it once the section was seen.
  const [height, setHeight] = useState<number | null>(null)
  // Never-measured sections use the estimate of the moment the list was first drawn; it keeps
  // improving for two frames (the first sections report their real rows) and is then frozen, so
  // a later estimate never resizes a spacer behind the reader's back.
  const latestEstimate = useRef(estimate)
  const [frozen, setFrozen] = useState<number | null>(null)
  useEffect(() => {
    latestEstimate.current = estimate
  })
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setFrozen(latestEstimate.current))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])
  const rendered = useRef(false)
  // The section that holds focus is never unmounted from under it; it is released after focus moves.
  const [held, setHeld] = useState(false)
  const measure = useRef(onMeasure)
  useEffect(() => {
    measure.current = onMeasure
  })
  const mounted = near || pinned || held
  useEffect(() => {
    rendered.current = mounted
  }, [mounted])
  // A section that has just been rendered tells how tall its rows really are, so spacers of
  // sections not rendered yet get a better estimate before the first frame. ONE mechanism keeps
  // the reader's place when a height changes above the viewport: the exact difference is added
  // to the scroll position here, in the same frame, before paint. The browser's own scroll
  // anchoring is switched off on the scroller (see `connect`) so the two never both correct it,
  // and every engine behaves the same.
  const shown = useRef<number | null>(null)
  /** Compares the section's height with the last one seen and corrects the scroll by the gap. */
  const reconcile = useRef(() => {})
  useEffect(() => {
    reconcile.current = () => {
      const node = ref.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const before = shown.current
      shown.current = rect.height
      if (before === null) return
      const delta = rect.height - before
      const root = scrollParent(node)
      const top = root ? root.getBoundingClientRect().top : 0
      if (Math.abs(delta) < 1 || rect.top >= top) return
      if (root) root.scrollTop += delta
      else window.scrollBy(0, delta)
    }
  })
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    if (mounted) measure.current?.(Math.round(node.getBoundingClientRect().height))
    reconcile.current()
  })
  // Heights that change without a render (fonts, images, text that wraps differently) are
  // reconciled by the observer, which runs before the next paint.
  useEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => reconcile.current())
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const node = ref.current
    if (!node || !supported) return
    let observer: IntersectionObserver | null = null
    let root: HTMLElement | null | undefined
    let restoreAnchoring: (() => void) | null = null
    const connect = () => {
      const next = scrollParent(node)
      if (observer && next === root) return
      restoreAnchoring?.()
      root = next
      restoreAnchoring = disableAnchoring(next)
      const edge = margin ?? Math.round(Math.max(1000, (next?.clientHeight ?? innerHeight) * 1.5))
      observer?.disconnect()
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1]
          if (!entry) return
          if (entry.isIntersecting) setNear(true)
          else {
            if (rendered.current) {
              const measured = Math.round(entry.boundingClientRect.height)
              setHeight(measured)
              measure.current?.(measured)
            }
            setNear(false)
          }
        },
        { root, rootMargin: `${edge}px 0px ${edge}px 0px` },
      )
      observer.observe(node)
    }
    connect()
    const take = () => setHeld(true)
    const release = () =>
      window.setTimeout(() => {
        if (!node.contains(document.activeElement)) setHeld(false)
      }, 0)
    node.addEventListener('focusin', take)
    node.addEventListener('focusout', release)
    // A phone list scrolls with the page and a wide one inside its own column: follow the change.
    window.addEventListener('resize', connect)
    return () => {
      node.removeEventListener('focusin', take)
      node.removeEventListener('focusout', release)
      window.removeEventListener('resize', connect)
      observer?.disconnect()
      restoreAnchoring?.()
    }
  }, [margin, supported])
  return (
    <div ref={ref} style={mounted ? undefined : { height: height ?? frozen ?? estimate }}>
      {mounted ? children : null}
    </div>
  )
}
