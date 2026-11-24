import { useMemo, useRef, useState } from 'react'
import { Alert, Button, Group, Loader, Stack, Text, TextInput } from '@mantine/core'
import { Drawer } from '@/shared/ui/overlays'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { newRequestId } from '@/shared/lib/request-id'
import { localizedName } from '@/shared/lib/translations'
import { usePhone } from '@/shared/ui/use-viewport'
import { useBasePackLabel } from '@/shared/ui/pack-origins-context'
import { definitionImpactQuery, useMergeItems } from '../api'
import type { ItemDefinition } from '../domain/item'
import { ItemIcon } from './item-icon'
import { PickList } from './pick-list'
import './catalogue.css'

const mergeErrors: Record<string, string> = {
  openOrders: 'items.merge.openOrders',
  openTrades: 'items.merge.openTrades',
  stale: 'items.merge.stale',
  gone: 'items.merge.gone',
}

/**
 * RYT-105: fold a duplicate item into the one to keep. Holders, shop listings and closed order
 * lines move to the kept item and the duplicate is archived; the impact shows first.
 */
export function MergeItems({
  campaignId,
  source,
  items,
  onClose,
  onDone,
}: {
  campaignId: string
  source: ItemDefinition
  /** Live storeroom items; the duplicate itself is left out. */
  items: ItemDefinition[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const baseLabel = useBasePackLabel(t('store.origin.srd'))
  const { state } = useAuth()
  const phone = usePhone()
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const merge = useMergeItems(campaignId)
  const request = useRef({ key: '', id: newRequestId() })
  const name = (item: ItemDefinition) => localizedName(item, i18n.language)
  const candidates = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    return items
      .filter((item) => item.id !== source.id && !item.archived)
      .filter((item) =>
        [item.name, localizedName(item, i18n.language)].some((label) =>
          label.toLocaleLowerCase().includes(needle),
        ),
      )
      .sort(
        (a, b) =>
          Number(b.category === source.category) - Number(a.category === source.category) ||
          localizedName(a, i18n.language).localeCompare(localizedName(b, i18n.language)),
      )
  }, [items, search, source, i18n.language])
  const kept = items.find((item) => item.id === target) ?? null
  const impact = useQuery({
    ...definitionImpactQuery(state.user!.id, campaignId, source.id),
    enabled: confirming,
  })
  const blocked = Boolean(impact.data && (impact.data.open_orders || impact.data.open_trades))
  const submit = () => {
    if (!kept || merge.isPending || blocked) return
    const key = `${kept.id}:${source.revision}:${kept.revision}`
    if (request.current.key !== key) request.current = { key, id: newRequestId() }
    merge.mutate(
      {
        source: { id: source.id, revision: source.revision },
        target: { id: kept.id, revision: kept.revision },
        requestId: request.current.id,
      },
      {
        onSuccess: (result) =>
          onDone(
            t('items.merge.done', {
              source: name(source),
              target: name(kept),
              count: result.characters,
            }),
          ),
      },
    )
  }
  const errorKey = merge.error ? (mergeErrors[merge.error.message] ?? 'items.merge.error') : null
  return (
    <Drawer
      opened
      returnFocus={false}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 480}
      title={t('items.merge.title', { name: name(source) })}
      onClose={() => !merge.isPending && onClose()}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      {!confirming ? (
        <Stack gap="md">
          <TextInput
            label={t('items.merge.search')}
            leftSection={<Search size={16} aria-hidden="true" />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            data-autofocus
          />
          {candidates.length === 0 ? (
            <Text c="dimmed">{t('store.noResults')}</Text>
          ) : (
            <PickList
              label={t('items.merge.keepGroup')}
              selected={target}
              onPick={setTarget}
              entries={candidates.map((item) => ({
                id: item.id,
                name: name(item),
                meta: `${t(`inventory.category.${item.category}`)} · ${item.origin === 'srd' ? baseLabel : t(`store.origin.${item.origin}`)}`,
                icon: item.icon,
                imagePath: item.image_path,
                rarity: item.rarity,
              }))}
            />
          )}
          <div className="pick-dock">
            <Button
              size="lg"
              fullWidth
              disabled={!kept}
              rightSection={<ArrowRight size={18} aria-hidden="true" />}
              onClick={() => setConfirming(true)}
            >
              {kept ? t('items.merge.next', { name: name(kept) }) : t('items.merge.pickFirst')}
            </Button>
          </div>
        </Stack>
      ) : (
        <Stack gap="md">
          <Button
            variant="subtle"
            w="fit-content"
            leftSection={<ArrowLeft size={16} aria-hidden="true" />}
            disabled={merge.isPending}
            onClick={() => {
              merge.reset()
              setConfirming(false)
            }}
          >
            {t('items.merge.change')}
          </Button>
          <div className="merge-pair">
            <div className="merge-side" data-role="source">
              <ItemIcon icon={source.icon} imagePath={source.image_path} size={28} />
              <span>
                <span className="merge-side-label">{t('items.merge.removed')}</span>
                <span className="merge-side-name user-copy">{name(source)}</span>
              </span>
            </div>
            <ArrowRight size={20} aria-hidden="true" className="merge-arrow" />
            {kept && (
              <div className="merge-side" data-role="target">
                <ItemIcon icon={kept.icon} imagePath={kept.image_path} size={28} />
                <span>
                  <span className="merge-side-label">{t('items.merge.kept')}</span>
                  <span className="merge-side-name user-copy">{name(kept)}</span>
                </span>
              </div>
            )}
          </div>
          {impact.isPending && <Text role="status">{t('common.loading')}</Text>}
          {impact.isError && (
            <Alert color="red" role="alert">
              {t('query.error')}{' '}
              <Button variant="subtle" onClick={() => void impact.refetch()}>
                {t('common.retry')}
              </Button>
            </Alert>
          )}
          {impact.data && (
            <ul className="merge-impact">
              <li>
                {impact.data.holders
                  ? t('items.merge.holders', {
                      count: impact.data.holders,
                      units: impact.data.units,
                    })
                  : t('items.merge.noHolders')}
              </li>
              {impact.data.listings.length > 0 && (
                <li>
                  {t('items.merge.listings', {
                    count: impact.data.listings.length,
                    shops: impact.data.listings.map((l) => l.shop_name).join(', '),
                  })}
                </li>
              )}
            </ul>
          )}
          {impact.data?.open_orders ? (
            <Alert color="orange" role="alert">
              {t('items.merge.openOrders')}
            </Alert>
          ) : null}
          {impact.data?.open_trades ? (
            <Alert color="orange" role="alert">
              {t('items.merge.openTrades')}
            </Alert>
          ) : null}
          {errorKey && (
            <Alert color="red" role="alert">
              {t(errorKey as 'items.merge.error')}
            </Alert>
          )}
          <Text size="sm" fw={600}>
            {t('items.merge.final', { name: name(source) })}
          </Text>
          <Group justify="flex-end">
            <Button
              color="red"
              variant="light"
              size="md"
              aria-busy={merge.isPending}
              aria-disabled={merge.isPending || blocked || !impact.data || undefined}
              disabled={blocked || !impact.data}
              leftSection={merge.isPending ? <Loader size={16} /> : undefined}
              onClick={submit}
            >
              {kept && t('items.merge.confirm', { name: name(kept) })}
            </Button>
          </Group>
        </Stack>
      )}
    </Drawer>
  )
}
