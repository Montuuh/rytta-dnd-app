import { useRef } from 'react'
import { Alert, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { usePhone } from '@/shared/ui/use-viewport'
import { useQuery } from '@tanstack/react-query'
import { Backpack, Store, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { definitionImpactQuery, useItemLifecycle } from '../api'
import type { ItemDefinition } from '../domain/item'
import { ItemIcon } from './item-icon'
import { newRequestId } from '@/shared/lib/request-id'

/** Confirm a storeroom delete (soft archive) with what it touches: shops lose the listing,
 * satchels keep their units, open orders block it (RYT-032). */
export function DeleteItemDialog({
  campaignId,
  item,
  onClose,
  onDeleted,
}: {
  campaignId: string
  item: ItemDefinition
  onClose: () => void
  onDeleted: (item: ItemDefinition) => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const phone = usePhone()
  const impact = useQuery(definitionImpactQuery(state.user!.id, campaignId, item.id))
  const { archive } = useItemLifecycle(campaignId)
  const request = useRef(newRequestId())
  const data = impact.data
  const blocked = !data || data.open_orders > 0
  const failure =
    archive.error?.message === 'stale'
      ? t('lifecycle.stale')
      : archive.error?.message === 'openOrders'
        ? t('lifecycle.openOrders', { count: 1 })
        : archive.error
          ? t('lifecycle.deleteError')
          : null
  const confirm = () => {
    if (archive.isPending || blocked) return
    archive.mutate(
      { definitionId: item.id, revision: item.revision, requestId: request.current },
      { onSuccess: () => onDeleted(item) },
    )
  }
  return (
    <Modal
      opened
      centered
      fullScreen={phone}
      onClose={() => !archive.isPending && onClose()}
      title={t('lifecycle.deleteTitle', { name: item.name })}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <span className={`store-glyph rarity-${item.rarity}`} aria-hidden="true">
            <ItemIcon icon={item.icon} imagePath={item.image_path} size={22} />
          </span>
          <Text>{t('lifecycle.deleteBody')}</Text>
        </Group>
        {impact.isPending && (
          <Text role="status" c="dimmed">
            {t('lifecycle.checking')}
          </Text>
        )}
        {impact.isError && (
          <Alert color="red" role="alert">
            {t('lifecycle.impactError')}{' '}
            <Button variant="subtle" onClick={() => void impact.refetch()}>
              {t('common.retry')}
            </Button>
          </Alert>
        )}
        {data && (
          <ul className="impact-list">
            {data.listings.length > 0 && (
              <li>
                <Store size={18} aria-hidden="true" />
                <span>
                  {t('lifecycle.impactShops', { count: data.listings.length })}{' '}
                  <span className="user-copy">
                    {data.listings.map((l) => l.shop_name).join(', ')}
                  </span>
                </span>
              </li>
            )}
            {data.holders > 0 && (
              <li>
                <Backpack size={18} aria-hidden="true" />
                <span>
                  {t('lifecycle.impactHolders', { count: data.holders, units: data.units })}
                </span>
              </li>
            )}
            {data.listings.length === 0 && data.holders === 0 && (
              <li>
                <span>{t('lifecycle.impactNone')}</span>
              </li>
            )}
          </ul>
        )}
        {data && data.open_orders > 0 && (
          <Alert color="orange" role="alert">
            {t('lifecycle.openOrders', { count: data.open_orders })}
          </Alert>
        )}
        {failure && (
          <Alert color="red" role="alert">
            {failure}
          </Alert>
        )}
        <Stack gap="xs">
          <Button
            className="danger-solid"
            size="md"
            aria-busy={archive.isPending}
            aria-disabled={archive.isPending || blocked || undefined}
            disabled={blocked && !archive.isPending}
            leftSection={
              archive.isPending ? <Loader size={16} /> : <Trash2 size={18} aria-hidden="true" />
            }
            onClick={confirm}
          >
            {t('lifecycle.deleteConfirm')}
          </Button>
          <Button variant="subtle" disabled={archive.isPending} onClick={onClose} data-autofocus>
            {t('lifecycle.keep')}
          </Button>
        </Stack>
      </Stack>
    </Modal>
  )
}
