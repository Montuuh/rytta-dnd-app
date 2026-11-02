import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const one = async <T = unknown>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
const json = (value: unknown) => JSON.stringify(value)
type Order = { order_id: string; status: string; total: number; gold: number; refunded: number }
type Storefront = {
  gold: number
  shops: {
    id: string
    buyback: Record<string, number>
    listings: {
      id: string
      unit_price: number
      stock: number | null
      exclusive: boolean
      item: Record<string, unknown>
    }[]
  }[]
}
type Stack = {
  id: string
  name: string
  quantity: number
  equipped_slot: string | null
  source: string
  revision: number
}

const definition = async (c: string, item: Record<string, unknown>) =>
  (
    await one<{ id: string }>('select public.save_item_definition($1,null,null,$2,$3) result', [
      c,
      json(item),
      randomUUID(),
    ])
  ).id
const shop = (c: string, definition: Record<string, unknown>) =>
  one<string>('select public.save_shop($1,null,null,$2,$3) result', [
    c,
    json(definition),
    randomUUID(),
  ])
const listing = (c: string, s: string, definition: Record<string, unknown>) =>
  one<string>('select public.save_listing($1,$2,null,null,$3,$4) result', [
    c,
    s,
    json(definition),
    randomUUID(),
  ])
const checkout = (c: string, s: string, ch: string, lines: unknown[], key = randomUUID()) =>
  one<Order>('select public.checkout($1,$2,$3,$4,$5,$6) result', [c, s, ch, json(lines), '', key])
const sell = (c: string, s: string, ch: string, lines: unknown[]) =>
  one<Order>('select public.sell_to_shop($1,$2,$3,$4,$5,$6) result', [
    c,
    s,
    ch,
    json(lines),
    '',
    randomUUID(),
  ])
const storefront = (c: string, ch: string) =>
  one<Storefront>('select public.get_storefront($1,$2) result', [c, ch])
const stacks = async (ch: string) => {
  await db.exec('reset role')
  return (
    await db.query<Stack>(
      `select i.id, d.name, i.quantity, i.equipped_slot, i.source, i.revision::int revision
         from public.inventory_items i join public.item_definitions d on d.id = i.definition_id
        where i.character_id = $1 and i.quantity > 0 order by d.name, i.equipped_slot nulls first`,
      [ch],
    )
  ).rows
}
const gold = async (ch: string) => {
  await db.exec('reset role')
  return (
    await db.query<{ gold: number }>(
      'select gold::int gold from public.character_resources where character_id=$1',
      [ch],
    )
  ).rows[0]!.gold
}
const setGold = async (ch: string, value: number) => {
  await db.exec('reset role')
  await db.query('update public.character_resources set gold=$2 where character_id=$1', [ch, value])
}
const grant = async (c: string, ch: string, def: string, amount: number) => {
  await asUser(dm)
  await db.query('select public.grant_item($1,$2,$3,$4,$5)', [c, ch, def, amount, randomUUID()])
}

async function setup() {
  await asUser(dm)
  const c = await one<string>("select public.create_campaign('Market town') result")
  const ch = await one<string>("select public.create_character($1, 'Arin') result", [c])
  const peerCh = await one<string>("select public.create_character($1, 'Bea') result", [c])
  for (const [user, email, character] of [
    [player, 'player@example.com', ch],
    [peer, 'peer@example.com', peerCh],
  ] as const) {
    await asUser(dm)
    const id = await one<string>('select public.invite_character_player($1,$2,$3) result', [
      c,
      character,
      email,
    ])
    await asUser(user)
    await db.query('select public.respond_campaign_invitation($1,true)', [id])
  }
  await asUser(dm)
  const potion = await definition(c, {
    name: 'Healing potion',
    category: 'consumable',
    weight_tenths: 5,
    value_gp: 50,
  })
  const sword = await definition(c, {
    name: 'Longsword',
    category: 'weapon',
    weight_tenths: 30,
    value_gp: 15,
    slot_kind: 'one_hand',
  })
  const ring = await definition(c, {
    name: 'Ring of warmth',
    category: 'treasure',
    value_gp: 300,
    slot_kind: 'ring',
  })
  const market = await shop(c, {
    name: 'Market',
    visibility: 'party',
    mode: 'auto',
    resale_percent: 50,
  })
  const potionListing = await listing(c, market, { definition_id: potion, price: 50, stock: 2 })
  const swordListing = await listing(c, market, { definition_id: sword, price: 15 })
  const secretListing = await listing(c, market, {
    definition_id: ring,
    price: 300,
    visibility: 'selected',
    access: [ch],
  })
  await setGold(ch, 200)
  await setGold(peerCh, 200)
  return { c, ch, peerCh, potion, sword, ring, market, potionListing, swordListing, secretListing }
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [peer, 'peer@example.com'],
    [outsider, 'other@example.com'],
    [otherDm, 'otherdm@example.com'],
  ])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, delete on storage.objects to authenticated;`)
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 30000)
afterAll(() => db.close())

describe('RYT-005 access matrix', () => {
  it('denies tables and every RPC to anon, outsiders, peers and other DMs', async () => {
    const s = await setup()
    await asUser(otherDm)
    await one("select public.create_campaign('Elsewhere') result")
    const line = [{ listing_id: s.swordListing, quantity: 1 }]
    for (const user of [outsider, otherDm]) {
      await asUser(user)
      await expect(storefront(s.c, s.ch)).rejects.toThrow(/Forbidden/)
      await expect(db.query('select public.get_shop_admin($1)', [s.c])).rejects.toThrow(/Forbidden/)
      await expect(db.query('select public.list_shop_orders($1,null)', [s.c])).rejects.toThrow(
        /Forbidden/,
      )
      await expect(shop(s.c, { name: 'Forged' })).rejects.toThrow(/Forbidden/)
      await expect(checkout(s.c, s.market, s.ch, line)).rejects.toThrow(/Forbidden/)
    }
    await asUser(peer)
    await expect(storefront(s.c, s.ch)).rejects.toThrow(/Forbidden/)
    await expect(db.query('select public.list_shop_orders($1,$2)', [s.c, s.ch])).rejects.toThrow(
      /Forbidden/,
    )
    await expect(checkout(s.c, s.market, s.ch, line)).rejects.toThrow(/Forbidden/)
    await asUser(player)
    await expect(db.query('select public.get_shop_admin($1)', [s.c])).rejects.toThrow(/Forbidden/)
    await expect(shop(s.c, { name: 'Forged' })).rejects.toThrow(/Forbidden/)
    await expect(listing(s.c, s.market, { definition_id: s.sword, price: 0 })).rejects.toThrow(
      /Forbidden/,
    )
    await expect(
      db.query('select public.set_shop_modifier($1,$2,$3,-50)', [s.c, s.market, s.ch]),
    ).rejects.toThrow(/Forbidden/)
    for (const table of ['shops', 'shop_listings', 'shop_orders', 'shop_modifiers']) {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/)
      await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/)
    }
    await asAnon()
    await expect(storefront(s.c, s.ch)).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.shops')).rejects.toThrow(/permission denied/)
  })

  it('hides hidden shops, hidden listings, others exclusives and the DM value', async () => {
    const s = await setup()
    await asUser(dm)
    const vault = await shop(s.c, { name: 'Vault', visibility: 'hidden' })
    const vaultPotion = await listing(s.c, vault, { definition_id: s.potion, price: 1 })
    const guild = await shop(s.c, { name: 'Guild', visibility: 'selected', access: [s.peerCh] })
    await asUser(player)
    const mine = await storefront(s.c, s.ch)
    expect(mine.shops.map((x) => x.id)).toEqual([s.market])
    expect(mine.shops[0]!.listings.map((x) => x.id).sort()).toEqual(
      [s.potionListing, s.swordListing, s.secretListing].sort(),
    )
    expect(mine.shops[0]!.listings.find((x) => x.id === s.secretListing)!.exclusive).toBe(true)
    expect(mine.shops[0]!.listings[0]!.item).not.toHaveProperty('value_gp')
    await expect(
      checkout(s.c, vault, s.ch, [{ listing_id: vaultPotion, quantity: 1 }]),
    ).rejects.toThrow(/Unavailable shop/)
    await asUser(peer)
    const theirs = await storefront(s.c, s.peerCh)
    expect(theirs.shops.map((x) => x.id).sort()).toEqual([s.market, guild].sort())
    expect(theirs.shops.find((x) => x.id === s.market)!.listings.map((x) => x.id)).not.toContain(
      s.secretListing,
    )
    await expect(
      checkout(s.c, s.market, s.peerCh, [{ listing_id: s.secretListing, quantity: 1 }]),
    ).rejects.toThrow(/Unavailable listing/)
  })
})

describe('RYT-005 purchases', () => {
  it('charges server prices with modifiers into a shop stack, idempotently', async () => {
    const s = await setup()
    await asUser(dm)
    await db.query('select public.set_shop_modifier($1,$2,$3,-20)', [s.c, s.market, s.ch])
    await asUser(player)
    const front = await storefront(s.c, s.ch)
    expect(front.shops[0]!.listings.find((x) => x.id === s.potionListing)!.unit_price).toBe(40)
    const key = randomUUID()
    const lines = [
      { listing_id: s.potionListing, quantity: 2, offered_price: 0 },
      { listing_id: s.swordListing, quantity: 1 },
    ]
    const result = await checkout(s.c, s.market, s.ch, lines, key)
    expect(result).toMatchObject({ status: 'completed', total: 92, gold: 108 })
    await asUser(player)
    expect(await checkout(s.c, s.market, s.ch, lines, key)).toEqual(result)
    await expect(
      checkout(s.c, s.market, s.ch, [{ listing_id: s.swordListing, quantity: 9 }], key),
    ).rejects.toThrow(/Request mismatch/)
    expect(await gold(s.ch)).toBe(108)
    expect((await stacks(s.ch)).map((x) => [x.name, x.quantity, x.source])).toEqual([
      ['Healing potion', 2, 'shop'],
      ['Longsword', 1, 'shop'],
    ])
    await db.exec('reset role')
    expect(
      (
        await db.query<{ kind: string }>(
          'select kind from public.inventory_events where character_id=$1',
          [s.ch],
        )
      ).rows.map((r) => r.kind),
    ).toEqual(['purchase', 'purchase'])
    await asUser(player)
    await expect(
      checkout(s.c, s.market, s.ch, [{ listing_id: s.potionListing, quantity: 1 }]),
    ).rejects.toThrow(/Out of stock/)
    await asUser(dm)
    const ledger = await one<{ character: { id: string }; status: string }[]>(
      'select public.list_shop_orders($1,null) result',
      [s.c],
    )
    expect(ledger.map((o) => [o.character.id, o.status])).toEqual([[s.ch, 'completed']])
  })

  it('purchase events are not undoable from the inventory', async () => {
    const s = await setup()
    await asUser(player)
    await checkout(s.c, s.market, s.ch, [{ listing_id: s.potionListing, quantity: 1 }])
    await db.exec('reset role')
    const event = (
      await db.query<{ id: string }>(
        "select id from public.inventory_events where character_id=$1 and kind='purchase'",
        [s.ch],
      )
    ).rows[0]!.id
    await asUser(player)
    await expect(
      db.query('select public.undo_inventory_event($1,$2,$3)', [s.c, event, randomUUID()]),
    ).rejects.toThrow(/Not undoable/)
  })

  it('rejects insufficient gold atomically and serializes the last unit', async () => {
    const s = await setup()
    await setGold(s.ch, 40)
    await asUser(player)
    await expect(
      checkout(s.c, s.market, s.ch, [{ listing_id: s.potionListing, quantity: 1 }]),
    ).rejects.toThrow(/Insufficient gold/)
    expect(await stacks(s.ch)).toHaveLength(0)
    await setGold(s.ch, 500)
    await asUser(player)
    await checkout(s.c, s.market, s.ch, [{ listing_id: s.potionListing, quantity: 1 }])
    await asUser(peer)
    await checkout(s.c, s.market, s.peerCh, [{ listing_id: s.potionListing, quantity: 1 }])
    await asUser(player)
    await expect(
      checkout(s.c, s.market, s.ch, [{ listing_id: s.potionListing, quantity: 1 }]),
    ).rejects.toThrow(/Out of stock/)
  })

  it('approval shop: request, counter-offer, accept; nothing moves until closed', async () => {
    const s = await setup()
    await asUser(dm)
    const smith = await shop(s.c, { name: 'Smith', visibility: 'party', mode: 'approval' })
    const blade = await listing(s.c, smith, { definition_id: s.sword, price: 20, stock: 1 })
    await asUser(player)
    const request = await checkout(s.c, smith, s.ch, [
      { listing_id: blade, quantity: 1, offered_price: 10 },
    ])
    expect(request).toMatchObject({ status: 'pending', total: 10, gold: 200 })
    expect(await stacks(s.ch)).toHaveLength(0)
    await asUser(player)
    await expect(
      db.query('select public.respond_order($1,$2,$3,null,null,$4)', [
        s.c,
        request.order_id,
        'approve',
        randomUUID(),
      ]),
    ).rejects.toThrow(/Forbidden/)
    await asUser(dm)
    const orders = await one<{ lines: { id: string }[] }[]>(
      'select public.list_shop_orders($1,null) result',
      [s.c],
    )
    const countered = await one<Order>('select public.respond_order($1,$2,$3,$4,$5,$6) result', [
      s.c,
      request.order_id,
      'counter',
      json([{ line_id: orders[0]!.lines[0]!.id, price: 16 }]),
      'Fine steel',
      randomUUID(),
    ])
    expect(countered).toMatchObject({ status: 'countered', total: 16 })
    await asUser(peer)
    await expect(
      db.query('select public.answer_counter_offer($1,$2,true,$3)', [
        s.c,
        request.order_id,
        randomUUID(),
      ]),
    ).rejects.toThrow(/Forbidden/)
    await asUser(player)
    const accepted = await one<Order>('select public.answer_counter_offer($1,$2,true,$3) result', [
      s.c,
      request.order_id,
      randomUUID(),
    ])
    expect(accepted).toMatchObject({ status: 'completed', total: 16, gold: 184 })
    expect((await stacks(s.ch)).map((x) => x.name)).toEqual(['Longsword'])
    await asUser(player)
    await expect(
      db.query('select public.cancel_order($1,$2)', [s.c, request.order_id]),
    ).rejects.toThrow(/Invalid state/)
  })

  it('DM approval re-validates gold; reject and cancel close without moving gold', async () => {
    const s = await setup()
    await asUser(dm)
    const smith = await shop(s.c, { name: 'Smith', visibility: 'party', mode: 'approval' })
    const blade = await listing(s.c, smith, { definition_id: s.sword, price: 150 })
    await asUser(player)
    const first = await checkout(s.c, smith, s.ch, [{ listing_id: blade, quantity: 1 }])
    const second = await checkout(s.c, smith, s.ch, [{ listing_id: blade, quantity: 1 }])
    await setGold(s.ch, 100)
    await asUser(dm)
    await expect(
      db.query('select public.respond_order($1,$2,$3,null,null,$4)', [
        s.c,
        first.order_id,
        'approve',
        randomUUID(),
      ]),
    ).rejects.toThrow(/Insufficient gold/)
    expect(
      await one<Order>('select public.respond_order($1,$2,$3,null,$4,$5) result', [
        s.c,
        first.order_id,
        'reject',
        'Too pricey for you',
        randomUUID(),
      ]),
    ).toMatchObject({ status: 'rejected', gold: 100 })
    await asUser(player)
    await db.query('select public.cancel_order($1,$2)', [s.c, second.order_id])
    expect(await gold(s.ch)).toBe(100)
  })
})

describe('RYT-005 sales and revert', () => {
  it('sells loose dm/shop units at the floor price, never player-made items', async () => {
    const s = await setup()
    await asUser(player)
    await checkout(s.c, s.market, s.ch, [{ listing_id: s.swordListing, quantity: 3 }])
    const sold = await sell(s.c, s.market, s.ch, [{ definition_id: s.sword, quantity: 2 }])
    // 15 * 50% = 7.5 → 7 per unit; gold 200 - 45 + 14.
    expect(sold).toMatchObject({ status: 'completed', total: 14, gold: 169 })
    await asUser(player)
    await expect(
      sell(s.c, s.market, s.ch, [{ definition_id: s.sword, quantity: 2 }]),
    ).rejects.toThrow(/Insufficient items/)
    // A Player-created definition (no price, source player) cannot mint gold.
    await asUser(player)
    const trinket = await definition(s.c, { name: 'Lucky pebble', category: 'treasure' })
    await db.query('select public.grant_item($1,$2,$3,5,$4)', [s.c, s.ch, trinket, randomUUID()])
    await expect(
      sell(s.c, s.market, s.ch, [{ definition_id: trinket, quantity: 1 }]),
    ).rejects.toThrow(/Insufficient items/)
    await asUser(dm)
    await expect(listing(s.c, s.market, { definition_id: trinket, price: 1 })).rejects.toThrow(
      /Invalid request/,
    )
    const reverted = await one<Order>('select public.revert_order($1,$2,null,$3) result', [
      s.c,
      sold.order_id,
      randomUUID(),
    ])
    expect(reverted).toMatchObject({ status: 'reverted', gold: 155, refunded: 14 })
    expect((await stacks(s.ch)).find((x) => x.name === 'Longsword')!.quantity).toBe(3)
  })

  it('revert takes back remaining shop units, including equipped ones, and refunds them', async () => {
    const s = await setup()
    await grant(s.c, s.ch, s.sword, 1)
    await asUser(player)
    const bought = await checkout(s.c, s.market, s.ch, [
      { listing_id: s.potionListing, quantity: 2 },
      { listing_id: s.swordListing, quantity: 1 },
    ])
    const before = await stacks(s.ch)
    const potion = before.find((x) => x.name === 'Healing potion')!
    const shopSword = before.find((x) => x.name === 'Longsword' && x.source === 'shop')!
    await asUser(player)
    await db.query('select public.use_item($1,$2,$3,1,$4)', [
      s.c,
      potion.id,
      potion.revision,
      randomUUID(),
    ])
    await db.query('select public.equip_item($1,$2,$3,$4,$5)', [
      s.c,
      shopSword.id,
      shopSword.revision,
      'main_hand',
      randomUUID(),
    ])
    await expect(
      db.query('select public.revert_order($1,$2,null,$3)', [s.c, bought.order_id, randomUUID()]),
    ).rejects.toThrow(/Forbidden/)
    await asUser(dm)
    const reverted = await one<Order>('select public.revert_order($1,$2,null,$3) result', [
      s.c,
      bought.order_id,
      randomUUID(),
    ])
    // Paid 115; one potion was used, so 50 + 15 return.
    expect(reverted).toMatchObject({ status: 'reverted', refunded: 65, gold: 150 })
    await expect(
      db.query('select public.revert_order($1,$2,null,$3)', [s.c, bought.order_id, randomUUID()]),
    ).rejects.toThrow(/Invalid state/)
    // The DM-granted sword stays; only the shop units left.
    expect(
      (await stacks(s.ch)).map((x) => [x.name, x.quantity, x.source, x.equipped_slot]),
    ).toEqual([['Longsword', 1, 'dm', null]])
    await asUser(player)
    expect(
      (await storefront(s.c, s.ch)).shops[0]!.listings.find((x) => x.id === s.potionListing)!.stock,
    ).toBe(1)
  })
})

describe('RYT-026 private item images', () => {
  async function image(c: string, id: string) {
    const path = `public/${c}/${id}/${randomUUID()}.webp`
    await asUser(dm)
    await db.query("insert into storage.objects(bucket_id,name) values ('item-images',$1)", [path])
    await db.query('select public.set_item_image($1,$2,0,$3,$4)', [c, id, path, randomUUID()])
    return path
  }
  it('allows a DM to create without characters and attach, replay, replace and remove an image', async () => {
    await asUser(dm)
    const c = await one<string>("select public.create_campaign('Empty catalogue') result")
    const id = await definition(c, { name: 'Unassigned sword', category: 'weapon' })
    const path = `public/${c}/${id}/${randomUUID()}.webp`
    await db.query("insert into storage.objects(bucket_id,name) values ('item-images',$1)", [path])
    const key = randomUUID()
    const call = () => one('select public.set_item_image($1,$2,0,$3,$4) result', [c, id, path, key])
    expect(await call()).toEqual({ id, revision: 1 })
    expect(await call()).toEqual({ id, revision: 1 })
    await expect(
      db.query('select public.set_item_image($1,$2,0,null,$3)', [c, id, randomUUID()]),
    ).rejects.toThrow(/Stale revision/)
    await expect(
      db.query('select public.set_item_image($1,$2,1,$3,$4)', [
        c,
        id,
        path.replace('public/', 'pre/'),
        randomUUID(),
      ]),
    ).rejects.toThrow(/Invalid image path/)
    await expect(
      db.query('select public.set_item_image($1,$2,1,$3,$4)', [
        c,
        id,
        `public/${c}/${id}/${randomUUID()}.webp`,
        randomUUID(),
      ]),
    ).rejects.toThrow(/Image unavailable/)
    await db.query('select public.set_item_image($1,$2,1,null,$3)', [c, id, randomUUID()])
    expect(
      await one('select image_path result from public.item_definitions where id=$1', [id]),
    ).toBeNull()
  })
  it('matches selected storefront visibility and never exposes unattached or foreign images', async () => {
    const { c, ch, peerCh, ring } = await setup()
    const path = await image(c, ring)
    const pending = `public/${c}/${ring}/${randomUUID()}.webp`
    await db.query("insert into storage.objects(bucket_id,name) values ('item-images',$1)", [
      pending,
    ])
    await asUser(otherDm)
    await one("select public.create_campaign('Other image DM') result")
    for (const user of [peer, outsider, otherDm]) {
      await asUser(user)
      expect(
        (
          await db.query(
            "select name from storage.objects where bucket_id='item-images' and name=$1",
            [path],
          )
        ).rows,
      ).toEqual([])
      await expect(
        db.query('select public.set_item_image($1,$2,1,null,$3)', [c, ring, randomUUID()]),
      ).rejects.toThrow(/Forbidden/)
      await expect(
        db.query("insert into storage.objects(bucket_id,name) values ('item-images',$1)", [
          pending,
        ]),
      ).rejects.toThrow(/row-level security/)
    }
    await asUser(player)
    expect((await db.query('select name from storage.objects where name=$1', [path])).rows).toEqual(
      [{ name: path }],
    )
    expect(
      (await db.query('select name from storage.objects where name=$1', [pending])).rows,
    ).toEqual([])
    expect(
      (await storefront(c, ch)).shops.flatMap((s) => s.listings).find((l) => l.item.id === ring)
        ?.item.image_path,
    ).toBe(path)
    await asUser(peer)
    expect(
      (await storefront(c, peerCh)).shops
        .flatMap((s) => s.listings)
        .some((l) => l.item.id === ring),
    ).toBe(false)
    await asAnon()
    await expect(
      db.query('select public.set_item_image($1,$2,1,null,$3)', [c, ring, randomUUID()]),
    ).rejects.toThrow(/permission denied/)
    await expect(db.query('select private.item_image_access($1,false)', [path])).rejects.toThrow(
      /permission denied/,
    )
  })
  it('allows carried images independently of shops, but not after the last unit is gone', async () => {
    const { c, ch } = await setup()
    const id = await definition(c, { name: 'Secret gift', category: 'gear' })
    const path = await image(c, id)
    const granted = await one<{ item_id: string; revision: number }>(
      'select public.grant_item($1,$2,$3,1,$4) result',
      [c, ch, id, randomUUID()],
    )
    await asUser(player)
    expect(
      (await db.query('select name from storage.objects where name=$1', [path])).rows,
    ).toHaveLength(1)
    await db.query('select public.remove_item($1,$2,$3,1,$4)', [
      c,
      granted.item_id,
      granted.revision,
      randomUUID(),
    ])
    expect(
      (await db.query('select name from storage.objects where name=$1', [path])).rows,
    ).toHaveLength(0)
  })
})
