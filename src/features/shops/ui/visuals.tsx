import type { ReactNode } from 'react'
import { Text } from '@mantine/core'
import { Coins, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ItemIcon, type ItemCategory, type Rarity } from '@/features/inventory'
import { formatGp } from '@/shared/lib/money'

/** Gold (to the copper) with a coin glyph; the accessible text always names the unit. */
export function GoldAmount({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const { t, i18n } = useTranslation()
  return (
    <span className={`gold-amount gold-amount-${size}`}>
      <Coins size={size === 'lg' ? 22 : size === 'md' ? 18 : 15} aria-hidden="true" />
      <span>{t('gold.amount', { value: formatGp(value, i18n.language) })}</span>
    </span>
  )
}

/** A quiet empty shelf: an icon and one sentence saying what is (not) here and why. */
export function EmptyNote({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="shop-empty">
      <span className="shop-empty-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <Text c="dimmed">{children}</Text>
    </div>
  )
}

/**
 * The RYT-004 item icon in a small frame tinted by rarity, matching satchel tiles. RYT-098: with
 * `viewable` and the item's name, a real picture makes the frame a button that opens the viewer.
 */
export function ItemGlyph({
  icon,
  imagePath,
  rarity,
  category,
  size = category ? 44 : 22,
  viewable = false,
  name,
}: {
  icon: string
  imagePath?: string | null
  rarity: Rarity
  /** J3-28: without a picture the category's painting stands in, as in the satchel. */
  category?: ItemCategory
  size?: number
  /** Only outside another control. */
  viewable?: boolean
  name?: string
}) {
  return (
    <ItemIcon
      imagePath={imagePath}
      icon={icon}
      category={category}
      size={size}
      viewable={viewable}
      name={name}
      frame={`shop-glyph rarity-${rarity}`}
    />
  )
}
