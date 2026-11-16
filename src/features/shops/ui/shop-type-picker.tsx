import { useId, useState, type ReactNode } from 'react'
import { Checkbox, Collapse, Text, UnstyledButton } from '@mantine/core'
import { Check, ChevronDown, PackageOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ItemIcon, type BasicItem } from '@/features/inventory'
import { cpToGp } from '@/shared/lib/money'
import { shopTypes, type ShopType } from '../domain/shop-types'
import { stockLanguage, typeItems } from '../domain/stocking'
import { useGp } from './use-gp'
import './shops.css'

/** '' is the empty shop. */
export type TypeChoice = { key: string; excluded: string[] }

/**
 * RYT-107: shop types as painted tiles over native radios (one Tab stop, arrow keys move the
 * choice), each with its glyph, name and how many items it stocks. The empty shop comes first.
 */
export function ShopTypePicker({
  value,
  catalogue,
  disabled,
  includeEmpty = true,
  autoFocus = false,
  onChange,
}: {
  value: string
  catalogue: readonly BasicItem[] | undefined
  disabled?: boolean
  includeEmpty?: boolean
  /** Take the drawer's first focus: the chosen tile, or the first one. */
  autoFocus?: boolean
  onChange: (key: string) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = stockLanguage(i18n.language)
  const name = useId()
  const keys = [...(includeEmpty ? [''] : []), ...shopTypes.map((type) => type.key)]
  const focusKey = keys.includes(value) ? value : keys[0]
  const count = (type: ShopType) =>
    catalogue ? typeItems(type, catalogue).length : type.stock.length
  const tile = (key: string, label: string, meta: string, glyph: ReactNode) => (
    <label key={key} className="type-tile" data-checked={value === key || undefined}>
      <input
        type="radio"
        className="type-radio"
        name={name}
        value={key}
        checked={value === key}
        disabled={disabled}
        data-autofocus={(autoFocus && key === focusKey) || undefined}
        onChange={() => onChange(key)}
      />
      <span className="type-tile-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="type-tile-name">{label}</span>
      <span className="type-tile-meta">{meta}</span>
      {value === key && (
        <span className="type-tile-check" aria-hidden="true">
          <Check size={14} />
        </span>
      )}
    </label>
  )
  return (
    <fieldset className="plain-fieldset">
      <legend>
        <Text fw={600} size="sm" mb={6}>
          {t('admin.type.legend')}
        </Text>
      </legend>
      <div className="type-grid">
        {includeEmpty &&
          tile(
            '',
            t('admin.type.empty'),
            t('admin.type.emptyMeta'),
            <PackageOpen size={26} strokeWidth={1.6} />,
          )}
        {shopTypes.map((type) =>
          tile(
            type.key,
            type.name[lang],
            t('admin.type.count', { count: count(type) }),
            <ItemIcon icon={type.icon} size={26} />,
          ),
        )}
      </div>
    </fieldset>
  )
}

/**
 * What the chosen type will stock, editable before saving: a disclosure with one checkbox per
 * item (all on), its catalogue price beside it.
 */
export function StockReview({
  items,
  excluded,
  disabled,
  onChange,
}: {
  items: readonly BasicItem[]
  excluded: string[]
  disabled?: boolean
  onChange: (excluded: string[]) => void
}) {
  const { t, i18n } = useTranslation()
  const gp = useGp()
  const lang = stockLanguage(i18n.language)
  const [open, setOpen] = useState(false)
  const panel = useId()
  const chosen = items.length - excluded.filter((key) => items.some((i) => i.key === key)).length
  return (
    <div className="stock-review">
      <UnstyledButton
        className="stock-review-toggle"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(!open)}
      >
        <span>{t('admin.type.review', { count: chosen, total: items.length })}</span>
        <ChevronDown size={18} aria-hidden="true" className="stock-review-chevron" />
      </UnstyledButton>
      <Collapse expanded={open} id={panel}>
        <ul className="stock-review-list">
          {items.map((item) => (
            <li key={item.key}>
              <Checkbox
                className="touch-check"
                disabled={disabled}
                checked={!excluded.includes(item.key)}
                onChange={(event) =>
                  onChange(
                    event.currentTarget.checked
                      ? excluded.filter((key) => key !== item.key)
                      : [...excluded, item.key],
                  )
                }
                label={
                  <span className="stock-review-item">
                    <span>{item.name[lang]}</span>
                    <span className="stock-review-price">
                      {t('gold.amount', { value: gp(cpToGp(item.costCp)) })}
                    </span>
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  )
}

/** The type's name and glyph for a shop's header or row; nothing for unknown or no kind. */
export function ShopKind({ kind, className }: { kind?: string | null; className?: string }) {
  const { i18n } = useTranslation()
  const type = kind ? shopTypes.find((entry) => entry.key === kind) : undefined
  if (!type) return null
  return (
    <span className={className ? `shop-kind ${className}` : 'shop-kind'}>
      <ItemIcon icon={type.icon} size={16} />
      <span>{type.name[stockLanguage(i18n.language)]}</span>
    </span>
  )
}
