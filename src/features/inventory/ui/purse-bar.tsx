import { Text } from '@mantine/core'
import { Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatGp } from '@/shared/lib/money'

/**
 * RYT-125: how much gold the character holds, in the inventory header. Reads the same purse the
 * shops show (`gold` is the character's resources); a character whose purse cannot be read shows
 * nothing rather than a made-up zero.
 */
export function PurseBar({ name, gold }: { name: string; gold: number | null }) {
  const { t, i18n } = useTranslation()
  if (gold === null) return null
  return (
    <div
      className="purse-bar inventory-purse"
      role="group"
      aria-label={t('inventory.purse', { name })}
    >
      <Text size="xs" c="dimmed" className="user-copy">
        {t('inventory.purse', { name })}
      </Text>
      <span className="gold-amount gold-amount-lg">
        <Coins size={22} aria-hidden="true" />
        <span>{t('gold.amount', { value: formatGp(gold, i18n.language) })}</span>
      </span>
    </div>
  )
}
