import { describe, expect, it } from 'vitest'
import {
  cartTenths,
  cartTotal,
  effectiveLinePrice,
  filterListings,
  maxPurchasable,
  modifiedPrice,
  ownership,
  reconcileCart,
  sellableUnits,
  shopError,
  type Listing,
  type OrderLine,
} from './shops'

const listing = (over: Partial<Listing> = {}, item: Partial<Listing['item']> = {}): Listing => ({
  id: crypto.randomUUID(),
  price: 50,
  unit_price: 40,
  stock: 2,
  exclusive: false,
  item: {
    id: crypto.randomUUID(),
    name: 'Healing potion',
    category: 'consumable',
    icon: 'flask-round',
    rarity: 'common',
    weight_tenths: 5,
    description: '',
    slot_kind: 'none',
    properties: {},
    ...item,
  },
  ...over,
})
const stack = (
  definition_id: string,
  quantity: number,
  source: string,
  equipped_slot: string | null = null,
) => ({
  definition_id,
  quantity,
  source,
  equipped_slot,
})

describe('shop pricing', () => {
  it('rounds modifiers like the server and never goes negative', () => {
    expect(modifiedPrice(50, -20)).toBe(40)
    expect(modifiedPrice(15, -50)).toBe(8)
    expect(modifiedPrice(10, -100)).toBe(0)
    expect(modifiedPrice(10, 25)).toBe(13)
  })
  it('totals carts at list price, or offers in approval shops, with weight in tenths', () => {
    const potion = listing()
    const sword = listing({ unit_price: 15, stock: null }, { name: 'Longsword', weight_tenths: 30 })
    const lines = [
      { listingId: potion.id, quantity: 2, offeredPrice: 30 },
      { listingId: sword.id, quantity: 1, offeredPrice: null },
    ]
    expect(cartTotal(lines, [potion, sword], 'auto')).toBe(95)
    expect(cartTotal(lines, [potion, sword], 'approval')).toBe(75)
    expect(cartTenths(lines, [potion, sword])).toBe(40)
  })
  it('reconciles carts with current stock and removed listings', () => {
    const potion = listing({ stock: 1 })
    expect(
      reconcileCart(
        [
          { listingId: potion.id, quantity: 3, offeredPrice: null },
          { listingId: crypto.randomUUID(), quantity: 1, offeredPrice: null },
        ],
        [potion],
      ),
    ).toEqual([{ listingId: potion.id, quantity: 1, offeredPrice: null }])
    expect(maxPurchasable({ stock: null })).toBe(999)
    expect(
      reconcileCart(
        [{ listingId: potion.id, quantity: 1, offeredPrice: null }],
        [listing({ id: potion.id, stock: 0 })],
      ),
    ).toEqual([])
  })
  it('uses the final, countered, offered then list price', () => {
    const line: OrderLine = {
      id: crypto.randomUUID(),
      definition_id: crypto.randomUUID(),
      item_name: 'Rope',
      icon: 'package',
      quantity: 1,
      unit_price: 10,
      offered_price: 8,
      countered_price: 9,
      final_price: null,
      reverted_quantity: 0,
    }
    expect(effectiveLinePrice(line)).toBe(9)
    expect(effectiveLinePrice({ ...line, countered_price: null })).toBe(8)
  })
  it('filters listings by name and category', () => {
    const items = [listing(), listing({}, { name: 'Longsword', category: 'weapon' })]
    expect(filterListings(items, 'sword', 'all').map((l) => l.item.name)).toEqual(['Longsword'])
    expect(filterListings(items, '', 'consumable')).toHaveLength(1)
  })
})

describe('holdings', () => {
  it('counts owned and equipped units across stacks', () => {
    const sword = crypto.randomUUID()
    expect(ownership([stack(sword, 2, 'shop'), stack(sword, 1, 'dm', 'main_hand')], sword)).toEqual(
      {
        owned: 3,
        equipped: 1,
      },
    )
  })
  it('only sells loose units the DM or a shop provided', () => {
    const potion = crypto.randomUUID()
    const pebble = crypto.randomUUID()
    const units = sellableUnits([
      stack(potion, 2, 'shop'),
      stack(potion, 1, 'dm'),
      stack(potion, 1, 'shop', 'belt'),
      stack(pebble, 5, 'player'),
    ])
    expect(units.get(potion)).toBe(3)
    expect(units.has(pebble)).toBe(false)
  })
  it('maps server messages to stable codes', () => {
    expect(shopError('Insufficient gold').code).toBe('insufficient_gold')
    expect(shopError('network down').code).toBe('unavailable')
  })
})
