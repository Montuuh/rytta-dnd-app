import { useMemo, useState } from 'react'
import {
  Button,
  Group,
  SegmentedControl,
  Text,
  TextInput,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
import { LayoutGrid, List, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { localizedName } from '@/shared/lib/translations'
import { carriedLoad } from '../domain/encumbrance'
import {
  itemCategories,
  unitPounds,
  type ItemCategory,
  type ItemDefinition,
  type ItemStack,
} from '../domain/item'
import { Balance } from './balance'
import { EmptyPanel } from './empty-panel'
import { ItemIcon } from './item-icon'
import { categoryIcons, rarityPips } from './item-visuals'
import { useWeightFormat } from './use-weight'

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
  const { format } = useWeightFormat()
  const nameOf = (definition: ItemDefinition) => localizedName(definition, i18n.language)
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
  // J3-23: identical units read as one tile. The largest stack answers for the group (its card
  // acts on it); the tile shows the units of all of them.
  const loose = useMemo(() => {
    const groups = new Map<string, { stack: ItemStack; total: number }>()
    for (const stack of stacks) {
      if (stack.equipped_slot) continue
      const group = groups.get(stack.definition_id)
      if (!group) groups.set(stack.definition_id, { stack, total: stack.quantity })
      else {
        group.total += stack.quantity
        if (stack.quantity > group.stack.quantity) group.stack = stack
      }
    }
    return [...groups.values()]
  }, [stacks])
  const present = new Set(loose.map(({ stack }) => definitions.get(stack.definition_id)?.category))
  const visible = useMemo(
    () =>
      loose.filter(({ stack }) => {
        const definition = definitions.get(stack.definition_id)
        if (!definition) return false
        if (filter !== 'all' && definition.category !== filter) return false
        const needle = search.trim().toLocaleLowerCase()
        return [definition.name, localizedName(definition, i18n.language)].some((name) =>
          name.toLocaleLowerCase().includes(needle),
        )
      }),
    [loose, definitions, filter, search, i18n.language],
  )
  return (
    <div className="satchel-view">
      <Balance
        load={carriedLoad(stacks, definitions)}
        strength={strength}
        definitions={definitions}
      />
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
      {view === 'list' && loose.length > 0 && (
        <ul className="store-list satchel-list" aria-label={t('inventory.view.satchel')}>
          {visible.map(({ stack, total }) => {
            const definition = definitions.get(stack.definition_id)!
            return (
              <li key={stack.definition_id} className="store-row">
                <UnstyledButton
                  className="store-row-main"
                  aria-label={t('inventory.tileLabel', {
                    name: nameOf(definition),
                    quantity: total,
                    rarity: t(`inventory.rarity.${definition.rarity}`),
                  })}
                  onClick={(event) => onOpen(stack, event.currentTarget)}
                >
                  <span className={`store-glyph rarity-${definition.rarity}`} aria-hidden="true">
                    <ItemIcon
                      icon={definition.icon}
                      imagePath={definition.image_path}
                      category={definition.category}
                      size={40}
                    />
                  </span>
                  <span className="store-row-body">
                    <span className="store-row-name user-copy">{nameOf(definition)}</span>
                    <span className="store-row-meta">
                      {t(`inventory.category.${definition.category}`)}
                      {unitPounds(definition) > 0 && ` · ${format(unitPounds(definition) * total)}`}
                    </span>
                  </span>
                  <span className="satchel-qty" aria-hidden="true">
                    ×{total}
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
      {view === 'grid' && loose.length > 0 && (
        <ul className="satchel-grid" aria-label={t('inventory.view.satchel')}>
          {visible.map(({ stack, total }) => {
            const definition = definitions.get(stack.definition_id)!
            return (
              <li key={stack.definition_id}>
                <UnstyledButton
                  className={`item-tile rarity-${definition.rarity}`}
                  aria-label={t('inventory.tileLabel', {
                    name: nameOf(definition),
                    quantity: total,
                    rarity: t(`inventory.rarity.${definition.rarity}`),
                  })}
                  onClick={(event) => onOpen(stack, event.currentTarget)}
                >
                  <span className="item-tile-icon">
                    <ItemIcon
                      icon={definition.icon}
                      imagePath={definition.image_path}
                      category={definition.category}
                      size={44}
                    />
                  </span>
                  <span className="item-tile-name">{nameOf(definition)}</span>
                  <span className="item-rarity-pips" aria-hidden="true">
                    {'◆'.repeat(rarityPips[definition.rarity])}
                  </span>
                  {total > 1 && (
                    <span className="item-seal" aria-hidden="true">
                      {total}
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
      {loose.length === 0 && (
        <EmptyPanel
          art="satchel"
          title={t('inventory.empty')}
          action={
            canAdd ? (
              <Button
                leftSection={<Plus size={16} aria-hidden="true" />}
                onClick={(event) => onAdd(event.currentTarget)}
              >
                {t('inventory.add')}
              </Button>
            ) : undefined
          }
        >
          {canAdd ? t('inventory.emptyHelp') : t('inventory.emptyView')}
        </EmptyPanel>
      )}
      {loose.length > 0 && visible.length === 0 && (
        <Group className="satchel-empty">
          <Text c="dimmed">{t('inventory.noMatches')}</Text>
        </Group>
      )}
    </div>
  )
}
