import type { ReactNode } from 'react'
import { UnstyledButton } from '@mantine/core'
import './rail-line.css'

/**
 * What the last action did, as one ruled line with a rail: the sentence is a live region that stays
 * mounted and only swaps its text (a region that appears with its text is not always announced).
 * `serial` changes with every message, so the same sentence said twice is announced and shown as
 * new again. Without text the line takes no room. The actions (Undo, a link, close) sit beside the
 * sentence and wrap under it as whole words, never letter by letter.
 */
export function StatusRail({
  text,
  serial = 0,
  tone = 'ok',
  className = '',
  children,
}: {
  text: ReactNode
  serial?: number
  tone?: 'ok' | 'warn'
  className?: string
  children?: ReactNode
}) {
  const shown = Boolean(text)
  return (
    <div
      className={`status-rail ${className}`.trim()}
      data-tone={tone}
      data-empty={!shown || undefined}
    >
      <p role="status">
        <span key={serial} className="status-rail-text">
          {text}
        </span>
      </p>
      {shown && children ? <div className="status-rail-actions">{children}</div> : null}
    </div>
  )
}

/** Active filters as one muted line with a text button that clears them all. */
export function FilterLine({
  text,
  clearLabel,
  clearName,
  onClear,
  className = '',
}: {
  text: string
  clearLabel: string
  /** The button's accessible name when it needs more than the visible word. */
  clearName?: string
  onClear: () => void
  className?: string
}) {
  return (
    <p className={`filter-line ${className}`.trim()}>
      <span>{text}</span>
      <UnstyledButton className="quiet-link" aria-label={clearName} onClick={onClear}>
        {clearLabel}
      </UnstyledButton>
    </p>
  )
}
