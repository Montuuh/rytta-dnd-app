import type { ItemCategory } from '../domain/item'

// Shared icon and rarity marks for satchel tiles, the storeroom and shops.
export const categoryIcons: Record<ItemCategory, string> = {
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
export const rarityPips = {
  common: 1,
  uncommon: 2,
  rare: 3,
  very_rare: 4,
  legendary: 5,
  artifact: 6,
}
