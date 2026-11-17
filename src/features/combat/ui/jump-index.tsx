import type { KeyboardEvent } from 'react'

/**
 * RYT-117: a strip of group buttons (letters, challenge ratings) that jumps to a section even when
 * its rows are not mounted yet. One Tab stop; arrows, Home and End move between buttons.
 */
export function JumpIndex({
  label,
  items,
  onJump,
}: {
  label: string
  items: string[]
  onJump: (index: number) => void
}) {
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
    const at = buttons.indexOf(event.target as HTMLButtonElement)
    if (at < 0) return
    const go = (index: number) => {
      event.preventDefault()
      buttons.forEach((button, i) => (button.tabIndex = i === index ? 0 : -1))
      buttons[index]!.focus()
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      go(Math.min(at + 1, buttons.length - 1))
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') go(Math.max(at - 1, 0))
    else if (event.key === 'Home') go(0)
    else if (event.key === 'End') go(buttons.length - 1)
    // Arrow keys here must not also move the list's row focus.
    event.stopPropagation()
  }
  return (
    <nav className="bst-jump" aria-label={label} onKeyDown={onKey}>
      {items.map((item, index) => (
        <button
          key={item}
          type="button"
          className="bst-jump-item"
          tabIndex={index === 0 ? 0 : -1}
          onClick={() => onJump(index)}
        >
          {item}
        </button>
      ))}
    </nav>
  )
}
