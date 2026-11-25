import { useEffect } from 'react'

/** Text fields keep "/" as a character. */
const typing = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/**
 * Ctrl+K (Cmd+K) opens the switcher anywhere. "/" opens it when focus is not in a field and the
 * screen has no "/" shortcut of its own: a search field in the main area (the bestiary, the
 * glossary) keeps the key, and so does any handler that already claimed it. Another dialog or
 * drawer being open leaves both keys alone.
 */
export function useSwitcherShortcuts(enabled: boolean, opened: boolean, open: () => void) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || opened) return
      const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey
      const chord =
        event.key.toLowerCase() === 'k' &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey
      if (!slash && !chord) return
      if (document.querySelector('[role="dialog"]')) return
      if (slash) {
        if (event.repeat) return
        const target = event.target as Element | null
        if (target?.closest(typing)) return
        if (document.querySelector('#main-content input[type="search"]')) return
      }
      event.preventDefault()
      open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, opened, open])
}
