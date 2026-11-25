import { Button, SegmentedControl, Stack } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Drawer, Modal } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { itemCategories, type ItemCategory } from '../domain/item'
import { categoryIcons } from './item-visuals'
import { ItemIcon } from './item-icon'
import './store-filters.css'

export type StoreSort = 'name' | 'category' | 'rarity' | 'value'
export type StoreView = 'list' | 'grid'
const storeSorts: readonly StoreSort[] = ['name', 'category', 'rarity', 'value']

/**
 * The storeroom's Filters sheet: the category (with its count as a numeral), the order and the
 * list or grid view. Every choice applies at once; the one filled action closes the sheet on the
 * number of items it leaves.
 */
export function StoreFilters({
  counts,
  total,
  category,
  sort,
  view,
  shown,
  onCategory,
  onSort,
  onView,
  onClose,
}: {
  counts: ReadonlyMap<string, number>
  total: number
  category: ItemCategory | 'all'
  sort: StoreSort
  view: StoreView
  /** Items the current filters leave. */
  shown: number
  onCategory: (category: ItemCategory | 'all') => void
  onSort: (sort: StoreSort) => void
  onView: (view: StoreView) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const options = (['all', ...itemCategories] as const).filter(
    (key) => key === 'all' || counts.has(key),
  )
  const body = (
    <Stack gap="md">
      <div role="group" aria-labelledby="store-filter-category">
        <p className="store-filter-label" id="store-filter-category">
          {t('store.category')}
        </p>
        <div className="store-filter-options">
          {options.map((key) => (
            <button
              type="button"
              key={key}
              className="store-filter-option"
              aria-pressed={category === key}
              onClick={() => onCategory(key)}
            >
              <ItemIcon icon={key === 'all' ? 'package' : categoryIcons[key]} size={16} />
              <span className="store-filter-name">{t(`inventory.category.${key}`)}</span>
              <span className="store-filter-count">{key === 'all' ? total : counts.get(key)}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="store-filter-label" id="store-filter-sort">
          {t('store.sort')}
        </p>
        <SegmentedControl
          fullWidth
          className="ink-seg wrap-segments"
          aria-labelledby="store-filter-sort"
          value={sort}
          onChange={(next) => onSort(next as StoreSort)}
          data={storeSorts.map((key) => ({
            value: key,
            label: t(`store.sort${key[0]!.toUpperCase()}${key.slice(1)}` as 'store.sortName'),
          }))}
        />
      </div>
      <div>
        <p className="store-filter-label" id="store-filter-view">
          {t('store.view')}
        </p>
        <SegmentedControl
          fullWidth
          className="ink-seg wrap-segments"
          aria-labelledby="store-filter-view"
          value={view}
          onChange={(next) => onView(next as StoreView)}
          data={[
            { value: 'list', label: t('store.viewList') },
            { value: 'grid', label: t('store.viewGrid') },
          ]}
        />
      </div>
      <Button size="md" fullWidth onClick={onClose}>
        {t('store.showItems', { count: shown })}
      </Button>
    </Stack>
  )
  const props = {
    opened: true,
    onClose,
    returnFocus: false,
    title: t('store.filters'),
    closeButtonProps: { 'aria-label': t('common.close'), size: 44 },
  } as const
  return phone ? (
    <Drawer {...props} position="bottom" size="auto">
      {body}
    </Drawer>
  ) : (
    <Modal {...props} centered size="md">
      {body}
    </Modal>
  )
}
