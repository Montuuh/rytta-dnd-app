import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const threshold = 72

/** Touch-only pull-to-refresh. It is an enhancement: every screen using it also keeps a
 * visible refresh button for mouse, keyboard and assistive technology users. */
export function PullToRefresh({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation()
  const [distance, setDistance] = useState(0)
  const start = useRef<number | null>(null)
  const pulled = useRef(0)
  const latest = useRef(onRefresh)
  useEffect(() => {
    latest.current = onRefresh
  }, [onRefresh])
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) return
    const down = (event: TouchEvent) => {
      const target = event.target as Element | null
      if (window.scrollY > 0 || target?.closest('[role="dialog"], .bottom-nav')) return
      start.current = event.touches[0]?.clientY ?? null
    }
    const move = (event: TouchEvent) => {
      if (start.current === null) return
      const delta = (event.touches[0]?.clientY ?? 0) - start.current
      pulled.current = delta > 0 && window.scrollY <= 0 ? Math.min(delta * 0.5, threshold * 1.4) : 0
      setDistance(pulled.current)
    }
    const up = () => {
      if (pulled.current >= threshold) latest.current()
      pulled.current = 0
      setDistance(0)
      start.current = null
    }
    window.addEventListener('touchstart', down, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', up)
    window.addEventListener('touchcancel', up)
    return () => {
      window.removeEventListener('touchstart', down)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', up)
      window.removeEventListener('touchcancel', up)
    }
  }, [])
  if (distance <= 4) return null
  const ready = distance >= threshold
  return (
    <div
      className="pull-indicator"
      style={{ height: distance }}
      data-ready={ready || undefined}
      aria-hidden="true"
    >
      <RefreshCw size={20} style={{ transform: `rotate(${distance * 3}deg)` }} />
      <span>{t(ready ? 'common.releaseToRefresh' : 'common.pullToRefresh')}</span>
    </div>
  )
}
