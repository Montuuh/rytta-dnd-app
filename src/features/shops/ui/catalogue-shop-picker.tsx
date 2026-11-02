import { useRef, useState } from 'react'
import { Alert, Button, Loader, Drawer, NumberInput, Select, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import type { ItemDefinition } from '@/features/inventory'
import { shopAdminQuery, useShopAction } from '../api'

export function CatalogueShopPicker({
  campaignId,
  item,
  onClose,
}: {
  campaignId: string
  item: ItemDefinition
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const data = useQuery(shopAdminQuery(state.user!.id, campaignId))
  const action = useShopAction(campaignId)
  const [shop, setShop] = useState<string | null>(null)
  const [price, setPrice] = useState<number | string>(item.value_gp ?? 0)
  const [stock, setStock] = useState<number | string>(1)
  const opener = useRef(document.activeElement as HTMLElement | null)
  const dismiss = () => {
    onClose()
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus()
    })
  }
  const request = useRef(crypto.randomUUID())
  const [attempted, setAttempted] = useState(false)
  const shops = (data.data?.shops ?? []).filter(
    (s) => !s.listings.some((l) => l.definition_id === item.id),
  )
  return (
    <Drawer
      opened
      title={t('catalogue.addToShop')}
      returnFocus={false}
      onClose={() => !action.isPending && dismiss()}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <Stack>
        <Text>{item.name}</Text>
        {data.isPending && <Text role="status">{t('common.loading')}</Text>}
        {data.isError && (
          <Alert color="red" role="alert">
            {t('query.error')}
            <Button onClick={() => void data.refetch()}>{t('common.retry')}</Button>
          </Alert>
        )}
        {data.data && shops.length === 0 && <Text>{t('catalogue.noShops')}</Text>}
        <Select
          label={t('catalogue.shop')}
          data={shops.map((s) => ({ value: s.id, label: s.name }))}
          value={shop}
          onChange={setShop}
          disabled={attempted}
        />
        <NumberInput
          label={t('catalogue.price')}
          min={0}
          max={100_000_000}
          hideControls
          allowDecimal={false}
          value={price}
          onChange={setPrice}
          disabled={attempted}
        />
        <NumberInput
          label={t('catalogue.stock')}
          min={1}
          max={9999}
          hideControls
          allowDecimal={false}
          value={stock}
          onChange={setStock}
          disabled={attempted}
        />
        <Text size="sm" c="dimmed">
          {t('catalogue.hiddenListing')}
        </Text>
        {action.isError && (
          <Alert role="alert" color="red">
            {t('catalogue.operationError')}
          </Alert>
        )}
        <Button
          aria-disabled={action.isPending || undefined}
          aria-busy={action.isPending}
          leftSection={action.isPending ? <Loader size={16} /> : undefined}
          disabled={!shop || typeof price !== 'number' || typeof stock !== 'number'}
          onClick={() => {
            if (action.isPending || !shop || typeof price !== 'number' || typeof stock !== 'number')
              return
            setAttempted(true)
            action.mutate(
              {
                kind: 'saveListing',
                shopId: shop,
                listingId: null,
                revision: null,
                draft: { definition_id: item.id, price, stock, visibility: 'hidden', access: [] },
                requestId: request.current,
              },
              { onSuccess: dismiss },
            )
          }}
        >
          {t(attempted ? 'common.retry' : 'catalogue.addToShop')}
        </Button>
      </Stack>
    </Drawer>
  )
}
