import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
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
type Impact = {
  listings: { id: string; shop_name: string; price: number; revision: number }[]
  holders: number
  units: number
  open_orders: number
}
type Definition = { id: string; archived: boolean; revision: number; value_gp: number | null }

const define = async (c: string, item: Record<string, unknown>) =>
  (
    await one<{ id: string }>('select public.save_item_definition($1,null,null,$2,$3) result', [
      c,
      json(item),
      randomUUID(),
    ])
  ).id
const shop = (c: string, draft: Record<string, unknown>) =>
  one<string>('select public.save_shop($1,null,null,$2,$3) result', [c, json(draft), randomUUID()])
const listing = (c: string, s: string, draft: Record<string, unknown>) =>
  one<string>('select public.save_listing($1,$2,null,null,$3,$4) result', [
    c,
    s,
    json(draft),
    randomUUID(),
  ])
const impact = (c: string, d: string) =>
  one<Impact>('select public.item_definition_impact($1,$2) result', [c, d])
const archive = (c: string, d: string, revision: number, key = randomUUID()) =>
  one<{ id: string; archived_listings: number; revision: number }>(
    'select public.archive_item_definition($1,$2,$3,$4) result',
    [c, d, revision, key],
  )
const sync = (c: string, d: string, ids: string[], price: number, key = randomUUID()) =>
  one<{ updated: number }>('select public.sync_listing_prices($1,$2,$3,$4,$5) result', [
    c,
    d,
    ids,
    price,
    key,
  ])
const row = async (d: string) => {
  await db.exec('reset role')
  return (
    await db.query<Definition>(
      'select id, archived, revision::int revision, value_gp from public.item_definitions where id=$1',
      [d],
    )
  ).rows[0]!
}
const listingRow = async (l: string) => {
  await db.exec('reset role')
  return (
    await db.query<{ price: number; archived: boolean; revision: number }>(
      'select price, archived, revision::int revision from public.shop_listings where id=$1',
      [l],
    )
  ).rows[0]!
}

async function setup() {
  await asUser(dm)
  const c = await one<string>("select public.create_campaign('Lifecycle') result")
  const ch = await one<string>("select public.create_character($1, 'Arin') result", [c])
  const invite = await one<string>('select public.invite_character_player($1,$2,$3) result', [
    c,
    ch,
    'player@example.com',
  ])
  await asUser(player)
  await db.query('select public.respond_campaign_invitation($1,true)', [invite])
  await asUser(dm)
  const sword = await define(c, { name: 'Longsword', category: 'weapon', value_gp: 15 })
  const market = await shop(c, { name: 'Market', visibility: 'party', mode: 'auto' })
  const smith = await shop(c, { name: 'Smith', visibility: 'party', mode: 'approval' })
  const marketSword = await listing(c, market, { definition_id: sword, price: 15 })
  const smithSword = await listing(c, smith, { definition_id: sword, price: 18 })
  await db.query('select public.grant_item($1,$2,$3,2,$4)', [c, ch, sword, randomUUID()])
  return { c, ch, sword, market, smith, marketSword, smithSword }
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [outsider, 'other@example.com'],
    [otherDm, 'otherdm@example.com'],
  ])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 30000)
afterAll(() => db.close())

describe('RYT-032 item lifecycle access matrix', () => {
  it('denies impact, archive and price sync to anon, outsiders, players and other DMs', async () => {
    const s = await setup()
    await asUser(otherDm)
    const elsewhere = await one<string>("select public.create_campaign('Elsewhere') result")
    for (const user of [outsider, otherDm, player]) {
      await asUser(user)
      await expect(impact(s.c, s.sword)).rejects.toThrow(/Forbidden/)
      await expect(archive(s.c, s.sword, 0)).rejects.toThrow(/Forbidden/)
      await expect(sync(s.c, s.sword, [s.marketSword], 1)).rejects.toThrow(/Forbidden/)
    }
    // A DM of another campaign cannot reach this campaign's rows through their own campaign.
    await asUser(otherDm)
    await expect(impact(elsewhere, s.sword)).rejects.toThrow(/Item unavailable/)
    await expect(archive(elsewhere, s.sword, 0)).rejects.toThrow(/Item unavailable/)
    await expect(sync(elsewhere, s.sword, [s.marketSword], 1)).rejects.toThrow(/Invalid request/)
    await asAnon()
    await expect(impact(s.c, s.sword)).rejects.toThrow(/permission denied/)
    await expect(archive(s.c, s.sword, 0)).rejects.toThrow(/permission denied/)
    await expect(sync(s.c, s.sword, [s.marketSword], 1)).rejects.toThrow(/permission denied/)
    expect(await row(s.sword)).toMatchObject({ archived: false, revision: 0 })
    expect(await listingRow(s.marketSword)).toMatchObject({ price: 15, archived: false })
  })
})

describe('RYT-032 archive item definition', () => {
  it('reports impact, archives listings, keeps holdings and blocks new grants and listings', async () => {
    const s = await setup()
    await asUser(dm)
    const before = await impact(s.c, s.sword)
    expect(before.listings.map((l) => [l.shop_name, l.price])).toEqual([
      ['Market', 15],
      ['Smith', 18],
    ])
    expect(before).toMatchObject({ holders: 1, units: 2, open_orders: 0 })
    await expect(archive(s.c, s.sword, 7)).rejects.toThrow(/Stale revision/)
    const key = randomUUID()
    const result = await archive(s.c, s.sword, 0, key)
    expect(result).toMatchObject({ id: s.sword, archived_listings: 2, revision: 1 })
    // A retry with the same key replays; a second archive is refused.
    await asUser(dm)
    expect(await archive(s.c, s.sword, 0, key)).toEqual(result)
    await asUser(dm)
    await expect(archive(s.c, s.sword, 1)).rejects.toThrow(/Item unavailable/)
    expect(await row(s.sword)).toMatchObject({ archived: true, revision: 1 })
    expect(await listingRow(s.marketSword)).toMatchObject({ archived: true, revision: 1 })
    await asUser(dm)
    expect((await impact(s.c, s.sword)).listings).toEqual([])
    await asUser(dm)
    await expect(
      db.query('select public.grant_item($1,$2,$3,1,$4)', [s.c, s.ch, s.sword, randomUUID()]),
    ).rejects.toThrow(/Item unavailable/)
    await expect(listing(s.c, s.market, { definition_id: s.sword, price: 1 })).rejects.toThrow(
      /Invalid request/,
    )
    const admin = await one<{ items: { id: string }[]; shops: { listings: unknown[] }[] }>(
      'select public.get_shop_admin($1) result',
      [s.c],
    )
    expect(admin.items.some((i) => i.id === s.sword)).toBe(false)
    expect(admin.shops.every((shop) => shop.listings.length === 0)).toBe(true)
    // Holdings stay readable for the Player.
    await asUser(player)
    const held = await db.query<{ quantity: number }>(
      'select quantity from public.inventory_items where definition_id=$1',
      [s.sword],
    )
    expect(held.rows).toEqual([{ quantity: 2 }])
    const front = await one<{ shops: { listings: unknown[] }[] }>(
      'select public.get_storefront($1,$2) result',
      [s.c, s.ch],
    )
    expect(front.shops.every((shop) => shop.listings.length === 0)).toBe(true)
  })

  it('refuses while a purchase request is open and edits keep the archived flag', async () => {
    const s = await setup()
    await db.exec('reset role')
    await db.query('update public.character_resources set gold=100 where character_id=$1', [s.ch])
    await asUser(player)
    const order = await one<{ order_id: string }>(
      'select public.checkout($1,$2,$3,$4,$5,$6) result',
      [s.c, s.smith, s.ch, json([{ listing_id: s.smithSword, quantity: 1 }]), '', randomUUID()],
    )
    await asUser(dm)
    expect((await impact(s.c, s.sword)).open_orders).toBe(1)
    await expect(archive(s.c, s.sword, 0)).rejects.toThrow(/Open orders/)
    await db.query('select public.respond_order($1,$2,$3,null,null,$4)', [
      s.c,
      order.order_id,
      'reject',
      randomUUID(),
    ])
    await archive(s.c, s.sword, 0)
    await asUser(dm)
    await db.query('select public.save_item_definition($1,$2,1,$3,$4)', [
      s.c,
      s.sword,
      json({ name: 'Old longsword', category: 'weapon', value_gp: 15 }),
      randomUUID(),
    ])
    expect(await row(s.sword)).toMatchObject({ archived: true, revision: 2 })
  })
})

describe('RYT-032 sync listing prices', () => {
  it('reprices only the chosen live listings, transactionally and idempotently', async () => {
    const s = await setup()
    await asUser(dm)
    const key = randomUUID()
    expect(await sync(s.c, s.sword, [s.marketSword], 40, key)).toEqual({ updated: 1 })
    expect(await listingRow(s.marketSword)).toMatchObject({ price: 40, revision: 1 })
    expect(await listingRow(s.smithSword)).toMatchObject({ price: 18, revision: 0 })
    // Replay and a fresh repeat both leave the row alone.
    await asUser(dm)
    expect(await sync(s.c, s.sword, [s.marketSword], 40, key)).toEqual({ updated: 1 })
    await asUser(dm)
    expect(await sync(s.c, s.sword, [s.marketSword, s.marketSword], 40)).toEqual({ updated: 0 })
    expect(await listingRow(s.marketSword)).toMatchObject({ price: 40, revision: 1 })
    await asUser(dm)
    await expect(sync(s.c, s.sword, [s.marketSword], 50, key)).rejects.toThrow(/Request mismatch/)
    // One foreign or invalid id rejects the whole call.
    const axe = await define(s.c, { name: 'Axe', category: 'weapon', value_gp: 5 })
    const marketAxe = await listing(s.c, s.market, { definition_id: axe, price: 5 })
    await expect(sync(s.c, s.sword, [s.smithSword, marketAxe], 30)).rejects.toThrow(
      /Invalid request/,
    )
    await expect(sync(s.c, s.sword, [randomUUID()], 30)).rejects.toThrow(/Invalid request/)
    await expect(sync(s.c, s.sword, [s.smithSword], -1)).rejects.toThrow(/Invalid request/)
    await expect(sync(s.c, s.sword, [], 30)).rejects.toThrow(/Invalid request/)
    expect(await listingRow(s.smithSword)).toMatchObject({ price: 18, revision: 0 })
    expect(await listingRow(marketAxe)).toMatchObject({ price: 5, revision: 0 })
    await asUser(dm)
    await db.query('select public.archive_listing($1,$2)', [s.c, s.smithSword])
    await expect(sync(s.c, s.sword, [s.smithSword], 30)).rejects.toThrow(/Invalid request/)
  })
})

describe('RYT-032 PRE mirror', () => {
  it('recreates the lifecycle functions in an existing PRE with remapped references', async () => {
    const s = await setup()
    await db.exec('reset role')
    await db.exec(
      withExposureSql(
        etlCommand(['--apply']).query,
        readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
      ),
    )
    // Simulate a PRE copied before this migration, then run only its guarded PRE block.
    await db.exec(`drop function pre.item_definition_impact(uuid,uuid);
      drop function pre.archive_item_definition(uuid,uuid,bigint,uuid);
      drop function pre.sync_listing_prices(uuid,uuid,uuid[],integer,uuid);`)
    const migration = readFileSync('supabase/migrations/20261103140000_item_lifecycle.sql', 'utf8')
    await db.exec(
      migration.slice(migration.indexOf('do $$'), migration.indexOf('comment on function')),
    )
    const body = await one<string>(
      "select pg_get_functiondef('pre.archive_item_definition(uuid,uuid,bigint,uuid)'::regprocedure) result",
    )
    expect(body).toMatch(/pre_private\.shop_lock/)
    expect(body).not.toMatch(/\bpublic\.|\bprivate\./)
    const args = [s.c, s.sword]
    await asAnon()
    await expect(db.query('select pre.item_definition_impact($1,$2)', args)).rejects.toThrow(
      /permission denied/,
    )
    await asUser(player)
    await expect(db.query('select pre.item_definition_impact($1,$2)', args)).rejects.toThrow(
      /Forbidden/,
    )
    await asUser(dm)
    await db.query('select pre.sync_listing_prices($1,$2,$3,77,$4)', [
      s.c,
      s.sword,
      [s.marketSword],
      randomUUID(),
    ])
    expect(await listingRow(s.marketSword)).toMatchObject({ price: 15 })
    const pre = await db.query<{ price: number }>(
      'select price from pre.shop_listings where id=$1',
      [s.marketSword],
    )
    expect(pre.rows).toEqual([{ price: 77 }])
  })
})
