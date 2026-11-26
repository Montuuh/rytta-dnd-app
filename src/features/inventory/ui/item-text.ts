import { useTranslation } from 'react-i18next'
import { formatGp } from '@/shared/lib/money'
import { localizedName } from '@/shared/lib/translations'
import { unitPounds, type ItemDefinition } from '../domain/item'
import { useWeightFormat } from './use-weight'

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`

/**
 * The lines the storeroom writes about an item, in the reader's language and weight unit: the
 * muted "category · rarity · weight" line of a row, the price, the item's name and the properties
 * that exist (damage, armor, supplies...) for the item sheet.
 */
export function useItemText() {
  const { t, i18n } = useTranslation()
  const { format } = useWeightFormat()
  const nameOf = (item: ItemDefinition) => localizedName(item, i18n.language)
  const weight = (item: ItemDefinition) =>
    unitPounds(item) > 0 ? format(unitPounds(item)).replaceAll(' ', ' ') : null
  const price = (item: ItemDefinition) =>
    item.value_gp === null
      ? t('store.noValue')
      : t('store.value', { value: formatGp(item.value_gp, i18n.language) })
  const kind = (item: ItemDefinition) =>
    [t(`inventory.category.${item.category}`), t(`inventory.rarity.${item.rarity}`)].join(' · ')
  const meta = (item: ItemDefinition) => [kind(item), weight(item)].filter(Boolean).join(' · ')
  const facts = (item: ItemDefinition) => {
    const p = item.properties
    return [
      item.category === 'weapon' && p.dice
        ? `${p.dice} ${t(`inventory.damage.${p.damageType ?? 'slashing'}`)}`
        : null,
      item.category === 'weapon' && p.attackBonus
        ? `${signed(p.attackBonus)} ${t('inventory.forge.attackShort')}`
        : null,
      item.category === 'weapon' && p.damageBonus
        ? `${signed(p.damageBonus)} ${t('inventory.forge.damageShort')}`
        : null,
      item.category === 'armor' ? `${t('inventory.card.armor')} ${p.base ?? 10}` : null,
      item.category === 'shield' ? `+${p.acBonus ?? 2} ${t('inventory.card.shield')}` : null,
      item.category !== 'shield' && p.acBonus
        ? `${signed(p.acBonus)} ${t('inventory.forge.acShort')}`
        : null,
      p.speedBonus ? `${signed(p.speedBonus)} ${t('inventory.card.feet')}` : null,
      p.rations ? t('items.supplies.rationsEach', { count: p.rations }) : null,
      p.water ? t('items.supplies.waterEach', { count: p.water }) : null,
      p.container?.loadReductionPercent
        ? t('items.container.reductionShort', { percent: p.container.loadReductionPercent })
        : null,
    ].filter((fact): fact is string => Boolean(fact))
  }
  return { nameOf, meta, kind, weight, price, facts }
}
