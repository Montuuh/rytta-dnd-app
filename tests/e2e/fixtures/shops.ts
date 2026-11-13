import type { Page } from '@playwright/test'
import { campaignId, characterId, dmId, playerId, type identityFixture } from './identity.ts'

// HTTP contract fixture for the RYT-005 RPCs, layered over identityFixture's RYT-004
// inventory so purchases appear in the real inventory screen. It mimics visibility and money
// movement for browser flows only; SQL authorization, locking and idempotency are verified
// against PostgreSQL in tests/database/shops.test.ts.
type Fixture = Awaited<ReturnType<typeof identityFixture>>
type Definition = Fixture['inventory']['definitions'][number]
type Stack = Fixture['inventory']['stacks'][number]
const uuid = (group: string, n: number) =>
  `${group}000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const shopIds = { market: uuid('71', 1), smith: uuid('71', 2), vault: uuid('71', 3) }

type Listing = {
  id: string
  shop_id: string
  definition_id: string
  price: number
  stock: number | null
  visibility: 'shop' | 'hidden' | 'selected'
  access: string[]
  revision: number
}
type Shop = {
  id: string
  name: string
  description: string
  visibility: 'hidden' | 'party' | 'selected'
  mode: 'auto' | 'approval'
  resale_percent: number
  is_open: boolean
  access: string[]
  modifiers: { character_id: string; percent: number }[]
  revision: number
}
type Line = {
  id: string
  definition_id: string
  listing_id: string | null
  quantity: number
  unit_price: number
  offered_price: number | null
  countered_price: number | null
  final_price: number | null
  reverted_quantity: number
}
type Order = {
  id: string
  shop_id: string
  kind: 'purchase' | 'sale'
  status: string
  total: number
  refunded: number
  player_note: string
  dm_note: string
  created_at: string
  lines: Line[]
}

export async function shopsFixture(page: Page, fixture: Fixture, options: { gold?: number } = {}) {
  const { stacks, definitions, events } = fixture.inventory
  let counter = 100
  const next = (group: string) => uuid(group, counter++)
  let gold = options.gold ?? 120
  const byName = (name: string) => definitions.find((d) => d.name === name)!
  const potion = byName('Poción de curación')
  const sword = byName('Espada larga')
  const ring = byName('Anillo de la marea')
  const arrow = byName('Flecha')
  const shops: Shop[] = [
    {
      id: shopIds.market,
      name: 'Mercado del puerto',
      description: 'Puestos de pescadores y buhoneros.',
      visibility: 'party',
      mode: 'auto',
      resale_percent: 50,
      is_open: true,
      access: [],
      modifiers: [{ character_id: characterId, percent: -20 }],
      revision: 0,
    },
    {
      id: shopIds.smith,
      name: 'El Yunque de Ámbar',
      description: 'Herrería enana que acepta encargos.',
      visibility: 'party',
      mode: 'approval',
      resale_percent: 30,
      is_open: true,
      access: [],
      modifiers: [],
      revision: 0,
    },
    {
      id: shopIds.vault,
      name: 'Bóveda del contrabandista',
      description: '',
      visibility: 'hidden',
      mode: 'auto',
      resale_percent: 0,
      is_open: true,
      access: [],
      modifiers: [],
      revision: 0,
    },
  ]
  const listing = (
    shop: string,
    def: Definition,
    price: number,
    stock: number | null,
    extra: Partial<Listing> = {},
  ): Listing => ({
    id: next('73'),
    shop_id: shop,
    definition_id: String(def.id),
    price,
    stock,
    visibility: 'shop',
    access: [],
    revision: 0,
    ...extra,
  })
  const archived = new Set<string>()
  const listings: Listing[] = [
    listing(shopIds.market, potion, 50, 3),
    listing(shopIds.market, arrow, 1, null),
    listing(shopIds.market, ring, 300, 1, { visibility: 'selected', access: [characterId] }),
    listing(shopIds.smith, sword, 20, 2),
    listing(shopIds.vault, potion, 10, null),
  ]
  const definition = (id: string) => definitions.find((d) => d.id === id)!
  const line = (
    def: Definition,
    listingId: string | null,
    quantity: number,
    unit: number,
    extra: Partial<Line> = {},
  ): Line => ({
    id: next('76'),
    definition_id: String(def.id),
    listing_id: listingId,
    quantity,
    unit_price: unit,
    offered_price: null,
    countered_price: null,
    final_price: null,
    reverted_quantity: 0,
    ...extra,
  })
  const swordListing = listings[3]!.id
  const orders: Order[] = [
    {
      id: next('74'),
      shop_id: shopIds.smith,
      kind: 'purchase',
      status: 'countered',
      total: 18,
      refunded: 0,
      player_note: '¿Me la dejas en 15?',
      dm_note: 'Acero enano, 18 es mi última palabra.',
      created_at: '2026-11-01T18:00:00Z',
      lines: [line(sword, swordListing, 1, 20, { offered_price: 15, countered_price: 18 })],
    },
    {
      id: next('74'),
      shop_id: shopIds.smith,
      kind: 'purchase',
      status: 'pending',
      total: 30,
      refunded: 0,
      player_note: 'Para el viaje al faro.',
      dm_note: '',
      created_at: '2026-11-01T19:00:00Z',
      lines: [line(sword, swordListing, 2, 20, { offered_price: 15 })],
    },
    {
      id: next('74'),
      shop_id: shopIds.market,
      kind: 'purchase',
      status: 'completed',
      total: 40,
      refunded: 0,
      player_note: '',
      dm_note: '',
      created_at: '2026-11-01T17:00:00Z',
      lines: [line(potion, listings[0]!.id, 1, 40, { final_price: 40 })],
    },
  ]
  const shopStack = (defId: string): Stack => {
    const existing = stacks.find(
      (s) =>
        s.character_id === characterId &&
        s.definition_id === defId &&
        s.source === 'shop' &&
        !s.equipped_slot,
    )
    if (existing) return existing
    const row = {
      id: next('90'),
      campaign_id: campaignId,
      character_id: characterId,
      definition_id: defId,
      quantity: 0,
      equipped_slot: null,
      source: 'shop',
      notes: '',
      revision: 0,
    } as Stack
    stacks.push(row)
    return row
  }
  shopStack(String(potion.id)).quantity = 1
  const log = (row: Stack, actor: string, kind: string, delta: number) =>
    events.unshift({
      id: next('a0'),
      character_id: characterId,
      item_id: row.id,
      actor_id: actor,
      kind,
      quantity_delta: delta,
      after_value: {
        quantity: row.quantity,
        revision: row.revision,
        definition_id: row.definition_id,
      },
      undo_of: null,
      undone_by: null,
      created_at: new Date().toISOString(),
    })
  const add = (defId: string, quantity: number, actor: string, kind: string) => {
    const row = shopStack(defId)
    row.quantity += quantity
    row.revision += 1
    log(row, actor, kind, quantity)
  }
  const take = (defId: string, wanted: number, actor: string, kind: string, forRevert: boolean) => {
    let taken = 0
    for (const row of stacks
      .filter(
        (s) =>
          s.character_id === characterId &&
          s.definition_id === defId &&
          s.quantity > 0 &&
          (forRevert
            ? s.source === 'shop'
            : ['dm', 'shop'].includes(String(s.source)) && !s.equipped_slot),
      )
      .sort((a, b) => Number(!!a.equipped_slot) - Number(!!b.equipped_slot))) {
      if (taken >= wanted) break
      const n = Math.min(row.quantity, wanted - taken)
      row.quantity -= n
      row.revision += 1
      if (row.quantity === 0) row.equipped_slot = null
      log(row, actor, kind, -n)
      taken += n
    }
    return taken
  }
  const modifier = (shop: Shop) =>
    shop.modifiers.find((m) => m.character_id === characterId)?.percent ?? 0
  const price = (base: number, pct: number) => Math.max(0, Math.round((base * (100 + pct)) / 100))
  const shopVisible = (s: Shop) =>
    s.visibility === 'party' || (s.visibility === 'selected' && s.access.includes(characterId))
  const listingVisible = (l: Listing) =>
    l.visibility === 'shop' || (l.visibility === 'selected' && l.access.includes(characterId))
  const resale = (shop: Shop, defId: string) => {
    const own = listings.find((l) => l.shop_id === shop.id && l.definition_id === defId)
    return Math.floor(
      ((own?.price ?? Number(definition(defId).value_gp ?? 0)) * shop.resale_percent) / 100,
    )
  }
  const item = (def: Definition) => ({
    id: def.id,
    name: def.name,
    category: def.category,
    icon: def.icon,
    // As private.shop_item_json: the item's picture travels with the listing.
    image_path: def.image_path ?? null,
    rarity: def.rarity,
    weight_tenths: def.weight_tenths,
    description: def.description,
    slot_kind: def.slot_kind,
    properties: def.properties,
  })
  const effective = (l: Line) =>
    l.final_price ?? l.countered_price ?? l.offered_price ?? l.unit_price
  const result = (o: Order) => ({
    order_id: o.id,
    status: o.status,
    total: o.total,
    refunded: o.refunded,
    gold,
  })
  const complete = (o: Order, actor: string) => {
    const total = o.lines.reduce((sum, l) => sum + effective(l) * l.quantity, 0)
    if (o.kind === 'purchase' && total > gold) return 'Insufficient gold'
    for (const l of o.lines) {
      l.final_price = effective(l)
      const own = listings.find((x) => x.id === l.listing_id)
      if (o.kind === 'purchase') {
        if (own && own.stock !== null) own.stock -= l.quantity
        add(l.definition_id, l.quantity, actor, 'purchase')
      } else take(l.definition_id, l.quantity, actor, 'sale', false)
    }
    gold += o.kind === 'purchase' ? -total : total
    o.total = total
    o.status = 'completed'
    return null
  }
  const orderJson = (o: Order) => {
    const shop = shops.find((s) => s.id === o.shop_id)!
    return {
      id: o.id,
      kind: o.kind,
      status: o.status,
      total: o.total,
      refunded: o.refunded,
      player_note: o.player_note,
      dm_note: o.dm_note,
      created_at: o.created_at,
      updated_at: o.created_at,
      closed_at: null,
      shop: { id: shop.id, name: shop.name, mode: shop.mode },
      character: { id: characterId, name: 'Arin' },
      lines: o.lines.map(({ listing_id: _listing, ...l }) => ({
        ...l,
        item_name: definition(l.definition_id).name,
        icon: definition(l.definition_id).icon,
      })),
    }
  }

  await page.route('https://rytta-test.supabase.co/rest/v1/rpc/**', async (route) => {
    const request = route.request()
    const method = new URL(request.url()).pathname.split('/').at(-1)!
    let actor = playerId
    try {
      actor = JSON.parse(
        Buffer.from(request.headers().authorization!.split('.')[1]!, 'base64url').toString(),
      ).sub
    } catch {
      /* no bearer */
    }
    let body: Record<string, unknown> = {}
    try {
      body = request.postDataJSON() ?? {}
    } catch {
      /* no body */
    }
    const respond = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    const fail = (message: string) => respond({ message, code: 'P0001' }, 400)
    const newOrder = (shop: Shop, kind: 'purchase' | 'sale', lines: Line[]): Order => {
      const order: Order = {
        id: next('74'),
        shop_id: shop.id,
        kind,
        status: 'pending',
        total: 0,
        refunded: 0,
        player_note: String(body.note ?? ''),
        dm_note: '',
        created_at: new Date().toISOString(),
        lines,
      }
      order.total = lines.reduce((sum, l) => sum + effective(l) * l.quantity, 0)
      return order
    }
    switch (method) {
      case 'get_storefront':
        return respond({
          character_id: characterId,
          gold,
          shops: shops
            .filter((s) => !archived.has(s.id) && shopVisible(s))
            .map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              mode: s.mode,
              is_open: s.is_open,
              resale_percent: s.resale_percent,
              modifier: modifier(s),
              buyback: Object.fromEntries(
                stacks
                  .filter(
                    (st) =>
                      st.character_id === characterId &&
                      st.quantity > 0 &&
                      ['dm', 'shop'].includes(String(st.source)),
                  )
                  .map((st) => [st.definition_id, resale(s, String(st.definition_id))]),
              ),
              listings: listings
                .filter((l) => l.shop_id === s.id && listingVisible(l))
                .map((l) => ({
                  id: l.id,
                  price: l.price,
                  unit_price: price(l.price, modifier(s)),
                  stock: l.stock,
                  exclusive: l.visibility === 'selected',
                  item: item(definition(l.definition_id)),
                })),
            })),
        })
      case 'get_shop_admin':
        return respond({
          characters: [{ id: characterId, name: 'Arin', gold }],
          items: definitions
            .filter((d) => !d.archived && d.origin !== 'player')
            .map((d) => ({ ...item(d), value_gp: d.value_gp, origin: d.origin })),
          shops: shops
            .filter((s) => !archived.has(s.id))
            .map((s) => ({
              ...s,
              listings: listings
                .filter((l) => l.shop_id === s.id)
                .map(({ shop_id: _shop, ...l }) => l),
            })),
          pending_orders: orders.filter((o) => o.status === 'pending').length,
        })
      case 'list_shop_orders':
        return respond(
          [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(orderJson),
        )
      case 'checkout': {
        const shop = shops.find((s) => s.id === body.target_shop)!
        const order = newOrder(
          shop,
          'purchase',
          (
            body.order_lines as {
              listing_id: string
              quantity: number
              offered_price: number | null
            }[]
          ).map((l) => {
            const own = listings.find((x) => x.id === l.listing_id)!
            return line(
              definition(own.definition_id),
              own.id,
              l.quantity,
              price(own.price, modifier(shop)),
              {
                offered_price: shop.mode === 'approval' ? l.offered_price : null,
              },
            )
          }),
        )
        if (shop.mode === 'auto') {
          const error = complete(order, actor)
          if (error) return fail(error)
        }
        orders.push(order)
        return respond(result(order))
      }
      case 'sell_to_shop': {
        const shop = shops.find((s) => s.id === body.target_shop)!
        const order = newOrder(
          shop,
          'sale',
          (body.order_lines as { definition_id: string; quantity: number }[]).map((l) =>
            line(definition(l.definition_id), null, l.quantity, resale(shop, l.definition_id)),
          ),
        )
        if (shop.mode === 'auto') complete(order, actor)
        orders.push(order)
        return respond(result(order))
      }
      case 'respond_order': {
        const order = orders.find((o) => o.id === body.target_order)!
        order.dm_note = String(body.note ?? '')
        if (body.decision === 'approve') {
          const error = complete(order, actor)
          if (error) return fail(error)
        } else if (body.decision === 'reject') order.status = 'rejected'
        else {
          for (const p of body.line_prices as { line_id: string; price: number }[]) {
            const l = order.lines.find((x) => x.id === p.line_id)
            if (l) l.countered_price = p.price
          }
          order.status = 'countered'
          order.total = order.lines.reduce((sum, l) => sum + effective(l) * l.quantity, 0)
        }
        return respond(result(order))
      }
      case 'answer_counter_offer': {
        const order = orders.find((o) => o.id === body.target_order)!
        if (body.accept) {
          const error = complete(order, actor)
          if (error) return fail(error)
        } else order.status = 'cancelled'
        return respond(result(order))
      }
      case 'cancel_order':
        orders.find((o) => o.id === body.target_order)!.status = 'cancelled'
        return respond(null)
      case 'revert_order': {
        const order = orders.find((o) => o.id === body.target_order)!
        let refund = 0
        for (const l of order.lines) {
          const taken = take(
            l.definition_id,
            l.quantity - l.reverted_quantity,
            actor,
            'revert',
            true,
          )
          l.reverted_quantity += taken
          refund += taken * (l.final_price ?? 0)
        }
        gold += refund
        order.refunded = refund
        order.status = 'reverted'
        return respond(result(order))
      }
      case 'save_shop': {
        const draft = body.definition as Omit<Shop, 'id' | 'modifiers' | 'revision'>
        const existing = shops.find((s) => s.id === body.target_shop)
        if (existing) Object.assign(existing, draft, { revision: existing.revision + 1 })
        else shops.push({ ...draft, id: next('71'), modifiers: [], revision: 0 })
        return respond(existing?.id ?? shops.at(-1)!.id)
      }
      case 'save_listing': {
        const draft = body.definition as Omit<Listing, 'id' | 'shop_id' | 'revision'>
        const existing = listings.find((l) => l.id === body.target_listing)
        if (existing) Object.assign(existing, draft, { revision: existing.revision + 1 })
        else
          listings.push({
            ...draft,
            id: next('73'),
            shop_id: String(body.target_shop),
            revision: 0,
          })
        return respond(existing?.id ?? listings.at(-1)!.id)
      }
      case 'archive_shop': {
        // Archived shops leave every list but keep their orders in the ledger, as in SQL.
        const shop = shops.find((s) => s.id === body.target_shop)
        if (shop) archived.add(shop.id)
        return respond(null)
      }
      case 'archive_listing': {
        const index = listings.findIndex((l) => l.id === body.target_listing)
        if (index >= 0) listings.splice(index, 1)
        return respond(null)
      }
      // RYT-032: listings follow the definition lifecycle; holdings stay in identityFixture.
      case 'item_definition_impact': {
        if (actor !== dmId) return fail('Forbidden')
        const held = stacks.filter((s) => s.definition_id === body.target_definition)
        return respond({
          listings: listings
            .filter((l) => l.definition_id === body.target_definition && !archived.has(l.shop_id))
            .map((l) => ({
              id: l.id,
              shop_id: l.shop_id,
              shop_name: shops.find((s) => s.id === l.shop_id)!.name,
              price: l.price,
              stock: l.stock,
              revision: l.revision,
            })),
          holders: new Set(held.filter((s) => s.quantity > 0).map((s) => s.character_id)).size,
          units: held.reduce((n, s) => n + s.quantity, 0),
          open_orders: orders.filter(
            (o) =>
              ['pending', 'countered'].includes(o.status) &&
              o.lines.some((l) => l.definition_id === body.target_definition),
          ).length,
        })
      }
      case 'archive_item_definition': {
        for (let i = listings.length - 1; i >= 0; i--)
          if (listings[i]!.definition_id === body.target_definition) listings.splice(i, 1)
        return route.fallback()
      }
      case 'sync_listing_prices': {
        if (actor !== dmId) return fail('Forbidden')
        const ids = body.listing_ids as string[]
        let updated = 0
        for (const l of listings)
          if (ids.includes(l.id) && l.price !== body.new_price) {
            l.price = Number(body.new_price)
            l.revision += 1
            updated++
          }
        return respond({ updated })
      }
      case 'set_shop_modifier': {
        const shop = shops.find((s) => s.id === body.target_shop)!
        shop.modifiers = [
          ...shop.modifiers.filter((m) => m.character_id !== body.target_character),
          ...(body.new_percent
            ? [{ character_id: String(body.target_character), percent: Number(body.new_percent) }]
            : []),
        ]
        return respond(null)
      }
      default:
        return route.fallback()
    }
  })
  return { dmId, gold: () => gold }
}
