import { useMemo, useState } from 'react'
import { Group, Text, TextInput, UnstyledButton } from '@mantine/core'
import { Plus, Search } from 'lucide-react'
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

const categoryIcons: Record<ItemCategory, string> = {
  weapon: 'sword',
  armor: 'shirt',
  shield: 'shield',
  gear: 'backpack',
  consumable: 'flask-conical',
  ammo: 'feather',
  tool: 'wrench',
  treasure: 'gem',
  quest: 'scroll',
}
const rarityPips = { common: 1, uncommon: 2, rare: 3, very_rare: 4, legendary: 5, artifact: 6 }

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
  const { t } = useTranslation()
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
      </div>
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
                  <ItemIcon icon={definition.icon} />
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
