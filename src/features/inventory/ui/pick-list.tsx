import { UnstyledButton } from '@mantine/core'
import { Check } from 'lucide-react'
import type { Rarity } from '../domain/item'
import { ItemIcon } from './item-icon'

export type PickEntry = {
  id: string
  name: string
  meta: string
  icon: string
  imagePath?: string | null
  rarity: Rarity
}

/** One-choice list of items: 44px rows with icon, name and one meta line; the pick is pressed. */
export function PickList({
  entries,
  selected,
  label,
  disabled,
  onPick,
}: {
  entries: PickEntry[]
  selected: string | null
  label: string
  disabled?: boolean
  onPick: (id: string) => void
}) {
  return (
    <div className="add-pick-list" role="group" aria-label={label}>
      {entries.map((entry) => {
        const on = entry.id === selected
        return (
          <UnstyledButton
            key={entry.id}
            aria-pressed={on}
            className="add-pick-row"
            disabled={disabled}
            onClick={() => onPick(entry.id)}
          >
            <span className={`store-glyph rarity-${entry.rarity}`} aria-hidden="true">
              <ItemIcon icon={entry.icon} imagePath={entry.imagePath} size={22} />
            </span>
            <span className="store-row-body">
              <span className="store-row-name user-copy">{entry.name}</span>
              <span className="store-row-meta">{entry.meta}</span>
            </span>
            <span className="add-pick-check" aria-hidden="true">
              {on && <Check size={18} />}
            </span>
          </UnstyledButton>
        )
      })}
    </div>
  )
}
