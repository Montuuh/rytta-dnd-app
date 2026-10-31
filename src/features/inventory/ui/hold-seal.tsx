import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { UnstyledButton } from '@mantine/core'

/**
 * A wax seal that confirms by pressing and holding (pointer), replacing a confirm dialog.
 * Keyboard activation is immediate. A quick tap (including screen-reader double taps,
 * which arrive as short pointer presses) arms an explicit "use now" action instead of
 * silently doing nothing. Sliding off the seal cancels the hold.
 */
export function HoldSeal({
  label,
  hint,
  confirmLabel,
  disabled,
  onConfirm,
  children,
  duration = 600,
}: {
  label: string
  hint: string
  confirmLabel: string
  disabled?: boolean
  onConfirm: () => void
  children: ReactNode
  duration?: number
}) {
  const hintId = useId()
  const [progress, setProgress] = useState(0)
  const [armed, setArmed] = useState(false)
  const frame = useRef<number | null>(null)
  const started = useRef(0)
  const holding = useRef(false)
  const pressed = useRef(false)
  const seal = useRef<HTMLButtonElement>(null)
  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    holding.current = false
    setProgress(0)
  }
  useEffect(() => stop, [])
  const confirm = () => {
    setArmed(false)
    onConfirm()
  }
  const tick = (time: number) => {
    const value = Math.min(1, (time - started.current) / duration)
    setProgress(value)
    if (value >= 1) {
      stop()
      confirm()
    } else frame.current = requestAnimationFrame(tick)
  }
  return (
    <div className="hold-seal-wrap">
      <UnstyledButton
        ref={seal}
        className="hold-seal"
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        style={{ '--seal-progress': `${progress * 360}deg` } as React.CSSProperties}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          pressed.current = true
          holding.current = true
          started.current = event.timeStamp
          frame.current = requestAnimationFrame(tick)
        }}
        onPointerMove={(event) => {
          if (!holding.current) return
          const box = event.currentTarget.getBoundingClientRect()
          const outside =
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          if (outside) stop()
        }}
        onPointerUp={() => {
          // Released before the ring closed: offer the explicit path rather than nothing.
          if (holding.current) setArmed(true)
          stop()
        }}
        onPointerCancel={stop}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          // Keyboard clicks (detail 0) and synthetic clicks without a prior press, such as
          // some switch or screen-reader activations, confirm immediately.
          const unpressed = !pressed.current
          pressed.current = false
          if (!disabled && (event.detail === 0 || unpressed)) confirm()
        }}
      >
        <span className="hold-seal-ring" aria-hidden="true" />
        <span className="hold-seal-face">{children}</span>
      </UnstyledButton>
      <span className="hold-seal-hint" id={hintId}>
        {hint}
      </span>
      <div aria-live="polite">
        {armed && (
          <UnstyledButton
            className="quiet-link seal-confirm"
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (disabled) return
              confirm()
              // The "use now" link unmounts; keep focus on the seal it came from.
              requestAnimationFrame(() => seal.current?.focus())
            }}
          >
            {confirmLabel}
          </UnstyledButton>
        )}
      </div>
    </div>
  )
}
