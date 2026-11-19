import { useEffect, useState } from 'react'
import { UNDO_WINDOW_MS } from '../domain/item'

/** Milliseconds left in the undo window, ticking each second; calls `onExpire` when it runs out. */
export function useFuseLeft(startedAt: number, onExpire: () => void) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const left = Math.max(0, startedAt + UNDO_WINDOW_MS - now)
  useEffect(() => {
    if (left === 0) onExpire()
  }, [left, onExpire])
  return left
}
