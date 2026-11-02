import { useMemo, useState } from 'react'
import {
  Group,
  SegmentedControl,
  Text,
  TextInput,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
import { LayoutGrid, List, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { carriedTenths } from '../domain/encumbrance'
import {
  itemCategories,
  type ItemCategory,
  type ItemDefinition,
  type ItemStack,
} from '../domain/item'
import { Balance } from './balance'
import { ItemIcon } from './item-icon'
import { categoryIcons, rarityPips } from './item-visuals'
import { formatPounds } from '../domain/encumbrance'

type SatchelView = 'grid' | 'list'
const viewKey = 'rytta-satchel-view'
function savedView(): SatchelView {
  try {
    return localStorage.getItem(viewKey) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export function Satchel({
  stacks,
  definitions,
  strength,
  canAdd,
  onOpen,
  onAdd,
}: {
  stacks: ItemStack[]
  definitions: Map<string, ItemDefinition>
  strength: number
  canAdd: boolean
  onOpen: (stack: ItemStack, target: HTMLElement) => void
  onAdd: (target: HTMLElement) => void
}) {
  const { t, i18n } = useTranslation()
  const [view, setViewState] = useState<SatchelView>(savedView)
  const setView = (next: SatchelView) => {
    setViewState(next)
    try {
      localStorage.setItem(viewKey, next)
    } catch {
      /* Still applies in memory. */
    }
  }
  const [filter, setFilter] = useState<ItemCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const loose = stacks.filter((stack) => !stack.equipped_slot)
  const present = new Set(loose.map((stack) => definitions.get(stack.definition_id)?.category))
  const visible = useMemo(
    () =>
      loose.filter((stack) => {
        const definition = definitions.get(stack.definition_id)
        if (!definition) return false
        if (filter !== 'all' && definition.category !== filter) return false
        return definition.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
      }),
    [loose, definitions, filter, search],
  )
  return (
    <div className="satchel-view">
      <Balance tenths={carriedTenths(stacks, definitions)} strength={strength} />
      <div className="satchel-tools">
        <div className="category-rail" role="group" aria-label={t('inventory.filter')}>
          {(['all', ...itemCategories] as const)
            .filter((category) => category === 'all' || present.has(category))
            .map((category) => (
              <UnstyledButton
                key={category}
                aria-pressed={filter === category}
                className="category-chip"
                onClick={() => setFilter(category)}
              >
                <ItemIcon
                  icon={category === 'all' ? 'backpack' : categoryIcons[category]}
                  size={18}
                />
                <span>{t(`inventory.category.${category}`)}</span>
              </UnstyledButton>
            ))}
        </div>
        <TextInput
          className="satchel-search"
          aria-label={t('inventory.search')}
          placeholder={t('inventory.search')}
          leftSection={<Search size={16} aria-hidden="true" />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        <SegmentedControl
          className="store-view"
          aria-label={t('satchel.view')}
          value={view}
          onChange={(next) => setView(next as SatchelView)}
          data={[
            {
              value: 'grid',
              label: (
                <span className="view-option" title={t('store.viewGrid')}>
                  <LayoutGrid size={18} aria-hidden="true" />
                  <VisuallyHidden>{t('store.viewGrid')}</VisuallyHidden>
                </span>
              ),
            },
            {
              value: 'list',
              label: (
                <span className="view-option" title={t('store.viewList')}>
                  <List size={18} aria-hidden="true" />
                  <VisuallyHidden>{t('store.viewList')}</VisuallyHidden>
                </span>
              ),
            },
          ]}
        />
      </div>
      {view === 'list' && (
        <ul className="store-list satchel-list" aria-label={t('inventory.view.satchel')}>
          {visible.map((stack) => {
            const definition = definitions.get(stack.definition_id)!
            return (
              <li key={stack.id} className="store-row">
                <UnstyledButton
                  className="store-row-main"
                  aria-label={t('inventory.tileLabel', {
                    name: definition.name,
                    quantity: stack.quantity,
                    rarity: t(`inventory.rarity.${definition.rarity}`),
                  })}
                  onClick={(event) => onOpen(stack, event.currentTarget)}
                >
                  <span className={`store-glyph rarity-${definition.rarity}`} aria-hidden="true">
                    <ItemIcon icon={definition.icon} imagePath={definition.image_path} size={22} />
                  </span>
                  <span className="store-row-body">
                    <span className="store-row-name user-copy">{definition.name}</span>
                    <span className="store-row-meta">
                      {t(`inventory.category.${definition.category}`)} ·{' '}
                      {t('store.weight', {
                        value: formatPounds(
                          (definition.weight_tenths * stack.quantity) / 10,
                          i18n.language,
                        ),
                      })}
                    </span>
                  </span>
                  <span className="satchel-qty" aria-hidden="true">
                    ×{stack.quantity}
                  </span>
                </UnstyledButton>
              </li>
            )
          })}
          {canAdd && (
            <li className="store-row">
              <UnstyledButton
                className="store-row-main satchel-add-row"
                onClick={(event) => onAdd(event.currentTarget)}
              >
                <span className="store-glyph" aria-hidden="true">
                  <Plus size={20} />
                </span>
                <span className="store-row-name">{t('inventory.add')}</span>
              </UnstyledButton>
            </li>
          )}
        </ul>
      )}
      {view === 'grid' && (
        <ul className="satchel-grid" aria-label={t('inventory.view.satchel')}>
          {visible.map((stack) => {
            const definition = definitions.get(stack.definition_id)!
            return (
              <li key={stack.id}>
                <UnstyledButton
                  className={`item-tile rarity-${definition.rarity}`}
                  aria-label={t('inventory.tileLabel', {
                    name: definition.name,
                    quantity: stack.quantity,
                    rarity: t(`inventory.rarity.${definition.rarity}`),
                  })}
                  onClick={(event) => onOpen(stack, event.currentTarget)}
                >
                  <span className="item-tile-icon">
                    <ItemIcon icon={definition.icon} imagePath={definition.image_path} />
                  </span>
                  <span className="item-tile-name">{definition.name}</span>
                  <span className="item-rarity-pips" aria-hidden="true">
                    {'◆'.repeat(rarityPips[definition.rarity])}
                  </span>
                  {stack.quantity > 1 && (
                    <span className="item-seal" aria-hidden="true">
                      {stack.quantity}
                    </span>
                  )}
                </UnstyledButton>
              </li>
            )
          })}
          {canAdd && (
            <li>
              <UnstyledButton
                className="item-tile item-tile-add"
                onClick={(event) => onAdd(event.currentTarget)}
              >
                <span className="item-tile-icon">
                  <Plus size={26} aria-hidden="true" />
                </span>
                <span className="item-tile-name">{t('inventory.add')}</span>
              </UnstyledButton>
            </li>
          )}
        </ul>
      )}
      {visible.length === 0 && (
        <Group className="satchel-empty">
          <Text c="dimmed">
            {loose.length === 0 ? t('inventory.empty') : t('inventory.noMatches')}
          </Text>
        </Group>
      )}
    </div>
  )
}
