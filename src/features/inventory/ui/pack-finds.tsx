import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Alert, Button, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { shortPackName } from '@/shared/api/pack-origins'
import { cn } from '@/shared/lib/cn'
import { formatGp, cpToGp } from '@/shared/lib/money'
import { newRequestId } from '@/shared/lib/request-id'
import { rankSearch } from '@/shared/lib/search-rank'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/shared/ui/kit/item'
import { Skeleton } from '@/shared/ui/kit/skeleton'
import { useBasicImport, useCampaignItemCatalogue } from '../api'
import type { BasicItem } from '../domain/basic-items'
import { toImportItem } from '../domain/catalogue'
import type { ItemCategory, ItemDefinition } from '../domain/item'
import { itemPackTitle } from '../domain/pack-items'
import { ItemIcon } from './item-icon'

/** Longest list of pack finds; the search narrows it from there. */
const findLimit = 20
export type PackFindsProps = {
  campaignId: string
  search: string
  /** Every storeroom definition, archived ones too. */
  definitions: readonly ItemDefinition[]
  category: ItemCategory | 'all'
  /** The storeroom's own list has no match: the group stays out of the way when it has none either. */
  storeroomEmpty: boolean
  /** Called with the announcement once an item is in the storeroom. */
  onAdded: (message: string) => void
  /** Where focus goes when the last find has been added. */
  fallbackFocus: RefObject<HTMLElement | null>
  /** True while the group has something to show (loading, error, finds or its "none" line). */
  onShown?: (shown: boolean) => void
}

/**
 * The "In your packs" group under the storeroom list. Mounted only while the search has two or
 * more characters, so the pack files are fetched on demand.
 */
export function PackFinds({
  campaignId,
  search,
  definitions,
  category,
  storeroomEmpty,
  onAdded,
  fallbackFocus,
  onShown,
}: PackFindsProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.language.startsWith('en') ? 'en' : 'es'
  const catalogue = useCampaignItemCatalogue(campaignId)
  const importer = useBasicImport(campaignId)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const requests = useRef(new Map<string, string>())
  const held = useMemo(
    () =>
      new Set(
        definitions.flatMap((definition) => (definition.basic_key ? [definition.basic_key] : [])),
      ),
    [definitions],
  )
  const finds = useMemo(() => {
    const open = (catalogue.data?.items ?? []).filter(
      (item) => !held.has(item.key) && (category === 'all' || item.category === category),
    )
    return rankSearch(open, search, (item) => [item.name.es, item.name.en]).slice(0, findLimit)
  }, [catalogue.data, held, category, search])
  const several = (catalogue.data?.packs.length ?? 0) > 1
  const nameOf = (item: BasicItem) => item.name[language] || item.name.en || item.name.es
  const packOf = (item: BasicItem) => {
    const source = catalogue.data?.sources[item.key]
    if (!source) return null
    return shortPackName(itemPackTitle(source, language), source.srd, t('store.origin.srd'))
  }

  const add = async (item: BasicItem, index: number) => {
    if (!catalogue.data || busy) return
    setBusy(item.key)
    setFailed(null)
    try {
      const payload = [toImportItem(item, language, catalogue.data.descriptions)]
      const signature = JSON.stringify(payload)
      let requestId = requests.current.get(signature)
      if (!requestId) {
        requestId = newRequestId()
        requests.current.set(signature, requestId)
      }
      await importer.mutateAsync({ items: payload, requestId })
      onAdded(t('store.packs.added', { name: nameOf(item) }))
      // The row is gone: focus the one that took its place, or the search when it was the last.
      requestAnimationFrame(() => {
        const next = list.current?.querySelectorAll<HTMLElement>('[data-pack-add]')
        const target = next && next.length > 0 ? next[Math.min(index, next.length - 1)] : null
        ;(target ?? fallbackFocus.current)?.focus()
      })
    } catch {
      setFailed(item.key)
    } finally {
      setBusy(null)
    }
  }

  const hidden = !catalogue.isPending && !catalogue.isError && finds.length === 0 && storeroomEmpty
  useEffect(() => {
    onShown?.(!hidden)
    return () => onShown?.(false)
  }, [hidden, onShown])

  const heading = (
    <Title order={3} className="store-packs-heading" id="store-packs-heading">
      {t('store.packs.title')}
    </Title>
  )

  if (catalogue.isPending)
    return (
      <section className="store-packs" aria-labelledby="store-packs-heading" aria-busy="true">
        {heading}
        <div role="status" className="tw:flex tw:flex-col tw:gap-2">
          <span className="visually-hidden">{t('common.loading')}</span>
          <Skeleton className="tw:h-14" aria-hidden="true" />
          <Skeleton className="tw:h-14" aria-hidden="true" />
        </div>
      </section>
    )
  if (catalogue.isError)
    return (
      <section className="store-packs" aria-labelledby="store-packs-heading">
        {heading}
        <Alert color="red" role="alert">
          {t('store.packs.error')}{' '}
          <Button variant="subtle" onClick={() => void catalogue.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      </section>
    )
  // With nothing in either group the page shows its one empty state.
  if (hidden) return null
  return (
    <section className="store-packs" aria-labelledby="store-packs-heading">
      {heading}
      {finds.length === 0 ? (
        <Text size="sm" c="dimmed" role="status">
          {t('store.packs.none')}
        </Text>
      ) : (
        <div
          ref={list}
          role="list"
          aria-labelledby="store-packs-heading"
          className="tw:flex tw:flex-col"
        >
          {finds.map((item, index) => {
            const pack = several ? packOf(item) : null
            const price =
              item.costCp > 0
                ? t('store.value', { value: formatGp(cpToGp(item.costCp) ?? 0, i18n.language) })
                : null
            return (
              <Item
                key={item.key}
                role="listitem"
                size="sm"
                className={cn(
                  'tw:min-h-14 tw:flex-nowrap tw:gap-3 tw:rounded-none tw:border-x-0 tw:border-t-0 tw:border-b-border tw:px-1 tw:py-2',
                  'tw:last:border-b-0',
                )}
              >
                <ItemMedia>
                  <span
                    className={`store-glyph rarity-${item.rarity ?? 'common'}`}
                    aria-hidden="true"
                  >
                    <ItemIcon icon={item.icon} size={22} />
                  </span>
                </ItemMedia>
                <ItemContent className="tw:min-w-0 tw:gap-0.5">
                  <ItemTitle className="user-copy tw:line-clamp-2 tw:w-auto tw:text-base">
                    {nameOf(item)}
                  </ItemTitle>
                  <ItemDescription className="pack-find-meta tw:line-clamp-none tw:text-xs">
                    <span className="store-meta-part">
                      {t(`inventory.category.${item.category}`)}
                    </span>
                    {price && <span className="store-meta-part">{price}</span>}
                    {pack && <span className="store-meta-part user-copy">{pack}</span>}
                  </ItemDescription>
                  {failed === item.key && (
                    <Text size="xs" c="red" role="alert">
                      {t('store.packs.addError')}
                    </Text>
                  )}
                </ItemContent>
                <ItemActions className="tw:shrink-0">
                  <Button
                    variant="default"
                    size="compact-md"
                    mih={44}
                    data-pack-add=""
                    aria-label={t('store.packs.addName', { name: nameOf(item) })}
                    loading={busy === item.key}
                    aria-disabled={Boolean(busy) || undefined}
                    onClick={() => void add(item, index)}
                  >
                    {failed === item.key ? t('common.retry') : t('store.packs.add')}
                  </Button>
                </ItemActions>
              </Item>
            )
          })}
        </div>
      )}
    </section>
  )
}
