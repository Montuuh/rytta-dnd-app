import { Group, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { ItemIcon, type ItemCategory } from '@/features/inventory'
import { localizedName } from '@/shared/lib/translations'
import { Modal } from '@/shared/ui/overlays'
import type { TradeItem } from '../domain/trade'

/** RYT-109: what the partner puts on the table, read-only: its picture (which opens the shared
 * viewer), name, amount and description. */
export function PartnerItemSheet({
  item,
  quantity,
  onClose,
}: {
  item: TradeItem
  quantity: number
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const name = localizedName(item, i18n.language)
  return (
    <Modal
      opened
      centered
      onClose={onClose}
      title={<span className="user-copy">{name}</span>}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <Stack gap="md" className="partner-item">
        <Group gap="md" wrap="nowrap" align="center">
          <ItemIcon
            imagePath={item.image_path}
            icon={item.icon}
            category={item.category as ItemCategory}
            size={88}
            viewable
            name={name}
            frame={`partner-item-picture rarity-${item.rarity}`}
          />
          <Text size="sm" c="dimmed">
            {t('trade.window.partnerItemAmount', {
              quantity,
              rarity: t(`inventory.rarity.${item.rarity}`),
            })}
          </Text>
        </Group>
        {item.description && (
          <Text size="sm" className="user-copy preserve-lines">
            {item.description}
          </Text>
        )}
      </Stack>
    </Modal>
  )
}
