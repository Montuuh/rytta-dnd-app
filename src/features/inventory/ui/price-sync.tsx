import { useRef, useState } from 'react'
import { Alert, Button, Checkbox, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useItemLifecycle } from '../api'
import type { DefinitionImpact } from '../data/repository'

/** After a value change, offer to carry the new price to the shops that still sell the item. */
export function PriceSyncDialog({
  campaignId,
  definitionId,
  name,
  price,
  listings,
  onDone,
}: {
  campaignId: string
  definitionId: string
  name: string
  price: number
  listings: DefinitionImpact['listings']
  /** `updated` is the number of repriced listings, or undefined when the DM kept the prices. */
  onDone: (updated?: number) => void
}) {
  const { t, i18n } = useTranslation()
  const phone = useMediaQuery('(max-width: 47.99em)')
  const { syncPrices } = useItemLifecycle(campaignId)
  const [chosen, setChosen] = useState(() => listings.map((l) => l.id))
  // One key per selection, so a retry after a lost response replays instead of repeating.
  const request = useRef({ ids: '', key: crypto.randomUUID() })
  const apply = async () => {
    if (syncPrices.isPending || chosen.length === 0) return
    const ids = [...chosen].sort().join(',')
    if (request.current.ids !== ids) request.current = { ids, key: crypto.randomUUID() }
    try {
      const result = await syncPrices.mutateAsync({
        definitionId,
        listingIds: chosen,
        price,
        requestId: request.current.key,
      })
      onDone(result.updated)
    } catch {
      /* The alert below explains and keeps both choices available. */
    }
  }
  return (
    <Modal
      opened
      centered
      fullScreen={phone}
      onClose={() => !syncPrices.isPending && onDone()}
      title={t('lifecycle.syncTitle')}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <Stack gap="md">
        <Text className="user-copy">
          {t('lifecycle.syncBody', { name, value: price.toLocaleString(i18n.language) })}
        </Text>
        <Checkbox.Group
          label={t('lifecycle.syncShops')}
          value={chosen}
          onChange={setChosen}
          className="sync-list"
        >
          <Stack gap={6} mt={6}>
            {listings.map((listing) => (
              <Checkbox.Card
                key={listing.id}
                value={listing.id}
                className="sync-row"
                disabled={syncPrices.isPending}
              >
                <Group wrap="nowrap" gap="sm" align="center">
                  <Checkbox.Indicator />
                  <Store size={18} aria-hidden="true" className="sync-row-icon" />
                  <span className="sync-row-body">
                    <span className="sync-row-name user-copy">{listing.shop_name}</span>
                    <span className="sync-row-price">
                      <s>{t('lifecycle.syncCurrent', { price: listing.price })}</s>
                      <span aria-hidden="true"> → </span>
                      <strong>
                        {t('store.value', { value: price.toLocaleString(i18n.language) })}
                      </strong>
                    </span>
                  </span>
                </Group>
              </Checkbox.Card>
            ))}
          </Stack>
        </Checkbox.Group>
        {syncPrices.isError && (
          <Alert color="red" role="alert">
            {t('lifecycle.syncError')}
          </Alert>
        )}
        <Stack gap="xs">
          <Button
            size="md"
            aria-busy={syncPrices.isPending}
            aria-disabled={syncPrices.isPending || chosen.length === 0 || undefined}
            disabled={chosen.length === 0 && !syncPrices.isPending}
            leftSection={syncPrices.isPending ? <Loader size={16} /> : undefined}
            onClick={() => void apply()}
          >
            {t('lifecycle.syncApply', { count: chosen.length })}
          </Button>
          <Button variant="subtle" disabled={syncPrices.isPending} onClick={() => onDone()}>
            {t('lifecycle.syncSkip')}
          </Button>
        </Stack>
      </Stack>
    </Modal>
  )
}
