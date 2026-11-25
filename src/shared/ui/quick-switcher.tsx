import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { TextInput, VisuallyHidden } from '@mantine/core'
import { Search } from 'lucide-react'
import { Modal } from './overlays'
import { filterEntries } from './quick-switcher-filter'
import './quick-switcher.css'

export type SwitcherEntry = {
  id: string
  label: string
  /** Extra words that find the entry without being shown. */
  keywords?: string
  icon?: ReactNode
}

export type SwitcherGroup = { id: string; label: string; entries: SwitcherEntry[] }

type Props = {
  opened: boolean
  /** Escape, the close button, the backdrop and system Back. Must be idempotent. */
  onClose: () => void
  /** Enter or a tap on an entry. The caller closes the switcher and acts. */
  onChoose: (entry: SwitcherEntry) => void
  /** Runs once the dialog is gone after a choice, for moving focus on the new screen. */
  onSettled?: () => void
  title: string
  searchLabel: string
  closeLabel: string
  groups: SwitcherGroup[]
  /** Visible and announced when nothing matches. */
  emptyText: (query: string) => string
  /** Announced as the list changes while typing. */
  countText: (count: number) => string
}

/**
 * A search field over a grouped list, in a dialog: the WAI-ARIA combobox with a listbox popup.
 * Focus stays in the field and the active option is named with `aria-activedescendant`. Escape
 * closes and hands focus back to the control that was focused when it opened; after a choice the
 * caller decides where focus goes (`onSettled`).
 */
export function QuickSwitcher({
  opened,
  onClose,
  onChoose,
  onSettled,
  title,
  searchLabel,
  closeLabel,
  groups,
  emptyText,
  countText,
}: Props) {
  const uid = useId()
  const listId = `${uid}-list`
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const opener = useRef<HTMLElement | null>(null)
  const chosen = useRef(false)
  const list = useRef<HTMLDivElement>(null)

  const visible = useMemo(
    () =>
      groups
        .map((group) => ({ ...group, entries: filterEntries(group.entries, query) }))
        .filter((group) => group.entries.length > 0),
    [groups, query],
  )
  const flat = useMemo(() => visible.flatMap((group) => group.entries), [visible])
  const optionId = (entry: SwitcherEntry) => `${uid}-opt-${entry.id}`
  const active = flat.length > 0 ? flat[Math.min(activeIndex, flat.length - 1)] : undefined

  useEffect(() => {
    if (!opened) return
    const focused = document.activeElement
    opener.current = focused instanceof HTMLElement && focused !== document.body ? focused : null
    chosen.current = false
  }, [opened])
  useEffect(() => {
    if (!active) return
    list.current
      ?.querySelector<HTMLElement>(`[id="${optionId(active)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
    // The id is derived from the active entry and the instance id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id])

  const choose = (entry: SwitcherEntry) => {
    chosen.current = true
    onChoose(entry)
  }
  const move = (to: number) => {
    if (flat.length === 0) return
    setActiveIndex((to + flat.length) % flat.length)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    const current = Math.min(activeIndex, Math.max(flat.length - 1, 0))
    if (event.key === 'ArrowDown') move(current + 1)
    else if (event.key === 'ArrowUp') move(current - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(flat.length - 1)
    else if (event.key === 'Enter') {
      if (active) choose(active)
    } else return
    event.preventDefault()
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="lg"
      yOffset="8vh"
      returnFocus={false}
      trapFocus
      closeButtonProps={{ 'aria-label': closeLabel, size: 44 }}
      classNames={{ content: 'switcher-content', body: 'switcher-body', header: 'switcher-header' }}
      onExitTransitionEnd={() => {
        setQuery('')
        setActiveIndex(0)
        const back = opener.current
        opener.current = null
        // The field is about to unmount: let go of it so the caller sees where focus really is.
        const held = document.activeElement
        if (held instanceof HTMLElement && held.closest('.switcher-content')) held.blur()
        if (chosen.current) onSettled?.()
        else if (back?.isConnected) back.focus()
        chosen.current = false
      }}
    >
      <TextInput
        data-autofocus
        role="combobox"
        aria-label={searchLabel}
        aria-expanded={flat.length > 0}
        aria-controls={flat.length > 0 ? listId : undefined}
        aria-activedescendant={active ? optionId(active) : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        placeholder={searchLabel}
        leftSection={<Search size={18} aria-hidden="true" />}
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value)
          setActiveIndex(0)
        }}
        onKeyDown={onKeyDown}
        className="switcher-field"
      />
      <VisuallyHidden role="status">
        {flat.length > 0 ? countText(flat.length) : emptyText(query.trim())}
      </VisuallyHidden>
      {flat.length === 0 ? (
        <p className="switcher-empty" aria-hidden="true">
          {emptyText(query.trim())}
        </p>
      ) : (
        <div ref={list} id={listId} role="listbox" aria-label={title} className="switcher-list">
          {visible.map((group) => (
            <div
              key={group.id}
              role="group"
              aria-labelledby={`${uid}-group-${group.id}`}
              className="switcher-group"
            >
              <div id={`${uid}-group-${group.id}`} className="switcher-group-label">
                {group.label}
              </div>
              {group.entries.map((entry) => (
                <div
                  key={entry.id}
                  id={optionId(entry)}
                  role="option"
                  aria-selected={entry === active}
                  className="switcher-option"
                  data-active={entry === active || undefined}
                  // Keep focus in the field: the list is driven from it.
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerMove={() => {
                    const index = flat.indexOf(entry)
                    if (index !== activeIndex) setActiveIndex(index)
                  }}
                  onClick={() => choose(entry)}
                >
                  {entry.icon}
                  <span>{entry.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
