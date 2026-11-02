import { Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ItemIcon, type Rarity } from '@/features/inventory'

/** Whole gold with a coin glyph; the accessible text always names the unit. */
export function GoldAmount({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const { t, i18n } = useTranslation()
  return (
    <span className={`gold-amount gold-amount-${size}`}>
      <Coins size={size === 'lg' ? 22 : size === 'md' ? 18 : 15} aria-hidden="true" />
      <span>{t('gold.amount', { value: value.toLocaleString(i18n.language) })}</span>
    </span>
  )
}

/** The RYT-004 item icon in a small frame tinted by rarity, matching satchel tiles. */
export function ItemGlyph({
  icon,
  rarity,
  size = 22,
}: {
  icon: string
  rarity: Rarity
  size?: number
}) {
  return (
    <span className={`shop-glyph rarity-${rarity}`} aria-hidden="true">
      <ItemIcon icon={icon} size={size} />
    </span>
  )
}
