import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { U } from './palette'

export interface ViewState {
  /** Translation of the world in CSS pixels. */
  x: number
  y: number
  /** Scale: CSS pixels per world pixel (U per square). */
  z: number
}

export type WorldPoint = [number, number]

export interface GestureHandlers {
  /** A one-finger press; return true to own the drag (otherwise it pans when allowed). */
  onStart?: (point: WorldPoint, event: PointerEvent) => boolean
  onMove?: (point: WorldPoint) => void
  onEnd?: (point: WorldPoint, moved: boolean) => void
  onTap?: (point: WorldPoint, event: PointerEvent) => void
  onCancel?: () => void
  /** A mouse or pen over the board with no button pressed (null when it leaves): previews. */
  onHover?: (point: WorldPoint | null) => void
}

const minZ = 0.08
const maxZ = 4

function fitView(el: HTMLElement, size: { cols: number; rows: number }): ViewState {
  const w = el.clientWidth
  const h = el.clientHeight
  const z = Math.max(
    minZ,
    Math.min(maxZ, Math.min(w / (size.cols * U), h / (size.rows * U)) * 0.96),
  )
  return { z, x: (w - size.cols * U * z) / 2, y: (h - size.rows * U * z) / 2 }
}

function zoomView(
  el: HTMLElement,
  v: ViewState,
  factor: number,
  clientX?: number,
  clientY?: number,
) {
  const rect = el.getBoundingClientRect()
  const cx = clientX === undefined ? rect.width / 2 : clientX - rect.left
  const cy = clientY === undefined ? rect.height / 2 : clientY - rect.top
  const z = Math.max(minZ, Math.min(maxZ, v.z * factor))
  const k = z / v.z
  return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
}

/**
 * Pan and zoom for a board: wheel zoom at the cursor, two-finger pinch and pan, one-finger pan on
 * empty ground (when the tool allows it) and tool gestures in squares. Attach `ref` and `bind` to
 * the viewport element.
 */
export function useBoardView(
  size: { cols: number; rows: number } | null,
  handlers: GestureHandlers,
  panOnEmpty: boolean,
) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, z: 0.5 })
  const latest = useRef({ view, handlers, panOnEmpty })
  useLayoutEffect(() => {
    latest.current = { view, handlers, panOnEmpty }
  })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    id: number
    sx: number
    sy: number
    moved: boolean
    claimed: boolean
    pan: boolean
    vx: number
    vy: number
  } | null>(null)
  const pinch = useRef<{ d: number; cx: number; cy: number; view: ViewState } | null>(null)
  /** Until the person pans or zooms, the board refits whenever its box changes size. */
  const touched = useRef(false)
  const cols = size?.cols ?? 0
  const rows = size?.rows ?? 0

  // Fit per scene size and on resize, until the person moves the view themselves.
  useEffect(() => {
    if (!el || !cols || !rows) return
    touched.current = false
    const run = () => {
      if (touched.current || el.clientWidth === 0) return
      setView(fitView(el, { cols, rows }))
    }
    const observer = new ResizeObserver(run)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el, cols, rows])

  useEffect(() => {
    if (!el) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015))
      touched.current = true
      setView((v) => zoomView(el, v, factor, event.clientX, event.clientY))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [el])

  const toWorld = (clientX: number, clientY: number): WorldPoint => {
    const v = latest.current.view
    if (!el) return [0, 0]
    const rect = el.getBoundingClientRect()
    return [(clientX - rect.left - v.x) / v.z / U, (clientY - rect.top - v.y) / v.z / U]
  }

  const fit = () => {
    if (el && cols && rows) setView(fitView(el, { cols, rows }))
  }
  const zoomAt = (factor: number) => {
    touched.current = true
    if (el) setView((v) => zoomView(el, v, factor))
  }
  /** Pans (keeping the zoom) so a box in squares is inside the viewport, centring it if not. */
  const reveal = (x: number, y: number, w = 1, h = 1) => {
    if (!el) return
    const v = latest.current.view
    const left = v.x + x * U * v.z
    const top = v.y + y * U * v.z
    const right = left + w * U * v.z
    const bottom = top + h * U * v.z
    const margin = 24
    if (
      left >= margin &&
      top >= margin &&
      right <= el.clientWidth - margin &&
      bottom <= el.clientHeight - margin
    )
      return
    touched.current = true
    setView({
      z: v.z,
      x: el.clientWidth / 2 - (x + w / 2) * U * v.z,
      y: el.clientHeight / 2 - (y + h / 2) * U * v.z,
    })
  }
  /** The square at the centre of the viewport. */
  const center = (): WorldPoint => {
    if (!el) return [cols / 2, rows / 2]
    const v = latest.current.view
    return [(el.clientWidth / 2 - v.x) / v.z / U, (el.clientHeight / 2 - v.y) / v.z / U]
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const { handlers: h, view: v, panOnEmpty: pan } = latest.current
    if (pointers.current.size === 2) {
      if (gesture.current?.claimed) h.onCancel?.()
      gesture.current = null
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        d: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        cx: (a!.x + b!.x) / 2,
        cy: (a!.y + b!.y) / 2,
        view: v,
      }
      return
    }
    if (pointers.current.size > 2) return
    const middle = event.pointerType === 'mouse' && event.button === 1
    const claimed = !middle && (h.onStart?.(toWorld(event.clientX, event.clientY), event) ?? false)
    gesture.current = {
      id: event.pointerId,
      sx: event.clientX,
      sy: event.clientY,
      moved: false,
      claimed,
      pan: !claimed && (pan || middle),
      vx: v.x,
      vy: v.y,
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) {
      if (event.pointerType !== 'touch')
        latest.current.handlers.onHover?.(toWorld(event.clientX, event.clientY))
      return
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const p = pinch.current
    if (p && pointers.current.size >= 2 && el) {
      touched.current = true
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      const cx = (a!.x + b!.x) / 2
      const cy = (a!.y + b!.y) / 2
      const rect = el.getBoundingClientRect()
      const z = Math.max(minZ, Math.min(maxZ, p.view.z * (d / Math.max(p.d, 1))))
      const k = z / p.view.z
      const ox = p.cx - rect.left
      const oy = p.cy - rect.top
      setView({
        z,
        x: ox - (ox - p.view.x) * k + (cx - p.cx),
        y: oy - (oy - p.view.y) * k + (cy - p.cy),
      })
      return
    }
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    if (!g.moved && Math.hypot(event.clientX - g.sx, event.clientY - g.sy) > 5) g.moved = true
    if (!g.moved) return
    if (g.claimed) latest.current.handlers.onMove?.(toWorld(event.clientX, event.clientY))
    else if (g.pan) {
      touched.current = true
      setView((v) => ({ ...v, x: g.vx + event.clientX - g.sx, y: g.vy + event.clientY - g.sy }))
    }
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null
      return
    }
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    gesture.current = null
    const point = toWorld(event.clientX, event.clientY)
    const h = latest.current.handlers
    if (g.claimed) h.onEnd?.(point, g.moved)
    else if (!g.moved) h.onTap?.(point, event)
  }

  const onPointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' && !pointers.current.has(event.pointerId))
      latest.current.handlers.onHover?.(null)
  }

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (gesture.current?.claimed) latest.current.handlers.onCancel?.()
    gesture.current = null
    if (pointers.current.size < 2) pinch.current = null
  }

  return {
    view,
    fit,
    zoomAt,
    center,
    reveal,
    /** Spread on the viewport element: its callback ref and pointer handlers. */
    bind: {
      ref: setEl,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
    },
  }
}
