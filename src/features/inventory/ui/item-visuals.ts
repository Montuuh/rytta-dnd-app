import { Ban, Check, GitMerge, Hourglass, X, type LucideIcon } from 'lucide-react'
import type { ProposalStatus } from '../domain/catalogue'
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

/** RYT-105 proposal states; the word always travels with the glyph. */
export const statusGlyphs: Record<ProposalStatus, LucideIcon> = {
  pending: Hourglass,
  accepted: Check,
  merged: GitMerge,
  rejected: X,
  cancelled: Ban,
}
