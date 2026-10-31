// Equipment mechanics from the System Reference Document 5.2 by Wizards of the Coast LLC,
// licensed under CC-BY-4.0: https://creativecommons.org/licenses/by/4.0/legalcode.
// Only names (localized through srdItem.* catalog keys), weights, costs and numbers are encoded.
import type { DefinitionDraft } from './item'

type Template = Omit<DefinitionDraft, 'name' | 'description' | 'origin' | 'rarity'> & {
  key: string
}
const lb = (pounds: number) => Math.round(pounds * 10)
const armor = (
  key: string,
  base: number,
  dexCap: number | null,
  pounds: number,
  gp: number,
  extra: { strReq?: number; stealthDisadvantage?: boolean } = {},
): Template => ({
  key,
  category: 'armor',
  icon: 'shirt',
  slot_kind: 'body',
  weight_tenths: lb(pounds),
  value_gp: gp,
  properties: { base, dexCap, ...extra },
})
const weapon = (
  key: string,
  dice: string,
  damageType: 'bludgeoning' | 'piercing' | 'slashing',
  pounds: number,
  gp: number,
  props: {
    twoHanded?: boolean
    finesse?: boolean
    ranged?: boolean
    thrown?: boolean
    range?: string
    versatileDice?: string
    icon?: string
  } = {},
): Template => {
  const { twoHanded, icon, ...rest } = props
  return {
    key,
    category: 'weapon',
    icon: icon ?? (props.ranged ? 'bow-arrow' : 'sword'),
    slot_kind: twoHanded ? 'two_hands' : 'one_hand',
    weight_tenths: lb(pounds),
    value_gp: gp,
    properties: { dice, damageType, ...rest },
  }
}
const gear = (
  key: string,
  category: DefinitionDraft['category'],
  icon: string,
  pounds: number,
  gp: number,
  properties: DefinitionDraft['properties'] = {},
): Template => ({
  key,
  category,
  icon,
  slot_kind: 'none',
  weight_tenths: lb(pounds),
  value_gp: gp,
  properties,
})

export const srdEquipment: Template[] = [
  armor('padded', 11, null, 8, 5, { stealthDisadvantage: true }),
  armor('leather', 11, null, 10, 10),
  armor('studdedLeather', 12, null, 13, 45),
  armor('hide', 12, 2, 12, 10),
  armor('chainShirt', 13, 2, 20, 50),
  armor('scaleMail', 14, 2, 45, 50, { stealthDisadvantage: true }),
  armor('breastplate', 14, 2, 20, 400),
  armor('halfPlate', 15, 2, 40, 750, { stealthDisadvantage: true }),
  armor('ringMail', 14, 0, 40, 30, { stealthDisadvantage: true }),
  armor('chainMail', 16, 0, 55, 75, { strReq: 13, stealthDisadvantage: true }),
  armor('splint', 17, 0, 60, 200, { strReq: 15, stealthDisadvantage: true }),
  armor('plate', 18, 0, 65, 1500, { strReq: 15, stealthDisadvantage: true }),
  {
    key: 'shield',
    category: 'shield',
    icon: 'shield',
    slot_kind: 'shield',
    weight_tenths: lb(6),
    value_gp: 10,
    properties: { acBonus: 2 },
  },
  weapon('club', '1d4', 'bludgeoning', 2, 0, { icon: 'hammer' }),
  weapon('dagger', '1d4', 'piercing', 1, 2, { finesse: true, thrown: true, range: '20/60' }),
  weapon('greatclub', '1d8', 'bludgeoning', 10, 0, { twoHanded: true, icon: 'hammer' }),
  weapon('handaxe', '1d6', 'slashing', 2, 5, { thrown: true, range: '20/60', icon: 'axe' }),
  weapon('javelin', '1d6', 'piercing', 2, 0, { thrown: true, range: '30/120' }),
  weapon('mace', '1d6', 'bludgeoning', 4, 5, { icon: 'hammer' }),
  weapon('quarterstaff', '1d6', 'bludgeoning', 4, 0, {
    versatileDice: '1d8',
    icon: 'wand-sparkles',
  }),
  weapon('spear', '1d6', 'piercing', 3, 1, { thrown: true, range: '20/60', versatileDice: '1d8' }),
  weapon('lightCrossbow', '1d8', 'piercing', 5, 25, {
    twoHanded: true,
    ranged: true,
    range: '80/320',
  }),
  weapon('shortbow', '1d6', 'piercing', 2, 25, { twoHanded: true, ranged: true, range: '80/320' }),
  weapon('battleaxe', '1d8', 'slashing', 4, 10, { versatileDice: '1d10', icon: 'axe' }),
  weapon('greataxe', '1d12', 'slashing', 7, 30, { twoHanded: true, icon: 'axe' }),
  weapon('greatsword', '2d6', 'slashing', 6, 50, { twoHanded: true }),
  weapon('longsword', '1d8', 'slashing', 3, 15, { versatileDice: '1d10' }),
  weapon('rapier', '1d8', 'piercing', 2, 25, { finesse: true }),
  weapon('scimitar', '1d6', 'slashing', 3, 25, { finesse: true }),
  weapon('shortsword', '1d6', 'piercing', 2, 10, { finesse: true }),
  weapon('warhammer', '1d8', 'bludgeoning', 5, 15, { versatileDice: '1d10', icon: 'hammer' }),
  weapon('longbow', '1d8', 'piercing', 2, 50, { twoHanded: true, ranged: true, range: '150/600' }),
  weapon('handCrossbow', '1d6', 'piercing', 3, 75, { ranged: true, range: '30/120' }),
  weapon('heavyCrossbow', '1d10', 'piercing', 18, 50, {
    twoHanded: true,
    ranged: true,
    range: '100/400',
  }),
  gear('potionOfHealing', 'consumable', 'flask-conical', 0.5, 50),
  gear('healersKit', 'consumable', 'heart-pulse', 3, 5, { usesPerItem: 10 }),
  gear('rations', 'consumable', 'drumstick', 2, 0),
  gear('arrows', 'ammo', 'feather', 0.05, 0),
  gear('bolts', 'ammo', 'target', 0.075, 0),
  gear('torch', 'consumable', 'flame', 1, 0),
  gear('backpack', 'gear', 'backpack', 5, 2),
  gear('bedroll', 'gear', 'tent', 7, 1),
  gear('rope', 'gear', 'link', 5, 1),
  gear('waterskin', 'gear', 'droplets', 5, 0),
  gear('lantern', 'gear', 'lamp', 2, 5),
  gear('crowbar', 'tool', 'wrench', 5, 2),
  gear('thievesTools', 'tool', 'key', 1, 25),
]
