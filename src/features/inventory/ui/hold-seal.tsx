import { useEffect, useRef, useState, type ReactNode } from 'react'
import { UnstyledButton } from '@mantine/core'

/**
 * A wax seal that confirms by pressing and holding (pointer), replacing a confirm dialog.
 * Keyboard and assistive technology activate immediately: their click has no pointer detail.
 */
export function HoldSeal({
  label,
  hint,
  disabled,
  onConfirm,
  children,
  duration = 600,
  tone = 'accent',
}: {
  label: string
  hint: string
  disabled?: boolean
  onConfirm: () => void
  children: ReactNode
  duration?: number
  tone?: 'accent' | 'quiet'
}) {
  const [progress, setProgress] = useState(0)
  const frame = useRef<number | null>(null)
  const started = useRef(0)
  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    setProgress(0)
  }
  useEffect(() => stop, [])
  const tick = (time: number) => {
    const value = Math.min(1, (time - started.current) / duration)
    setProgress(value)
    if (value >= 1) {
      stop()
      onConfirm()
    } else frame.current = requestAnimationFrame(tick)
  }
  return (
    <div className="hold-seal-wrap">
      <UnstyledButton
        className={`hold-seal hold-seal-${tone}`}
        aria-label={label}
        aria-describedby={undefined}
        disabled={disabled}
        style={{ '--seal-progress': `${progress * 360}deg` } as React.CSSProperties}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          started.current = event.timeStamp
          frame.current = requestAnimationFrame(tick)
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          if (event.detail === 0 && !disabled) onConfirm()
        }}
      >
        <span className="hold-seal-ring" aria-hidden="true" />
        <span className="hold-seal-face">{children}</span>
      </UnstyledButton>
      <span className="hold-seal-hint" aria-hidden="true">
        {hint}
      </span>
    </div>
  )
}
