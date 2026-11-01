import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

/** Short press/click/keyboard activation runs `onShort`; holding a pointer for `delay` ms runs
 * `onLong` once instead. Returns props for any button element. */
export function useLongPress(onShort: () => void, onLong: () => void, delay = 500) {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0) return
      fired.current = false
      clear()
      timer.current = window.setTimeout(() => {
        fired.current = true
        timer.current = null
        onLong()
      }, delay)
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
    onClick: () => {
      if (fired.current) {
        fired.current = false
        return
      }
      onShort()
    },
  }
}
