import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-104 / RYT-105 / RYT-107: decimal gold, weight in lb, translations, the basic catalogue
// import, templates, player search and proposals, merges, food and drink, shop kinds, images and
// bulk listings. Part 1 (additive) is exercised against data created before it and through the
// guarded PRE mirror; part 2 (release tightening) is applied in the middle of the file.
const part1 = '20261120120000_items_decimal_catalogue_proposals.sql'
const part2 = '20261121120000_items_player_authoring_close.sql'
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
type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const res = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
const json = (value: unknown) => JSON.stringify(value)
const asRoot = () => db.exec('reset role')
const row = async <T = Json>(sql: string, args: unknown[] = []) => {
  await asRoot()
  return (await db.query<T>(sql, args)).rows[0]!
}

const call = {
  define: (
    c: string,
    item: Json,
    id: string | null = null,
    rev: number | null = null,
    key = randomUUID(),
  ) =>
    res('select public.save_item_definition($1,$2,$3,$4,$5) result', [c, id, rev, json(item), key]),
  grant: (c: string, ch: string, def: string, amount = 1, key = randomUUID()) =>
    res('select public.grant_item($1,$2,$3,$4,$5) result', [c, ch, def, amount, key]),
  use: (c: string, item: string, rev: number, amount = 1, key = randomUUID()) =>
    res('select public.use_item($1,$2,$3,$4,$5) result', [c, item, rev, amount, key]),
  undo: (c: string, event: string, key = randomUUID()) =>
    res('select public.undo_inventory_event($1,$2,$3) result', [c, event, key]),
  gold: (c: string, ch: string, rev: number, gold: number | string, key = randomUUID()) =>
    db.query('select public.set_character_resources($1,$2,$3,$4,0,0,0,$5)', [
      c,
      ch,
      rev,
      gold,
      key,
    ]),
  import: (c: string, items: unknown, key = randomUUID(), update = false) =>
    res('select public.import_basic_items($1,$2,$3,$4) result', [c, json(items), key, update]),
  template: (c: string, def: string, on: boolean, rev: number, key = randomUUID()) =>
    res('select public.set_item_template($1,$2,$3,$4,$5) result', [c, def, on, rev, key]),
  search: (c: string, q = '', limit = 50) =>
    res<Json[]>('select public.search_campaign_items($1,$2,$3) result', [c, q, limit]),
  propose: (c: string, ch: string, draft: Json, qty = 1, key = randomUUID()) =>
    res('select public.propose_item($1,$2,$3,$4,$5) result', [c, ch, json(draft), qty, key]),
  proposals: (c: string, ch: string | null = null, closed = true) =>
    res<Json[]>('select public.list_item_proposals($1,$2,$3) result', [c, ch, closed]),
  cancel: (c: string, p: string, rev: number, key = randomUUID()) =>
    res('select public.cancel_item_proposal($1,$2,$3,$4) result', [c, p, rev, key]),
  resolve: (
    c: string,
    p: string,
    action: string,
    opts: {
      draft?: Json
      target?: string
      qty?: number
      note?: string
      rev?: number
      key?: string
    } = {},
  ) =>
    res('select public.resolve_item_proposal($1,$2,$3,$4,$5,$6,$7,$8,$9) result', [
      c,
      p,
      action,
      opts.draft ? json(opts.draft) : null,
      opts.target ?? null,
      opts.qty ?? null,
      opts.note ?? '',
      opts.rev ?? 0,
      opts.key ?? randomUUID(),
    ]),
  merge: (
    c: string,
    src: string,
    dst: string,
    srcRev: number,
    dstRev: number,
    key = randomUUID(),
  ) =>
    res('select public.merge_item_definitions($1,$2,$3,$4,$5,$6) result', [
      c,
      src,
      dst,
      srcRev,
      dstRev,
      key,
    ]),
  shop: (
    c: string,
    draft: Json,
    id: string | null = null,
    rev: number | null = null,
    key = randomUUID(),
  ) =>
    res<string>('select public.save_shop($1,$2,$3,$4,$5) result', [c, id, rev, json(draft), key]),
  listing: (c: string, s: string, draft: Json) =>
    res<string>('select public.save_listing($1,$2,null,null,$3,$4) result', [
      c,
      s,
      json(draft),
      randomUUID(),
    ]),
  addListings: (c: string, s: string, items: unknown, key = randomUUID()) =>
    res('select public.add_listings($1,$2,$3,$4) result', [c, s, json(items), key]),
  shopImage: (c: string, s: string, rev: number, path: string | null, key = randomUUID()) =>
    res('select public.set_shop_image($1,$2,$3,$4,$5) result', [c, s, rev, path, key]),
  checkout: (c: string, s: string, ch: string, lines: unknown, key = randomUUID()) =>
    res('select public.checkout($1,$2,$3,$4,$5,$6) result', [c, s, ch, json(lines), '', key]),
  sell: (c: string, s: string, ch: string, lines: unknown) =>
    res('select public.sell_to_shop($1,$2,$3,$4,$5,$6) result', [
      c,
      s,
      ch,
      json(lines),
      '',
      randomUUID(),
    ]),
  revert: (c: string, order: string) =>
    res('select public.revert_order($1,$2,null,$3) result', [c, order, randomUUID()]),
  storefront: (c: string, ch: string) => res('select public.get_storefront($1,$2) result', [c, ch]),
  admin: (c: string) => res('select public.get_shop_admin($1) result', [c]),
  modifier: (c: string, s: string, ch: string, pct: number) =>
    db.query('select public.set_shop_modifier($1,$2,$3,$4)', [c, s, ch, pct]),
}

const resources = (ch: string) =>
  row<{ gold: number; rations: number; water: number; revision: number }>(
    'select gold::float8 gold, rations, water_units water, revision::int revision from public.character_resources where character_id=$1',
    [ch],
  )
const definitionRow = (id: string) =>
  row(
    'select name, origin, created_by, value_gp::float8 value_gp, weight_lb::float8 weight_lb, weight_tenths, translations, basic_key, is_template, archived, revision::int revision from public.item_definitions where id=$1',
    [id],
  )
const stackRows = (ch: string) =>
  row<{ s: Json[] }>(
    `select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'definition_id', i.definition_id, 'quantity', i.quantity,
       'slot', i.equipped_slot, 'source', i.source) order by i.created_at, i.id), '[]') s
       from public.inventory_items i where i.character_id=$1 and i.quantity > 0`,
    [ch],
  ).then((r) => r.s)

async function setup() {
  await asUser(dm)
  const c = await res<string>("select public.create_campaign('Bazaar') result")
  const arin = await res<string>("select public.create_character($1,'Arin') result", [c])
  const bea = await res<string>("select public.create_character($1,'Bea') result", [c])
  for (const [user, email, character] of [
    [player, 'player@example.com', arin],
    [peer, 'peer@example.com', bea],
  ] as const) {
    await asUser(dm)
    const invite = await res<string>('select public.invite_character_player($1,$2,$3) result', [
      c,
      character,
      email,
    ])
    await asUser(user)
    await db.query('select public.respond_campaign_invitation($1,true)', [invite])
  }
  await asUser(otherDm)
  const other = await res<string>("select public.create_campaign('Elsewhere') result")
  await asUser(dm)
  return { c, arin, bea, other }
}

// State created by the previous schema, before part 1 runs.
const legacy: Record<string, string> = {}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
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
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files.filter((f) => f < part1))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  // Whole-gold data made by the old functions.
  const s = await setup()
  await db.query('select public.set_character_resources($1,$2,0,120,0,0,0,$3)', [
    s.c,
    s.arin,
    randomUUID(),
  ])
  const rope = await call.define(s.c, {
    name: 'Rope',
    category: 'gear',
    weight_tenths: 25,
    value_gp: 15,
  })
  const market = await call.shop(s.c, { name: 'Market', visibility: 'party', mode: 'auto' })
  await call.listing(s.c, market, { definition_id: rope.id, price: 15 })
  await asUser(player)
  const pebble = await call.define(s.c, { name: 'Lucky pebble', category: 'treasure' })
  await call.grant(s.c, s.arin, pebble.id, 2)
  Object.assign(legacy, {
    c: s.c,
    arin: s.arin,
    bea: s.bea,
    rope: rope.id,
    market,
    pebble: pebble.id,
  })
  // A PRE copied before part 1 exercises its guarded PRE mirror.
  await asRoot()
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  await db.exec(readFileSync(`supabase/migrations/${part1}`, 'utf8'))
}, 90000)
afterAll(() => db.close())

describe('part 1: backward compatible', () => {
  it('keeps existing whole-gold amounts, weights and reads unchanged', async () => {
    await asUser(player)
    const front = await call.storefront(legacy.c!, legacy.arin!)
    expect(front.gold).toBe(120)
    expect(Number.isInteger(front.gold)).toBe(true)
    expect(front.shops[0].listings[0]).toMatchObject({ price: 15, unit_price: 15 })
    expect(front.shops[0].listings[0].item).toMatchObject({
      weight_tenths: 25,
      weight_lb: 2.5,
      translations: null,
    })
    expect(front.shops[0]).toMatchObject({ kind: null, image_path: null })
    expect(await definitionRow(legacy.rope!)).toMatchObject({
      value_gp: 15,
      weight_lb: 2.5,
      weight_tenths: 25,
    })
    // The PRE copy received the same columns and functions.
    const pre = await row(
      'select gold::float8 gold from pre.character_resources where character_id=$1',
      [legacy.arin],
    )
    expect(pre.gold).toBe(120)
    const body = await row<{ def: string }>(
      "select pg_get_functiondef('pre.merge_item_definitions(uuid,uuid,uuid,bigint,bigint,uuid)'::regprocedure) def",
    )
    expect(body.def).toMatch(/pre_private\.shop_lock/)
    expect(body.def).not.toMatch(/\bpublic\.|\bprivate\./)
    // The Player-origin price ban moved from a table check to the RPCs, in PROD and PRE.
    expect(
      await row(`select count(*)::int n from pg_constraint where contype = 'c'
        and conrelid in ('public.item_definitions'::regclass, 'pre.item_definitions'::regclass)
        and pg_get_constraintdef(oid) like '%value_gp IS NULL%'`),
    ).toEqual({ n: 0 })
    expect(await row("select to_regclass('pre.item_proposals')::text t")).toEqual({
      t: 'pre.item_proposals',
    })
  })

  it('keeps whole-gold modifier and resale results for the deployed frontend', async () => {
    const s = await setup()
    const potion = await call.define(s.c, { name: 'Potion', category: 'consumable', value_gp: 7 })
    const shop = await call.shop(s.c, {
      name: 'Stall',
      visibility: 'party',
      mode: 'auto',
      resale_percent: 50,
    })
    await call.listing(s.c, shop, { definition_id: potion.id, price: 7 })
    await call.modifier(s.c, shop, s.arin, -15)
    await asUser(player)
    const front = await call.storefront(s.c, s.arin)
    // 7 x 0.85 = 5.95 -> 6 whole gold; resale 7 x 50% = 3.5 -> 3.
    expect(front.shops[0].listings[0].unit_price).toBe(6)
    await asUser(dm)
    await call.grant(s.c, s.arin, potion.id, 1)
    await asUser(player)
    expect((await call.storefront(s.c, s.arin)).shops[0].buyback[potion.id]).toBe(3)
  })

  it('refuses every fractional amount while part 1 is the latest (money_scale 0)', async () => {
    const s = await setup()
    expect(await row('select private.money_scale() n')).toEqual({ n: 0 })
    await asUser(dm)
    await expect(call.gold(s.c, s.arin, 0, 10.5)).rejects.toThrow(/Invalid request/)
    await call.gold(s.c, s.arin, 0, 50)
    await expect(
      call.define(s.c, { name: 'Potion', category: 'consumable', value_gp: 2.35 }),
    ).rejects.toThrow(/Invalid request/)
    const potion = await call.define(s.c, { name: 'Potion', category: 'consumable', value_gp: 2 })
    const shop = await call.shop(s.c, { name: 'Haggle', visibility: 'party', mode: 'approval' })
    await expect(call.listing(s.c, shop, { definition_id: potion.id, price: 1.5 })).rejects.toThrow(
      /Invalid request/,
    )
    await expect(
      call.addListings(s.c, shop, [{ definition_id: potion.id, price: 1.5 }]),
    ).rejects.toThrow(/Invalid request/)
    const listing = await call.listing(s.c, shop, { definition_id: potion.id, price: 2 })
    await expect(
      res('select public.sync_listing_prices($1,$2,$3,$4,$5) result', [
        s.c,
        potion.id,
        [listing],
        1.5,
        randomUUID(),
      ]),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      call.import(s.c, [{ key: 'bread', name: 'Bread', category: 'consumable', value_gp: 0.02 }]),
    ).rejects.toThrow(/Invalid item 1/)
    await call.grant(s.c, s.arin, potion.id, 2)
    await asUser(player)
    await expect(
      call.checkout(s.c, shop, s.arin, [{ listing_id: listing, quantity: 1, offered_price: 1.5 }]),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      res('select public.sell_to_shop($1,$2,$3,$4,$5,$6) result', [
        s.c,
        shop,
        s.arin,
        json([{ definition_id: potion.id, quantity: 1, offered_price: 0.5 }]),
        '',
        randomUUID(),
      ]),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      call.propose(s.c, s.arin, { name: 'Idea', category: 'gear', suggested_value_gp: 1.5 }),
    ).rejects.toThrow(/Invalid request/)
    const order = await call.checkout(s.c, shop, s.arin, [{ listing_id: listing, quantity: 1 }])
    await asUser(dm)
    await expect(
      res("select public.respond_order($1,$2,'counter',$3,'',$4) result", [
        s.c,
        order.order_id,
        json([{ line_id: randomUUID(), price: 1.5 }]),
        randomUUID(),
      ]),
    ).rejects.toThrow(/Invalid request/)
    const idea = await call.propose(s.c, s.arin, { name: 'Idea', category: 'gear' })
    await expect(
      call.resolve(s.c, idea.id, 'accept', {
        draft: { name: 'Idea', category: 'gear', value_gp: 1.5 },
        qty: 1,
      }),
    ).rejects.toThrow(/Invalid request/)
    // Trades: whole gold only.
    await asUser(player)
    const { trade_id: t } = await res('select public.invite_trade($1,$2,$3,$4) result', [
      s.c,
      s.arin,
      s.bea,
      randomUUID(),
    ])
    await asUser(peer)
    await res('select public.respond_trade_invite($1,$2,true,$3) result', [s.c, t, randomUUID()])
    await asUser(player)
    await expect(
      res('select public.set_trade_offer($1,$2,$3,1,$4,$5,$6) result', [
        s.c,
        t,
        s.arin,
        '[]',
        0.5,
        randomUUID(),
      ]),
    ).rejects.toThrow(/Invalid request/)
    await res('select public.cancel_trade($1,$2,$3) result', [s.c, t, s.arin])
  })

  it('still lets a Player create and grant their own price-free item', async () => {
    const s = await setup()
    await asUser(player)
    const own = await call.define(s.c, { name: 'Charm', category: 'treasure', weight_tenths: 3 })
    expect(await definitionRow(own.id)).toMatchObject({
      origin: 'player',
      value_gp: null,
      weight_lb: 0.3,
    })
    await asUser(player)
    const granted = await call.grant(s.c, s.arin, own.id, 2)
    expect(
      await row('select source from public.inventory_items where id=$1', [granted.item_id]),
    ).toEqual({
      source: 'player',
    })
    // The deployed flow still edits an own item that only lives in Player stacks.
    await asUser(player)
    await call.define(
      s.c,
      { name: 'Lucky charm', category: 'treasure', weight_tenths: 3 },
      own.id,
      0,
    )
    expect(await definitionRow(own.id)).toMatchObject({ name: 'Lucky charm', revision: 1 })
  })

  it('keeps supplies, containers and DM-touched items out of Player edits', async () => {
    const s = await setup()
    await asUser(player)
    for (const properties of [
      { rations: 1 },
      { water: 2 },
      { container: { capacityLb: 30, loadReductionPercent: 0 } },
    ])
      await expect(
        call.define(s.c, { name: 'Snack', category: 'consumable', properties }),
      ).rejects.toThrow(/Forbidden/)
    const edit = (id: string, rev: number, item: Json) => call.define(s.c, item, id, rev)
    const plain = { name: 'Snack', category: 'consumable' }
    // Granted by the DM (source dm): frozen, including the supply-farming edit.
    const granted = await call.define(s.c, plain)
    await asUser(dm)
    await call.grant(s.c, s.arin, granted.id, 1)
    await asUser(player)
    await expect(
      edit(granted.id, 0, { ...plain, properties: { rations: 100, water: 100 } }),
    ).rejects.toThrow(/Forbidden/)
    await expect(edit(granted.id, 0, { ...plain, name: 'Feast' })).rejects.toThrow(/Forbidden/)
    // Priced by the DM, or listed in a shop: frozen too.
    const priced = await call.define(s.c, plain)
    await asUser(dm)
    await call.define(s.c, { ...plain, value_gp: 3 }, priced.id, 0)
    const shop = await call.shop(s.c, { name: 'Stall', visibility: 'party' })
    await call.listing(s.c, shop, { definition_id: priced.id })
    await asUser(player)
    await expect(edit(priced.id, 1, { ...plain, name: 'Relic' })).rejects.toThrow(/Forbidden/)
    expect(await definitionRow(priced.id)).toMatchObject({ name: 'Snack', value_gp: 3 })
    // Untouched own items stay editable; a supply edit is still refused.
    const free = await call.define(s.c, plain)
    await asUser(player)
    await expect(edit(free.id, 0, { ...plain, properties: { water: 5 } })).rejects.toThrow(
      /Forbidden/,
    )
    await asUser(player)
    expect((await edit(free.id, 0, { ...plain, name: 'Biscuit' })).revision).toBe(1)
    // The DM keeps full control.
    await asUser(dm)
    expect((await edit(granted.id, 0, { ...plain, properties: { rations: 1 } })).revision).toBe(1)
  })
})

describe('part 2: release tightening', () => {
  beforeAll(async () => {
    await asRoot()
    await db.exec(readFileSync(`supabase/migrations/${part2}`, 'utf8'))
  })

  it('ships the same DDL in the PRE-only maintenance file and applies it to PRE', async () => {
    const block = (text: string) => text.slice(text.indexOf('$ddl$'), text.lastIndexOf('$ddl$'))
    const maintenance = readFileSync(
      'supabase/maintenance/items-player-authoring-close-pre.sql',
      'utf8',
    )
    expect(block(maintenance)).toBe(block(readFileSync(`supabase/migrations/${part2}`, 'utf8')))
    await asRoot()
    await db.exec(maintenance)
    for (const schema of ['private', 'pre_private'])
      expect(
        await row(
          `select ${schema}.items_player_authoring() enabled, ${schema}.money_scale() scale,
            ${schema}.price_round(1.005)::text r, ${schema}.resale_round(1.009)::text f`,
        ),
      ).toEqual({ enabled: false, scale: 2, r: '1.01', f: '1.00' })
  })

  it('closes Player authoring but keeps basic items addable', async () => {
    const s = await setup()
    const basic = await call.import(s.c, [
      { key: 'rope', name: 'Rope', category: 'gear', weight_lb: 5 },
    ])
    const ropeId = basic.created[0].id
    const secret = await call.define(s.c, {
      name: 'Vorpal blade',
      category: 'weapon',
      value_gp: 9000,
    })
    await asUser(player)
    await expect(call.define(s.c, { name: 'Charm', category: 'treasure' })).rejects.toThrow(
      /Forbidden/,
    )
    await expect(
      call.define(legacy.c!, { name: 'Pebble', category: 'treasure' }, legacy.pebble!, 0),
    ).rejects.toThrow(/Forbidden/)
    await expect(call.grant(legacy.c!, legacy.arin!, legacy.pebble!)).rejects.toThrow(/Forbidden/)
    await expect(call.grant(s.c, s.arin, secret.id)).rejects.toThrow(/Forbidden/)
    // Basic items: own character only, source player, idempotent.
    const key = randomUUID()
    const added = await call.grant(s.c, s.arin, ropeId, 2, key)
    expect(await call.grant(s.c, s.arin, ropeId, 2, key)).toEqual(added)
    expect(await stackRows(s.arin)).toEqual([
      expect.objectContaining({ quantity: 2, source: 'player' }),
    ])
    await asUser(player)
    await expect(call.grant(s.c, s.bea, ropeId)).rejects.toThrow(/Forbidden/)
    for (const who of [outsider, otherDm]) {
      await asUser(who)
      await expect(call.grant(s.c, s.arin, ropeId)).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(call.grant(s.c, s.arin, ropeId)).rejects.toThrow(/permission denied/)
  })

  it('stores and computes money with cents exactly', async () => {
    const s = await setup()
    await asUser(dm)
    await call.gold(s.c, s.arin, 0, 10.25)
    for (const bad of [1.005, -0.01, '1e11', 'abc'])
      await expect(call.gold(s.c, s.arin, 1, bad)).rejects.toThrow(/Invalid request|invalid input/)
    const potion = await call.define(s.c, {
      name: 'Potion',
      category: 'consumable',
      value_gp: 2.35,
    })
    await expect(
      call.define(s.c, { name: 'Bad', category: 'gear', value_gp: 0.001 }),
    ).rejects.toThrow(/Invalid request/)
    const stall = await call.shop(s.c, {
      name: 'Stall',
      visibility: 'party',
      mode: 'auto',
      resale_percent: 50,
    })
    const listing = await call.listing(s.c, stall, { definition_id: potion.id })
    expect(
      await row('select price::text p from public.shop_listings where id=$1', [listing]),
    ).toEqual({ p: '2.35' })
    await asUser(player)
    const bought = await call.checkout(s.c, stall, s.arin, [{ listing_id: listing, quantity: 3 }])
    expect(bought).toMatchObject({ status: 'completed', total: 7.05, gold: 3.2 })
    expect((await resources(s.arin)).gold).toBe(3.2)
    // Resale 2.35 x 50% = 1.175 -> 1.17 (rounded down); two units 2.34.
    const front = await call.storefront(s.c, s.arin)
    expect(front.shops[0].buyback[potion.id]).toBe(1.17)
    const sold = await call.sell(s.c, stall, s.arin, [{ definition_id: potion.id, quantity: 2 }])
    expect(sold).toMatchObject({ total: 2.34, gold: 5.54 })
    await asUser(dm)
    expect(await call.revert(s.c, sold.order_id)).toMatchObject({
      status: 'reverted',
      refunded: 2.34,
      gold: 3.2,
    })
    // A -15% modifier: 2.35 x 0.85 = 1.9975 -> 2.00.
    await call.modifier(s.c, stall, s.arin, -15)
    await asUser(player)
    expect((await call.storefront(s.c, s.arin)).shops[0].listings[0].unit_price).toBe(2)
    // Offers with more than two decimals are refused.
    await asUser(dm)
    const haggle = await call.shop(s.c, { name: 'Haggle', visibility: 'party', mode: 'approval' })
    const hl = await call.listing(s.c, haggle, { definition_id: potion.id, price: 1.1 })
    await asUser(player)
    await expect(
      call.checkout(s.c, haggle, s.arin, [{ listing_id: hl, quantity: 1, offered_price: 0.999 }]),
    ).rejects.toThrow(/Invalid request/)
    const offer = await call.checkout(s.c, haggle, s.arin, [
      { listing_id: hl, quantity: 3, offered_price: 0.95 },
    ])
    expect(offer).toMatchObject({ status: 'pending', total: 2.85 })
    await asUser(dm)
    const order = await res("select public.respond_order($1,$2,'approve',null,'',$3) result", [
      s.c,
      offer.order_id,
      randomUUID(),
    ])
    expect(order).toMatchObject({ status: 'completed', total: 2.85, gold: 0.35 })
  })

  it('swaps trade gold with cents without drift', async () => {
    const s = await setup()
    await call.gold(s.c, s.arin, 0, 0.3)
    await call.gold(s.c, s.bea, 0, 0.2)
    await asUser(player)
    const { trade_id: t } = await res('select public.invite_trade($1,$2,$3,$4) result', [
      s.c,
      s.arin,
      s.bea,
      randomUUID(),
    ])
    await asUser(peer)
    await res('select public.respond_trade_invite($1,$2,true,$3) result', [s.c, t, randomUUID()])
    const offer = (who: string, rev: number, gold: number | string) =>
      res('select public.set_trade_offer($1,$2,$3,$4,$5,$6,$7) result', [
        s.c,
        t,
        who,
        rev,
        '[]',
        gold,
        randomUUID(),
      ])
    await asUser(player)
    await expect(offer(s.arin, 1, 0.105)).rejects.toThrow(/Invalid request/)
    await expect(offer(s.arin, 1, 0.31)).rejects.toThrow(/Insufficient gold/)
    await offer(s.arin, 1, 0.1)
    await asUser(peer)
    await offer(s.bea, 2, 0.2)
    await res('select public.confirm_trade($1,$2,$3,3,$4) result', [s.c, t, s.bea, randomUUID()])
    await asUser(player)
    const done = await res('select public.confirm_trade($1,$2,$3,3,$4) result', [
      s.c,
      t,
      s.arin,
      randomUUID(),
    ])
    expect(done.status).toBe('completed')
    expect((await resources(s.arin)).gold).toBe(0.4)
    expect((await resources(s.bea)).gold).toBe(0.1)
  })

  it('keeps lb weights with three decimals and the legacy tenths in step', async () => {
    const s = await setup()
    const a = await call.define(s.c, { name: 'Feather', category: 'gear', weight_lb: 0.125 })
    expect(await definitionRow(a.id)).toMatchObject({ weight_lb: 0.125, weight_tenths: 1 })
    const b = await call.define(s.c, { name: 'Lantern', category: 'gear', weight_tenths: 25 })
    expect(await definitionRow(b.id)).toMatchObject({ weight_lb: 2.5, weight_tenths: 25 })
    // A legacy edit that repeats the stored tenths keeps the precise pounds; a new tenths value wins.
    await asUser(dm)
    await call.define(s.c, { name: 'Feather', category: 'gear', weight_tenths: 1 }, a.id, 0)
    expect(await definitionRow(a.id)).toMatchObject({ weight_lb: 0.125, revision: 1 })
    await asUser(dm)
    await call.define(s.c, { name: 'Feather', category: 'gear', weight_tenths: 4 }, a.id, 1)
    expect(await definitionRow(a.id)).toMatchObject({ weight_lb: 0.4, weight_tenths: 4 })
    await asUser(dm)
    for (const weight of [0.0005, -1, 10001, 'heavy'])
      await expect(
        call.define(s.c, { name: 'X', category: 'gear', weight_lb: weight }),
      ).rejects.toThrow(/Invalid request/)
  })

  it('validates translations and the RYT-104 properties and returns them in every read', async () => {
    const s = await setup()
    const translations = {
      en: { name: 'Rope', description: 'Hempen, 50 feet.' },
      es: { name: 'Cuerda' },
    }
    const rope = await call.define(s.c, {
      name: 'Cuerda',
      category: 'gear',
      translations,
      properties: {
        container: { capacityLb: 30, loadReductionPercent: 10 },
        mastery: 'sap',
        light: true,
      },
    })
    expect((await definitionRow(rope.id)).translations).toEqual({
      en: { name: 'Rope', description: 'Hempen, 50 feet.' },
      es: { name: 'Cuerda', description: '' },
    })
    await asUser(dm)
    for (const bad of [
      { translations: { fr: { name: 'Corde' } } },
      { translations: { en: { name: '' } } },
      { translations: { en: { name: 'x'.repeat(101) } } },
      { translations: { en: { name: 'Rope', notes: 'x' } } },
      { properties: { rations: 0.25 } },
      { properties: { water: 101 } },
      { properties: { container: { capacityLb: 30 } } },
      { properties: { container: { capacityLb: 30, loadReductionPercent: 95 } } },
      { properties: { mastery: 5 } },
    ])
      await expect(call.define(s.c, { name: 'Bad', category: 'gear', ...bad })).rejects.toThrow(
        /Invalid request/,
      )
    const bread = await call.define(s.c, {
      name: 'Bread',
      category: 'consumable',
      properties: { rations: 0.5 },
    })
    const shop = await call.shop(s.c, { name: 'Shop', visibility: 'party' })
    await call.listing(s.c, shop, { definition_id: rope.id, price: 1 })
    await call.grant(s.c, s.arin, rope.id, 1)
    await call.grant(s.c, s.arin, bread.id, 1)
    await asUser(player)
    expect(
      (await call.storefront(s.c, s.arin)).shops[0].listings[0].item.translations.en.name,
    ).toBe('Rope')
    const trade = await res('select public.get_trade_state($1,null) result', [s.c])
    expect(trade.items.find((i: Json) => i.definition_id === rope.id).translations.es.name).toBe(
      'Cuerda',
    )
    expect((await call.search(s.c, 'rope'))[0].translations.en.name).toBe('Rope')
    await asUser(dm)
    expect(
      (await call.admin(s.c)).items.find((i: Json) => i.id === rope.id).translations,
    ).toBeTruthy()
  })

  it('imports basic items once by key, idempotently, and refuses invalid input', async () => {
    const s = await setup()
    const items = [
      {
        key: 'longsword',
        name: 'Longsword',
        description: 'A versatile blade.',
        translations: { es: { name: 'Espada larga', description: 'Hoja versátil.' } },
        category: 'weapon',
        icon: 'sword',
        slot_kind: 'one_hand',
        properties: { dice: '1d8', mastery: 'sap', versatileDice: '1d10' },
        weight_lb: 3,
        value_gp: 15,
      },
      {
        key: 'bread',
        name: 'Bread',
        category: 'consumable',
        weight_lb: 0.5,
        value_gp: 0.02,
        properties: { rations: 0.5 },
      },
    ]
    const key = randomUUID()
    const first = await call.import(s.c, items, key)
    expect(first).toMatchObject({ created_count: 2, skipped_count: 0, updated_count: 0 })
    const sword = first.created.find((x: Json) => x.key === 'longsword').id
    expect(await definitionRow(sword)).toMatchObject({
      origin: 'srd',
      basic_key: 'longsword',
      value_gp: 15,
      weight_lb: 3,
    })
    expect(await call.import(s.c, items, key)).toEqual(first)
    await asUser(dm)
    await expect(call.import(s.c, items.slice(0, 1), key)).rejects.toThrow(/Request mismatch/)
    // Archived ones are skipped too.
    await res('select public.archive_item_definition($1,$2,0,$3) result', [
      s.c,
      sword,
      randomUUID(),
    ])
    const again = await call.import(s.c, items)
    expect(again).toMatchObject({ created_count: 0, skipped_count: 2 })
    expect(again.skipped).toEqual(
      expect.arrayContaining([{ key: 'longsword', id: sword, archived: true }]),
    )
    // update_existing refreshes changed live entries but keeps the DM price.
    const changed = [{ ...items[1], name: 'Fresh bread', value_gp: 9 }]
    const updated = await call.import(s.c, changed, randomUUID(), true)
    expect(updated).toMatchObject({ updated_count: 1, created_count: 0 })
    expect(await definitionRow(updated.updated[0].id)).toMatchObject({
      name: 'Fresh bread',
      value_gp: 0.02,
      revision: 1,
    })
    await asUser(dm)
    await expect(call.import(s.c, [items[1], items[1]])).rejects.toThrow(/Invalid item 2/)
    await expect(
      call.import(s.c, [
        { key: 'ok', name: 'Ok', category: 'gear' },
        { key: 'x', name: 'X', category: 'nope' },
      ]),
    ).rejects.toThrow(/Invalid item 2/)
    await expect(
      call.import(s.c, [{ key: 'Bad key', name: 'X', category: 'gear' }]),
    ).rejects.toThrow(/Invalid item 1/)
    await expect(call.import(s.c, [])).rejects.toThrow(/Invalid request/)
    const many = Array.from({ length: 501 }, (_, i) => ({
      key: `k${i}`,
      name: `Item ${i}`,
      category: 'gear',
    }))
    await expect(call.import(s.c, many)).rejects.toThrow(/Invalid request/)
    // A full 500-item payload with long bilingual descriptions fits.
    const full = Array.from({ length: 500 }, (_, i) => ({
      key: `item${i}`,
      name: `Item ${i}`,
      description: 'd'.repeat(700),
      translations: {
        en: { name: `Item ${i}`, description: 'e'.repeat(700) },
        es: { name: `Objeto ${i}`, description: 'ñ'.repeat(700) },
      },
      category: 'gear',
      weight_lb: 1.125,
      value_gp: 0.01,
    }))
    expect((await call.import(s.c, full)).created_count).toBe(500)
    for (const who of [player, outsider, otherDm]) {
      await asUser(who)
      await expect(call.import(s.c, items)).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(call.import(s.c, items)).rejects.toThrow(/permission denied/)
  })

  it('flags templates through the RPC and the save payload', async () => {
    const s = await setup()
    const def = await call.define(s.c, { name: 'Torch', category: 'gear', is_template: true })
    expect(await definitionRow(def.id)).toMatchObject({ is_template: true, revision: 0 })
    await asUser(dm)
    const key = randomUUID()
    const off = await call.template(s.c, def.id, false, 0, key)
    expect(off).toEqual({ id: def.id, is_template: false, revision: 1 })
    expect(await call.template(s.c, def.id, false, 0, key)).toEqual(off)
    await asUser(dm)
    await expect(call.template(s.c, def.id, true, 0)).rejects.toThrow(/Stale revision/)
    // An edit without the flag keeps it.
    await call.template(s.c, def.id, true, 1)
    await call.define(s.c, { name: 'Torch', category: 'gear' }, def.id, 2)
    expect(await definitionRow(def.id)).toMatchObject({ is_template: true, revision: 3 })
    await asUser(dm)
    await expect(call.template(s.other, def.id, true, 3)).rejects.toThrow(/Forbidden/)
    for (const who of [player, outsider, otherDm]) {
      await asUser(who)
      await expect(call.template(s.c, def.id, false, 3)).rejects.toThrow(/Forbidden/)
    }
    await asUser(otherDm)
    await expect(call.template(s.other, def.id, false, 3)).rejects.toThrow(/Item unavailable/)
    await asAnon()
    await expect(call.template(s.c, def.id, false, 3)).rejects.toThrow(/permission denied/)
  })

  it('searches the catalogue a Player may see without leaking DM items or prices', async () => {
    const s = await setup()
    const basic = await call.import(s.c, [
      {
        key: 'rope',
        name: 'Rope',
        category: 'gear',
        value_gp: 1,
        translations: { es: { name: 'Cuerda' } },
      },
    ])
    const secret = await call.define(s.c, {
      name: 'Hidden relic',
      category: 'treasure',
      value_gp: 500,
    })
    const held = await call.define(s.c, {
      name: 'Healing potion',
      category: 'consumable',
      value_gp: 50,
    })
    await call.grant(s.c, s.arin, held.id, 1)
    const peerHeld = await call.define(s.c, {
      name: 'Peer gem',
      category: 'treasure',
      value_gp: 20,
    })
    await call.grant(s.c, s.bea, peerHeld.id, 1)
    await asUser(dm)
    expect((await call.search(s.c)).map((x) => x.name)).toEqual([
      'Healing potion',
      'Hidden relic',
      'Peer gem',
      'Rope',
    ])
    await asUser(player)
    const seen = await call.search(s.c)
    expect(seen.map((x) => x.name)).toEqual(['Healing potion', 'Rope'])
    expect(seen.find((x) => x.name === 'Rope')).toMatchObject({ value_gp: 1, basic_key: 'rope' })
    expect(seen.find((x) => x.name === 'Healing potion')!.value_gp).toBeNull()
    expect(JSON.stringify(seen)).not.toMatch(/Hidden relic|Peer gem|"500"/)
    expect((await call.search(s.c, 'cuer')).map((x) => x.id)).toEqual([basic.created[0].id])
    expect(await call.search(s.c, '%')).toEqual([])
    expect(await call.search(s.c, 'relic')).toEqual([])
    await expect(call.search(s.c, 'x'.repeat(101))).rejects.toThrow(/Invalid request/)
    expect(secret.id).toBeTruthy()
    for (const who of [outsider, otherDm]) {
      await asUser(who)
      await expect(call.search(s.c)).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(call.search(s.c)).rejects.toThrow(/permission denied/)
  })

  it('runs the proposal lifecycle: propose, list, cancel, accept, merge and reject', async () => {
    const s = await setup()
    const draft = {
      name: 'Grandma amulet',
      category: 'treasure',
      weight_lb: 0.1,
      suggested_value_gp: 12.5,
    }
    await asUser(player)
    await expect(call.propose(s.c, s.arin, { ...draft, value_gp: 5 })).rejects.toThrow(/Forbidden/)
    await expect(call.propose(s.c, s.bea, draft)).rejects.toThrow(/Forbidden/)
    await expect(call.propose(s.c, s.arin, draft, 0)).rejects.toThrow(/Invalid quantity/)
    const key = randomUUID()
    const proposed = await call.propose(s.c, s.arin, draft, 2, key)
    expect(proposed).toMatchObject({ status: 'pending', revision: 0 })
    expect(await call.propose(s.c, s.arin, draft, 2, key)).toEqual(proposed)
    // Nothing reaches the inventory yet.
    expect(await stackRows(s.arin)).toEqual([])
    await asUser(player)
    const mine = await call.proposals(s.c)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({
      proposed_by_you: true,
      proposer_name: null,
      quantity: 2,
      status: 'pending',
    })
    expect(mine[0].draft).toMatchObject({
      name: 'Grandma amulet',
      suggested_value_gp: 12.5,
      weight_lb: 0.1,
    })
    await asUser(peer)
    expect(await call.proposals(s.c)).toEqual([])
    await expect(call.proposals(s.c, s.arin)).rejects.toThrow(/Forbidden/)
    await expect(call.cancel(s.c, proposed.id, 0)).rejects.toThrow(/Forbidden/)
    for (const who of [outsider, otherDm]) {
      await asUser(who)
      await expect(call.proposals(s.c)).rejects.toThrow(/Forbidden/)
      await expect(call.propose(s.c, s.arin, draft)).rejects.toThrow(/Forbidden/)
      await expect(call.resolve(s.c, proposed.id, 'reject')).rejects.toThrow(/Forbidden/)
    }
    await asUser(player)
    await expect(call.resolve(s.c, proposed.id, 'accept')).rejects.toThrow(/Forbidden/)
    await asUser(otherDm)
    await expect(call.resolve(s.other, proposed.id, 'reject')).rejects.toThrow(
      /Proposal unavailable/,
    )
    await asAnon()
    await expect(call.proposals(s.c)).rejects.toThrow(/permission denied/)
    await expect(call.propose(s.c, s.arin, draft)).rejects.toThrow(/permission denied/)

    // DM edits and accepts with a price; a retry grants once.
    await asUser(dm)
    expect((await call.proposals(s.c))[0].proposer_name).toBeTruthy()
    await expect(call.resolve(s.c, proposed.id, 'accept', { rev: 3 })).rejects.toThrow(
      /Stale revision/,
    )
    await expect(call.resolve(s.c, proposed.id, 'accept')).rejects.toThrow(/Invalid quantity/)
    const acceptKey = randomUUID()
    const edited = {
      name: 'Amulet of the hearth',
      category: 'treasure',
      weight_lb: 0.2,
      value_gp: 10,
    }
    const accepted = await call.resolve(s.c, proposed.id, 'accept', {
      draft: edited,
      key: acceptKey,
      note: 'Nice',
      qty: 2,
    })
    expect(accepted).toMatchObject({ status: 'accepted', revision: 1, quantity: 2 })
    expect(
      await call.resolve(s.c, proposed.id, 'accept', {
        draft: edited,
        key: acceptKey,
        note: 'Nice',
        qty: 2,
      }),
    ).toEqual(accepted)
    await asUser(dm)
    await expect(
      call.resolve(s.c, proposed.id, 'accept', {
        draft: edited,
        key: acceptKey,
        note: 'Other',
        qty: 2,
      }),
    ).rejects.toThrow(/Request mismatch/)
    await asUser(dm)
    await expect(call.resolve(s.c, proposed.id, 'reject', { rev: 1 })).rejects.toThrow(
      /Proposal closed/,
    )
    expect(await definitionRow(accepted.definition_id)).toMatchObject({
      name: 'Amulet of the hearth',
      origin: 'player',
      created_by: dm,
      value_gp: 10,
    })
    // The proposer still finds, and sees the image of, the item their character carries.
    const img = `public/${s.c}/${accepted.definition_id}/${randomUUID()}.webp`
    await db.query("insert into storage.objects(bucket_id,name) values ('item-images',$1)", [img])
    await asUser(dm)
    await res('select public.set_item_image($1,$2,0,$3,$4) result', [
      s.c,
      accepted.definition_id,
      img,
      randomUUID(),
    ])
    await asUser(player)
    expect(
      (await call.search(s.c, 'hearth')).map((x) => [x.id, x.created_by_you, x.value_gp]),
    ).toEqual([[accepted.definition_id, false, null]])
    expect(
      (
        await db.query("select 1 from storage.objects where bucket_id='item-images' and name=$1", [
          img,
        ])
      ).rows,
    ).toHaveLength(1)
    await asUser(peer)
    expect(
      (
        await db.query("select 1 from storage.objects where bucket_id='item-images' and name=$1", [
          img,
        ])
      ).rows,
    ).toHaveLength(0)
    await asUser(dm)
    expect(await stackRows(s.arin)).toEqual([
      expect.objectContaining({ definition_id: accepted.definition_id, quantity: 2, source: 'dm' }),
    ])
    // A priced Player-origin item may be listed.
    const shop = await call.shop(s.c, { name: 'Shop', visibility: 'party' })
    expect(await call.listing(s.c, shop, { definition_id: accepted.definition_id })).toBeTruthy()

    // Merge into an existing live item; reject with a note; cancel by the proposer.
    const rope = await call.define(s.c, { name: 'Rope', category: 'gear' })
    await asUser(player)
    const second = await call.propose(s.c, s.arin, { name: 'Cord', category: 'gear' })
    const third = await call.propose(s.c, s.arin, { name: 'Dragon', category: 'treasure' })
    const fourth = await call.propose(s.c, s.arin, { name: 'Spoon', category: 'gear' })
    await asUser(dm)
    await expect(
      call.resolve(s.c, second.id, 'merge', { target: randomUUID(), qty: 1 }),
    ).rejects.toThrow(/Item unavailable/)
    await expect(call.resolve(s.c, second.id, 'merge', { target: rope.id })).rejects.toThrow(
      /Invalid quantity/,
    )
    // A live definition of another campaign is not found through this one.
    await asUser(otherDm)
    const foreign = await call.define(s.other, { name: 'Foreign rope', category: 'gear' })
    await asUser(dm)
    await expect(
      call.resolve(s.c, second.id, 'merge', { target: foreign.id, qty: 1 }),
    ).rejects.toThrow(/Item unavailable/)
    const merged = await call.resolve(s.c, second.id, 'merge', { target: rope.id, qty: 3 })
    expect(merged).toMatchObject({ status: 'merged', definition_id: rope.id, quantity: 3 })
    const rejected = await call.resolve(s.c, third.id, 'reject', { note: 'Too strong' })
    expect(rejected).toMatchObject({ status: 'rejected', definition_id: null, item_id: null })
    await expect(call.cancel(s.c, fourth.id, 0)).rejects.toThrow(/Forbidden/)
    await asUser(player)
    await expect(call.cancel(s.c, fourth.id, 5)).rejects.toThrow(/Stale revision/)
    expect(await call.cancel(s.c, fourth.id, 0)).toMatchObject({ status: 'cancelled', revision: 1 })
    expect(await call.cancel(s.c, fourth.id, 1)).toMatchObject({ status: 'cancelled', revision: 1 })
    await expect(call.cancel(s.c, third.id, 1)).rejects.toThrow(/Proposal closed/)
    const listed = await call.proposals(s.c)
    expect(listed.find((p) => p.id === third.id)).toMatchObject({
      status: 'rejected',
      dm_note: 'Too strong',
    })
    expect(await call.proposals(s.c, s.arin, false)).toEqual([])
    // Defaults: only pending ones; with closed ones, pending always come first.
    const pendingOne = await call.propose(s.c, s.arin, { name: 'Lantern', category: 'gear' })
    expect(
      (await res<Json[]>('select public.list_item_proposals($1) result', [s.c])).map((p) => p.id),
    ).toEqual([pendingOne.id])
    const withClosed = await call.proposals(s.c, s.arin, true)
    expect(withClosed[0].id).toBe(pendingOne.id)
    expect(withClosed.slice(1).every((p) => p.status !== 'pending')).toBe(true)
    await call.cancel(s.c, pendingOne.id, 0)
    // Replays with another payload are refused; the audit keeps the normalized draft only.
    const proposeKey = randomUUID()
    const junk = await call.propose(
      s.c,
      s.arin,
      { name: 'Cup', category: 'gear', junk: 'x'.repeat(50) },
      1,
      proposeKey,
    )
    await expect(
      call.propose(s.c, s.arin, { name: 'Bowl', category: 'gear' }, 1, proposeKey),
    ).rejects.toThrow(/Request mismatch/)
    expect(
      await row(
        'select payload::text like $2 has from private.inventory_requests where request_id=$1',
        [proposeKey, '%junk%'],
      ),
    ).toEqual({ has: false })
    await asUser(player)
    const cancelKey = randomUUID()
    await call.cancel(s.c, junk.id, 0, cancelKey)
    await expect(call.cancel(s.c, junk.id, 1, cancelKey)).rejects.toThrow(/Request mismatch/)
    // At most 20 pending proposals per character.
    for (let i = 0; i < 20; i++)
      await call.propose(s.c, s.arin, { name: `Idea ${i}`, category: 'gear' })
    await expect(call.propose(s.c, s.arin, { name: 'One more', category: 'gear' })).rejects.toThrow(
      /Too many proposals/,
    )
    // And at most 100 created per character in 24 hours, closed ones included.
    await asRoot()
    await db.query(
      "update public.item_proposals set status='cancelled', resolved_at=now() where character_id=$1 and status='pending'",
      [s.arin],
    )
    await db.query(
      `insert into public.item_proposals(campaign_id, character_id, proposed_by, draft, quantity, status)
       select $1, $2, $3, '{"name":"Old","category":"gear"}', 1, 'cancelled' from generate_series(1, 80)`,
      [s.c, s.arin, player],
    )
    await asUser(player)
    await expect(call.propose(s.c, s.arin, { name: 'Burst', category: 'gear' })).rejects.toThrow(
      /Too many proposals/,
    )
    await asRoot()
    await db.query(
      "update public.item_proposals set created_at = now() - interval '25 hours' where character_id=$1",
      [s.arin],
    )
    await asUser(player)
    expect((await call.propose(s.c, s.arin, { name: 'Later', category: 'gear' })).status).toBe(
      'pending',
    )
    // Closed history is capped at the 50 latest and pending ones stay first.
    const capped = await call.proposals(s.c, s.arin, true)
    expect(capped[0].status).toBe('pending')
    expect(capped).toHaveLength(51)
    // No direct table access.
    await expect(db.query('select * from public.item_proposals')).rejects.toThrow(
      /permission denied/,
    )
  })

  it('adds rations and water when food is used and removes them on undo', async () => {
    const s = await setup()
    const bread = await call.define(s.c, {
      name: 'Bread',
      category: 'consumable',
      properties: { rations: 0.5 },
    })
    const ale = await call.define(s.c, {
      name: 'Ale',
      category: 'consumable',
      properties: { water: 1.5, rations: 1 },
    })
    const skin = await call.define(s.c, {
      name: 'Waterskin',
      category: 'gear',
      properties: { water: 4 },
    })
    const breads = await call.grant(s.c, s.arin, bread.id, 5)
    const ales = await call.grant(s.c, s.arin, ale.id, 2)
    const skins = await call.grant(s.c, s.arin, skin.id, 1)
    const start = await resources(s.arin)
    await asUser(player)
    const key = randomUUID()
    // 3 x 0.5 = 1.5 -> 1 whole ration.
    const used = await call.use(s.c, breads.item_id, breads.revision, 3, key)
    expect(used.supplies).toEqual({ rations: 1, water: 0 })
    expect(await call.use(s.c, breads.item_id, breads.revision, 3, key)).toEqual(used)
    expect(await resources(s.arin)).toMatchObject({
      rations: 1,
      water: 0,
      revision: start.revision + 1,
    })
    await asUser(player)
    const drank = await call.use(s.c, ales.item_id, ales.revision, 2)
    expect(drank.supplies).toEqual({ rations: 2, water: 3 })
    expect(await resources(s.arin)).toMatchObject({ rations: 3, water: 3 })
    await asUser(player)
    await expect(call.use(s.c, skins.item_id, skins.revision)).rejects.toThrow(/Not usable/)
    const undone = await call.undo(s.c, drank.event_id)
    expect(undone.supplies).toEqual({ rations: -2, water: -3 })
    expect(await resources(s.arin)).toMatchObject({ rations: 1, water: 0 })
    expect(
      await row('select quantity from public.inventory_items where id=$1', [ales.item_id]),
    ).toEqual({ quantity: 2 })
    // Spent meanwhile: the undo is refused and nothing changes.
    await asUser(dm)
    const r = await resources(s.arin)
    await asUser(dm)
    await db.query('select public.set_character_resources($1,$2,$3,0,0,0,0,$4)', [
      s.c,
      s.arin,
      r.revision,
      randomUUID(),
    ])
    await asUser(player)
    await expect(call.undo(s.c, used.event_id)).rejects.toThrow(/Undo conflict/)
    expect(await resources(s.arin)).toMatchObject({ rations: 0, water: 0 })
    expect(
      await row('select quantity from public.inventory_items where id=$1', [breads.item_id]),
    ).toEqual({
      quantity: 2,
    })
    // A Player-sourced stack (a self-added basic item) never mints supplies.
    await asUser(dm)
    const basic = await call.import(s.c, [
      { key: 'rations', name: 'Rations', category: 'consumable', properties: { rations: 1 } },
    ])
    await asUser(player)
    const own = await call.grant(s.c, s.arin, basic.created[0].id, 3)
    const eaten = await call.use(s.c, own.item_id, own.revision, 3)
    expect(eaten.supplies).toBeUndefined()
    expect(await resources(s.arin)).toMatchObject({ rations: 0, water: 0 })
    await asUser(player)
    expect((await call.undo(s.c, eaten.event_id)).supplies).toBeUndefined()
    await asUser(peer)
    await expect(call.use(s.c, breads.item_id, 0)).rejects.toThrow(/Forbidden/)
  })

  it('merges duplicate definitions across stacks, slots and shops', async () => {
    const s = await setup()
    const src = await call.define(s.c, {
      name: 'Ring (dup)',
      category: 'treasure',
      slot_kind: 'ring',
      value_gp: 5,
    })
    const dst = await call.define(s.c, {
      name: 'Ring',
      category: 'treasure',
      slot_kind: 'ring',
      value_gp: 5,
    })
    const torchA = await call.define(s.c, { name: 'Torch A', category: 'gear' })
    const torchB = await call.define(s.c, { name: 'Torch B', category: 'gear', slot_kind: 'none' })
    // Arin: loose source + loose target (dm) merge; an equipped source ring stays equipped.
    await call.grant(s.c, s.arin, src.id, 3)
    await call.grant(s.c, s.arin, dst.id, 1)
    const stack = (await stackRows(s.arin)).find((x) => x.definition_id === src.id)!
    await asUser(dm)
    const rev = (
      await row<{ r: number }>('select revision::int r from public.inventory_items where id=$1', [
        stack.id,
      ])
    ).r
    await asUser(dm)
    const ringOn = await res('select public.equip_item($1,$2,$3,$4,$5) result', [
      s.c,
      stack.id,
      rev,
      'ring_1',
      randomUUID(),
    ])
    // Bea holds only the source: her stack is repointed.
    await call.grant(s.c, s.bea, src.id, 2)
    const both = await call.shop(s.c, { name: 'Both', visibility: 'party' })
    const only = await call.shop(s.c, { name: 'Only', visibility: 'party', mode: 'approval' })
    const bothSrc = await call.listing(s.c, both, { definition_id: src.id, price: 4 })
    await call.listing(s.c, both, { definition_id: dst.id, price: 6 })
    const onlySrc = await call.listing(s.c, only, { definition_id: src.id, price: 4.5, stock: 3 })
    // An open order blocks the merge.
    await call.gold(s.c, s.arin, 0, 100)
    await asUser(player)
    const pending = await call.checkout(s.c, only, s.arin, [{ listing_id: onlySrc, quantity: 1 }])
    await asUser(dm)
    await expect(call.merge(s.c, src.id, dst.id, 0, 0)).rejects.toThrow(/Open orders/)
    await res("select public.respond_order($1,$2,'reject',null,'',$3) result", [
      s.c,
      pending.order_id,
      randomUUID(),
    ])
    await expect(call.merge(s.c, src.id, dst.id, 1, 0)).rejects.toThrow(/Stale revision/)
    await expect(call.merge(s.c, src.id, src.id, 0, 0)).rejects.toThrow(/Invalid request/)
    for (const who of [player, outsider, otherDm]) {
      await asUser(who)
      await expect(call.merge(s.c, src.id, dst.id, 0, 0)).rejects.toThrow(/Forbidden/)
    }
    await asUser(otherDm)
    await expect(call.merge(s.other, src.id, dst.id, 0, 0)).rejects.toThrow(/Item unavailable/)
    await asAnon()
    await expect(call.merge(s.c, src.id, dst.id, 0, 0)).rejects.toThrow(/permission denied/)

    await asUser(dm)
    const key = randomUUID()
    const summary = await call.merge(s.c, src.id, dst.id, 0, 0, key)
    expect(summary).toMatchObject({
      moved_units: 5,
      merged_stacks: 1,
      moved_stacks: 2,
      unequipped_stacks: 0,
      characters: 2,
      repointed_listings: 1,
      archived_listings: 1,
      source_revision: 1,
    })
    expect(await call.merge(s.c, src.id, dst.id, 0, 0, key)).toEqual(summary)
    const arin = await stackRows(s.arin)
    expect(arin.filter((x) => x.definition_id === src.id)).toEqual([])
    expect(arin).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ definition_id: dst.id, quantity: 3, slot: null, source: 'dm' }),
        expect.objectContaining({
          id: ringOn.item_id,
          definition_id: dst.id,
          quantity: 1,
          slot: 'ring_1',
        }),
      ]),
    )
    expect(await stackRows(s.bea)).toEqual([
      expect.objectContaining({ definition_id: dst.id, quantity: 2 }),
    ])
    expect(await row('select archived from public.shop_listings where id=$1', [bothSrc])).toEqual({
      archived: true,
    })
    expect(
      await row(
        'select definition_id, price::float8 price, stock from public.shop_listings where id=$1',
        [onlySrc],
      ),
    ).toEqual({ definition_id: dst.id, price: 4.5, stock: 3 })
    expect(await definitionRow(src.id)).toMatchObject({ archived: true, revision: 1 })
    await asUser(dm)
    expect(
      await res('select public.item_definition_impact($1,$2) result', [s.c, src.id]),
    ).toMatchObject({
      listings: [],
      holders: 0,
      units: 0,
      open_orders: 0,
      open_trades: 0,
    })
    // The ledger keeps readable merge events and earlier events no longer undo.
    await asUser(player)
    const events = await db.query<{ kind: string }>(
      "select kind from public.inventory_events where character_id=$1 and kind='merge'",
      [s.arin],
    )
    expect(events.rows.length).toBeGreaterThanOrEqual(3)

    // A live trade offering a source stack blocks the merge.
    await asUser(dm)
    await call.grant(s.c, s.arin, torchA.id, 1)
    const torch = (await stackRows(s.arin)).find((x) => x.definition_id === torchA.id)!
    await asUser(player)
    const { trade_id: t } = await res('select public.invite_trade($1,$2,$3,$4) result', [
      s.c,
      s.arin,
      s.bea,
      randomUUID(),
    ])
    await asUser(peer)
    await res('select public.respond_trade_invite($1,$2,true,$3) result', [s.c, t, randomUUID()])
    await asUser(player)
    await res('select public.set_trade_offer($1,$2,$3,1,$4,0,$5) result', [
      s.c,
      t,
      s.arin,
      json([{ item_id: torch.id, quantity: 1 }]),
      randomUUID(),
    ])
    await asUser(dm)
    expect(
      (await res('select public.item_definition_impact($1,$2) result', [s.c, torchA.id]))
        .open_trades,
    ).toBe(1)
    await expect(call.merge(s.c, torchA.id, torchB.id, 0, 0)).rejects.toThrow(/Open trades/)
  })

  it('refuses ids of another campaign inside the caller own campaign and mismatched replays', async () => {
    const s = await setup()
    await asUser(otherDm)
    const foreignBasic = await call.import(s.other, [
      { key: 'rope', name: 'Rope', category: 'gear' },
    ])
    const foreign = foreignBasic.created[0].id
    const foreignShop = await call.shop(s.other, { name: 'Far shop', visibility: 'party' })
    await asUser(dm)
    const mine = await call.define(s.c, { name: 'Rope', category: 'gear', value_gp: 1 })
    const shop = await call.shop(s.c, { name: 'Near shop', visibility: 'party' })
    // grant_item: a foreign basic item is not found, for the DM or the Player.
    await expect(call.grant(s.c, s.arin, foreign)).rejects.toThrow(/Item unavailable/)
    await asUser(player)
    await expect(call.grant(s.c, s.arin, foreign)).rejects.toThrow(/Item unavailable/)
    await asUser(dm)
    // add_listings: a foreign definition or a foreign shop.
    await expect(call.addListings(s.c, shop, [{ definition_id: foreign }])).rejects.toThrow(
      /Invalid request/,
    )
    await expect(call.addListings(s.c, foreignShop, [{ definition_id: mine.id }])).rejects.toThrow(
      /Invalid request/,
    )
    // merge: either side foreign.
    await expect(call.merge(s.c, mine.id, foreign, 0, 0)).rejects.toThrow(/Item unavailable/)
    await expect(call.merge(s.c, foreign, mine.id, 0, 0)).rejects.toThrow(/Item unavailable/)
    // set_shop_image: a foreign shop.
    await expect(call.shopImage(s.c, foreignShop, 0, null)).rejects.toThrow(/Shop unavailable/)
    expect(
      await row('select count(*)::int n from public.shop_listings where shop_id=$1', [shop]),
    ).toEqual({
      n: 0,
    })
    // Mismatched replays on the new RPCs.
    await asUser(dm)
    const other = await call.define(s.c, { name: 'Rope copy', category: 'gear' })
    const keys = { merge: randomUUID(), add: randomUUID(), image: randomUUID(), tpl: randomUUID() }
    await call.addListings(s.c, shop, [{ definition_id: mine.id }], keys.add)
    await expect(
      call.addListings(s.c, shop, [{ definition_id: mine.id, stock: 1 }], keys.add),
    ).rejects.toThrow(/Request mismatch/)
    await asUser(dm)
    await call.template(s.c, other.id, true, 0, keys.tpl)
    await expect(call.template(s.c, other.id, false, 0, keys.tpl)).rejects.toThrow(
      /Request mismatch/,
    )
    await asUser(dm)
    await call.shopImage(s.c, shop, 0, null, keys.image)
    await expect(call.shopImage(s.c, shop, 1, null, keys.image)).rejects.toThrow(/Request mismatch/)
    await asUser(dm)
    await call.merge(s.c, other.id, mine.id, 1, 0, keys.merge)
    await expect(call.merge(s.c, other.id, mine.id, 1, 1, keys.merge)).rejects.toThrow(
      /Request mismatch/,
    )
    // Another user cannot replay someone else's key.
    await asUser(otherDm)
    await expect(call.merge(s.other, other.id, mine.id, 1, 0, keys.merge)).rejects.toThrow(
      /Request mismatch/,
    )
  })

  it('unequips a merged row whose kept item does not fit the slot', async () => {
    const s = await setup()
    const src = await call.define(s.c, { name: 'Helm (dup)', category: 'armor', slot_kind: 'head' })
    const dst = await call.define(s.c, { name: 'Pot', category: 'gear' })
    const g = await call.grant(s.c, s.arin, src.id, 1)
    await res('select public.equip_item($1,$2,$3,$4,$5) result', [
      s.c,
      g.item_id,
      g.revision,
      'head',
      randomUUID(),
    ])
    const summary = await call.merge(s.c, src.id, dst.id, 0, 0)
    expect(summary).toMatchObject({ unequipped_stacks: 1, moved_units: 1 })
    expect(await stackRows(s.arin)).toEqual([
      expect.objectContaining({ definition_id: dst.id, slot: null, quantity: 1 }),
    ])
  })

  it('saves shop kinds and stocks shops in bulk, atomically and idempotently', async () => {
    const s = await setup()
    const shop = await call.shop(s.c, { name: 'Smithy', kind: 'blacksmith', visibility: 'party' })
    await expect(call.shop(s.c, { name: 'Bad', kind: 'x'.repeat(41) })).rejects.toThrow(
      /Invalid request/,
    )
    const sword = await call.define(s.c, { name: 'Sword', category: 'weapon', value_gp: 15 })
    const axe = await call.define(s.c, { name: 'Axe', category: 'weapon', value_gp: 10.5 })
    const own = (
      await row<{ id: string }>(
        "insert into public.item_definitions(campaign_id,name,category,origin,created_by) values ($1,'Pebble','treasure','player',$2) returning id",
        [s.c, player],
      )
    ).id
    await asUser(dm)
    await call.listing(s.c, shop, { definition_id: sword.id, price: 14 })
    const key = randomUUID()
    const items = [{ definition_id: sword.id }, { definition_id: axe.id, stock: 3 }]
    const added = await call.addListings(s.c, shop, items, key)
    expect(added).toMatchObject({ created_count: 1, skipped_count: 1 })
    expect(await call.addListings(s.c, shop, items, key)).toEqual(added)
    await asUser(dm)
    expect(await call.addListings(s.c, shop, items)).toMatchObject({
      created_count: 0,
      skipped_count: 2,
    })
    for (const bad of [
      [{ definition_id: own }],
      [{ definition_id: axe.id }, { definition_id: axe.id }],
      [{ definition_id: randomUUID() }],
      [{ definition_id: sword.id, price: 1.001 }],
      [{ definition_id: sword.id, stock: 10000 }],
      [],
    ])
      await expect(call.addListings(s.c, shop, bad)).rejects.toThrow(/Invalid request/)
    const admin = await call.admin(s.c)
    const smithy = admin.shops.find((x: Json) => x.id === shop)
    expect(smithy).toMatchObject({ kind: 'blacksmith', image_path: null })
    expect(smithy.listings.find((l: Json) => l.definition_id === axe.id)).toMatchObject({
      price: 10.5,
      stock: 3,
    })
    // Editing without kind keeps it; an empty kind clears it.
    await call.shop(s.c, { name: 'Smithy 2' }, shop, smithy.revision)
    expect((await call.admin(s.c)).shops[0].kind).toBe('blacksmith')
    await call.shop(s.c, { name: 'Smithy 2', kind: '' }, shop, smithy.revision + 1)
    expect((await call.admin(s.c)).shops[0].kind).toBeNull()
    for (const who of [player, outsider, otherDm]) {
      await asUser(who)
      await expect(call.addListings(s.c, shop, items)).rejects.toThrow(/Forbidden/)
    }
    await asUser(otherDm)
    await expect(call.addListings(s.other, shop, items)).rejects.toThrow(/Invalid request/)
    await asAnon()
    await expect(call.addListings(s.c, shop, items)).rejects.toThrow(/permission denied/)
  })

  it('attaches shop images and lets only members who see the shop read them', async () => {
    const s = await setup()
    const shop = await call.shop(s.c, { name: 'Tower', visibility: 'selected', access: [s.bea] })
    const path = `public/${s.c}/${shop}/${randomUUID()}.webp`
    const stray = `public/${s.c}/${shop}/${randomUUID()}.webp`
    const readable = async (who: string | null, name: string) => {
      if (who) await asUser(who)
      else await asAnon()
      try {
        return (
          (
            await db.query(
              "select 1 from storage.objects where bucket_id='shop-images' and name=$1",
              [name],
            )
          ).rows.length === 1
        )
      } catch {
        return false
      }
    }
    const upload = async (who: string, name: string) => {
      await asUser(who)
      await db.query("insert into storage.objects(bucket_id,name) values ('shop-images',$1)", [
        name,
      ])
    }
    for (const who of [player, peer, outsider, otherDm])
      await expect(upload(who, `public/${s.c}/${shop}/${randomUUID()}.webp`)).rejects.toThrow(
        /row-level security/,
      )
    await expect(upload(dm, `public/${s.c}/${randomUUID()}/${randomUUID()}.webp`)).rejects.toThrow(
      /row-level security/,
    )
    await expect(upload(dm, `public/${s.c}/${shop}/${randomUUID()}.gif`)).rejects.toThrow(
      /row-level security/,
    )
    await upload(dm, path)
    await upload(dm, stray)
    await asUser(dm)
    await expect(
      call.shopImage(s.c, shop, 0, `public/${s.c}/${shop}/${randomUUID()}.webp`),
    ).rejects.toThrow(/Image unavailable/)
    await expect(
      call.shopImage(s.c, shop, 0, `pre/${s.c}/${shop}/${randomUUID()}.webp`),
    ).rejects.toThrow(/Invalid image path/)
    const key = randomUUID()
    const set = await call.shopImage(s.c, shop, 0, path, key)
    expect(set).toEqual({ id: shop, image_path: path, revision: 1 })
    expect(await call.shopImage(s.c, shop, 0, path, key)).toEqual(set)
    await asUser(dm)
    await expect(call.shopImage(s.c, shop, 0, null)).rejects.toThrow(/Stale revision/)
    for (const who of [player, outsider, otherDm]) {
      await asUser(who)
      await expect(call.shopImage(s.c, shop, 1, null)).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(call.shopImage(s.c, shop, 1, null)).rejects.toThrow(/permission denied/)
    // Reads: DM always; Bea (selected) the current image only; Arin, outsiders and other DMs never.
    expect(await readable(dm, stray)).toBe(true)
    expect(await readable(peer, path)).toBe(true)
    expect(await readable(peer, stray)).toBe(false)
    for (const who of [player, outsider, otherDm]) expect(await readable(who, path)).toBe(false)
    expect(await readable(null, path)).toBe(false)
    await asUser(peer)
    expect((await call.storefront(s.c, s.bea)).shops[0]).toMatchObject({ image_path: path })
    // Hiding the shop hides the image.
    await asUser(dm)
    await call.shop(s.c, { name: 'Tower', visibility: 'hidden' }, shop, 1)
    expect(await readable(peer, path)).toBe(false)
    expect(await readable(dm, path)).toBe(true)
    // Deletes are DM only; objects are never updated in place (no update policy).
    await asUser(peer)
    await db.query("delete from storage.objects where bucket_id='shop-images' and name=$1", [stray])
    expect(await readable(dm, stray)).toBe(true)
    await asUser(dm)
    await db.query("delete from storage.objects where bucket_id='shop-images' and name=$1", [stray])
    expect(await readable(dm, stray)).toBe(false)
    expect(await call.shopImage(s.c, shop, 2, null)).toMatchObject({
      image_path: null,
      revision: 3,
    })
  })

  it('serves PRE shop images through the PRE helpers only', async () => {
    await asRoot()
    // The PRE copy (from before part 1) received the helper through the guarded mirror.
    expect(
      await row(
        "select to_regprocedure('pre_private.can_read_shop_image(uuid,uuid,text)') is not null ok",
      ),
    ).toEqual({
      ok: true,
    })
    const s = await setup()
    const shop = await call.shop(s.c, { name: 'Prod shop', visibility: 'party' })
    // A PROD shop id under the pre/ prefix has no PRE row, so nobody may write it.
    await asUser(dm)
    await expect(
      db.query("insert into storage.objects(bucket_id,name) values ('shop-images',$1)", [
        `pre/${s.c}/${shop}/${randomUUID()}.webp`,
      ]),
    ).rejects.toThrow(/row-level security/)
    // The copied legacy campaign works end to end in PRE and never touches PROD rows.
    const c = legacy.c!
    await asUser(dm)
    const preShop = (
      await db.query<{ id: string }>(
        'select pre.save_shop($1,null,null,\'{"name":"Pre stall","visibility":"party","kind":"general"}\',$2) id',
        [c, randomUUID()],
      )
    ).rows[0]!.id
    const path = `pre/${c}/${preShop}/${randomUUID()}.webp`
    await db.query("insert into storage.objects(bucket_id,name) values ('shop-images',$1)", [path])
    await expect(
      db.query('select public.set_shop_image($1,$2,0,$3,$4)', [c, preShop, path, randomUUID()]),
    ).rejects.toThrow(/Shop unavailable/)
    const set = await res('select pre.set_shop_image($1,$2,0,$3,$4) result', [
      c,
      preShop,
      path,
      randomUUID(),
    ])
    expect(set).toMatchObject({ image_path: path, revision: 1 })
    await asUser(player)
    expect(
      (
        await db.query("select 1 from storage.objects where bucket_id='shop-images' and name=$1", [
          path,
        ])
      ).rows,
    ).toHaveLength(1)
    const found = await res<Json[]>('select pre.search_campaign_items($1,$2,50) result', [c, ''])
    expect(found.map((x) => x.name)).toEqual(['Lucky pebble'])
    await res('select pre.propose_item($1,$2,$3,1,$4) result', [
      c,
      legacy.arin,
      json({ name: 'Pre idea', category: 'gear' }),
      randomUUID(),
    ])
    expect(await row('select count(*)::int n from pre.item_proposals')).toEqual({ n: 1 })
    expect(
      await row('select count(*)::int n from public.item_proposals where campaign_id=$1', [c]),
    ).toEqual({ n: 0 })
    expect(await row('select count(*)::int n from public.shops where id=$1', [preShop])).toEqual({
      n: 0,
    })
  })

  it('reads basic and own item images for members', async () => {
    const s = await setup()
    const basic = await call.import(s.c, [{ key: 'lamp', name: 'Lamp', category: 'gear' }])
    const lamp = basic.created[0].id
    const path = `public/${s.c}/${lamp}/${randomUUID()}.webp`
    await db.query("insert into storage.objects(bucket_id,name) values ('item-images',$1)", [path])
    await res('select public.set_item_image($1,$2,0,$3,$4) result', [s.c, lamp, path, randomUUID()])
    const can = async (who: string) => {
      await asUser(who)
      return (
        await db.query("select 1 from storage.objects where bucket_id='item-images' and name=$1", [
          path,
        ])
      ).rows.length
    }
    expect(await can(player)).toBe(1)
    expect(await can(peer)).toBe(1)
    expect(await can(outsider)).toBe(0)
    expect(await can(otherDm)).toBe(0)
  })
})
