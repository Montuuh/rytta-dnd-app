import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

const migration = '20261103150000_player_trades.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  third = randomUUID(),
  outsider = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
type Json = Record<string, unknown>
const one = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!
const res = async (sql: string, args: unknown[] = []) =>
  (await one<{ result: Json }>(sql, args)).result

type Side = { character_id: string; gold: number; confirmed: boolean; items: Json[] }
type TradeState = {
  character: { id: string; name: string; gold: number } | null
  partners: { id: string; name: string; busy: boolean }[]
  items: { item_id: string; quantity: number; name: string }[]
  trade: {
    id: string
    status: string
    revision: number
    initiated_by_you: boolean
    you: Side
    partner: Side
  } | null
  recent: { id: string; status: string; closed_by_you: boolean; summary: Json | null } | null
  history: { id: string; partner: string; gave: Json; received: Json }[]
}

function api(schema = 'public') {
  return {
    state: async (c: string, acting: string | null = null) =>
      (await res(`select ${schema}.get_trade_state($1,$2) result`, [c, acting])) as TradeState,
    invite: (c: string, from: string, to: string, key = randomUUID()) =>
      res(`select ${schema}.invite_trade($1,$2,$3,$4) result`, [c, from, to, key]),
    respond: (c: string, trade: string, accept: boolean, key = randomUUID()) =>
      res(`select ${schema}.respond_trade_invite($1,$2,$3,$4) result`, [c, trade, accept, key]),
    offer: (
      c: string,
      trade: string,
      acting: string,
      revision: number,
      items: { item_id: string; quantity: number }[],
      gold: number,
      key = randomUUID(),
    ) =>
      res(`select ${schema}.set_trade_offer($1,$2,$3,$4,$5,$6,$7) result`, [
        c,
        trade,
        acting,
        revision,
        JSON.stringify(items),
        gold,
        key,
      ]),
    confirm: (c: string, trade: string, acting: string, revision: number, key = randomUUID()) =>
      res(`select ${schema}.confirm_trade($1,$2,$3,$4,$5) result`, [
        c,
        trade,
        acting,
        revision,
        key,
      ]),
    cancel: (c: string, trade: string, acting: string) =>
      res(`select ${schema}.cancel_trade($1,$2,$3) result`, [c, trade, acting]),
  }
}
const pub = api()

async function setup(schema = 'public') {
  await asUser(dm)
  const c = (await one<{ id: string }>(`select ${schema}.create_campaign('Trade table') id`)).id
  const ids: Record<string, string> = {}
  for (const name of ['Arin', 'Bea', 'Cato', 'Npc'])
    ids[name] = (
      await one<{ id: string }>(`select ${schema}.create_character($1,$2) id`, [c, name])
    ).id
  for (const [user, email, character] of [
    [player, 'player@example.com', ids.Arin],
    [peer, 'peer@example.com', ids.Bea],
    [third, 'third@example.com', ids.Cato],
  ] as const) {
    await asUser(dm)
    const id = (
      await one<{ id: string }>(`select ${schema}.invite_character_player($1,$2,$3) id`, [
        c,
        character,
        email,
      ])
    ).id
    await asUser(user)
    await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [id])
  }
  await asUser(dm)
  for (const [character, gold] of [
    [ids.Arin, 100],
    [ids.Bea, 40],
  ] as const)
    await db.query(`select ${schema}.set_character_resources($1,$2,0,$3,0,0,0,$4)`, [
      c,
      character,
      gold,
      randomUUID(),
    ])
  const define = async (item: Json) =>
    (
      (await res(`select ${schema}.save_item_definition($1,null,null,$2,$3) result`, [
        c,
        JSON.stringify(item),
        randomUUID(),
      ])) as { id: string }
    ).id
  const grant = async (character: string, def: string, amount: number) =>
    (
      (await res(`select ${schema}.grant_item($1,$2,$3,$4,$5) result`, [
        c,
        character,
        def,
        amount,
        randomUUID(),
      ])) as { item_id: string; revision: number }
    ).item_id
  const potionDef = await define({
    name: 'Potion',
    category: 'consumable',
    icon: 'flask-conical',
    value_gp: 50,
  })
  const ringDef = await define({ name: 'Ring', category: 'treasure', slot_kind: 'ring' })
  const ropeDef = await define({ name: 'Rope', category: 'gear' })
  const potions = await grant(ids.Arin, potionDef, 3)
  const ring = await grant(ids.Arin, ringDef, 1)
  const rope = await grant(ids.Bea, ropeDef, 2)
  const beaPotions = await grant(ids.Bea, potionDef, 1)
  return {
    c,
    ...(ids as { Arin: string; Bea: string; Cato: string; Npc: string }),
    potionDef,
    potions,
    ring,
    rope,
    beaPotions,
  }
}
const quantity = async (item: string) => {
  await db.exec('reset role')
  return (
    await one<{ q: number }>('select quantity q from public.inventory_items where id=$1', [item])
  ).q
}
const gold = async (character: string, schema = 'public') => {
  await db.exec('reset role')
  return Number(
    (
      await one<{ g: string }>(
        `select gold g from ${schema}.character_resources where character_id=$1`,
        [character],
      )
    ).g,
  )
}

/** Opens a trade Arin -> Bea and returns its id at revision 1. */
async function openTrade(s: Awaited<ReturnType<typeof setup>>, schema = 'public') {
  const a = api(schema)
  await asUser(player)
  const { trade_id } = (await a.invite(s.c, s.Arin, s.Bea)) as { trade_id: string }
  await asUser(peer)
  await a.respond(s.c, trade_id, true)
  return trade_id
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [peer, 'peer@example.com'],
    [third, 'third@example.com'],
    [outsider, 'other@example.com'],
  ])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files.filter((f) => f < migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  // A PRE copied before RYT-034 exercises the migration's guarded PRE mirror.
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 60000)
afterAll(() => db.close())

describe('RYT-034 player trades', () => {
  it('runs invite, offers, double confirmation and an atomic swap with ledger entries', async () => {
    const s = await setup()
    await asUser(player)
    const before = await pub.state(s.c)
    expect(before.character).toMatchObject({ id: s.Arin, name: 'Arin', gold: 100 })
    // Partners are assigned characters only (never the unassigned NPC); names only.
    expect(before.partners.map((p) => p.name)).toEqual(['Bea', 'Cato'])
    expect(before.items.map((i) => i.name).sort()).toEqual(['Potion', 'Ring'])
    expect(JSON.stringify(before)).not.toMatch(/value_gp|"50"/)
    const { trade_id: id } = (await pub.invite(s.c, s.Arin, s.Bea)) as { trade_id: string }
    await asUser(peer)
    const invited = await pub.state(s.c)
    expect(invited.trade).toMatchObject({ id, status: 'invited', initiated_by_you: false })
    expect(invited.trade!.partner).toMatchObject({ character_id: s.Arin })
    // Offers are only possible after acceptance.
    await expect(pub.offer(s.c, id, s.Bea, 0, [], 1)).rejects.toThrow(/Trade closed/)
    expect(await pub.respond(s.c, id, true)).toMatchObject({ status: 'open', revision: 1 })

    await asUser(player)
    await pub.offer(s.c, id, s.Arin, 1, [{ item_id: s.potions, quantity: 2 }], 30)
    await asUser(peer)
    await pub.offer(s.c, id, s.Bea, 2, [{ item_id: s.rope, quantity: 2 }], 5)
    expect(await pub.confirm(s.c, id, s.Bea, 3)).toMatchObject({ status: 'open', revision: 3 })
    await asUser(player)
    let st = await pub.state(s.c)
    expect(st.trade!.partner).toMatchObject({ confirmed: true, gold: 5 })
    expect(st.trade!.partner.items).toEqual([
      expect.objectContaining({ name: 'Rope', quantity: 2 }),
    ])
    expect(st.trade!.you).toMatchObject({ confirmed: false, gold: 30 })
    // Any change unlocks both sides.
    await pub.offer(s.c, id, s.Arin, 3, [{ item_id: s.potions, quantity: 2 }], 25)
    st = await pub.state(s.c)
    expect(st.trade).toMatchObject({ revision: 4 })
    expect(st.trade!.partner.confirmed).toBe(false)
    // A stale revision cannot be confirmed.
    await asUser(peer)
    await expect(pub.confirm(s.c, id, s.Bea, 3)).rejects.toThrow(/Stale revision/)
    const peerKey = randomUUID()
    await pub.confirm(s.c, id, s.Bea, 4, peerKey)
    await asUser(player)
    const done = await pub.confirm(s.c, id, s.Arin, 4)
    expect(done).toMatchObject({ status: 'completed', revision: 5 })

    expect(await quantity(s.potions)).toBe(1)
    expect(await quantity(s.rope)).toBe(0)
    expect(await gold(s.Arin)).toBe(100 - 25 + 5)
    expect(await gold(s.Bea)).toBe(40 - 5 + 25)
    // Bea's potions merge into her existing loose stack of the same source.
    expect(await quantity(s.beaPotions)).toBe(3)

    // Double confirmation is idempotent: a replay and a late confirm both return completed.
    await asUser(peer)
    expect(await pub.confirm(s.c, id, s.Bea, 4, peerKey)).toMatchObject({ status: 'open' })
    expect(await pub.confirm(s.c, id, s.Bea, 4)).toMatchObject({ status: 'completed' })
    expect(await gold(s.Bea)).toBe(60)
    expect(await quantity(s.beaPotions)).toBe(3)

    // Ledger rows: each Player reads their own trade_in/trade_out events; the DM reads both.
    await asUser(peer)
    const beaLedger = (
      await db.query<{ kind: string; quantity_delta: number }>(
        "select kind, quantity_delta from public.inventory_events where kind like 'trade_%' order by kind, quantity_delta",
      )
    ).rows
    expect(beaLedger).toEqual([
      { kind: 'trade_in', quantity_delta: 2 },
      { kind: 'trade_out', quantity_delta: -2 },
    ])
    const history = (await pub.state(s.c)).history
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      id,
      partner: 'Arin',
      gave: { gold: 5, items: [expect.objectContaining({ name: 'Rope', quantity: 2 })] },
      received: { gold: 25, items: [expect.objectContaining({ name: 'Potion', quantity: 2 })] },
    })
    expect((await pub.state(s.c)).recent).toMatchObject({ id, status: 'completed' })
    // Bea can now read the Potion definition she received in the trade (her inventory ledger).
    expect(
      (await db.query("select name from public.item_definitions where name='Potion'")).rows,
    ).toHaveLength(1)
    await asUser(dm)
    expect(
      (await db.query("select character_id from public.inventory_events where kind like 'trade_%'"))
        .rows,
    ).toHaveLength(4)
    const audit = (
      await db.query<{ character_id: string; after_value: Json }>(
        "select character_id, after_value from public.character_events where kind='trade_completed' order by character_id",
      )
    ).rows
    expect(audit).toHaveLength(2)
    expect(audit.find((e) => e.character_id === s.Arin)!.after_value).toMatchObject({
      trade_id: id,
      partner: 'Bea',
      gave: { gold: 25 },
    })
    // Gold changes also leave resource audit rows.
    expect(
      (
        await db.query(
          "select 1 from public.character_events where kind='character_resources:UPDATE' and character_id=$1 and (after_value->>'gold')::int = 80",
          [s.Arin],
        )
      ).rows,
    ).toHaveLength(1)
  })

  it('rejects insufficient gold and items, equipped and foreign stacks, oversized offers', async () => {
    const s = await setup()
    const id = await openTrade(s)
    await asUser(player)
    await expect(pub.offer(s.c, id, s.Arin, 1, [], 101)).rejects.toThrow(/Insufficient gold/)
    await expect(
      pub.offer(s.c, id, s.Arin, 1, [{ item_id: s.potions, quantity: 4 }], 0),
    ).rejects.toThrow(/Insufficient quantity/)
    await expect(
      pub.offer(s.c, id, s.Arin, 1, [{ item_id: s.rope, quantity: 1 }], 0),
    ).rejects.toThrow(/Item unavailable/)
    await expect(
      pub.offer(s.c, id, s.Arin, 1, [{ item_id: s.potions, quantity: 1.5 }], 0),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      pub.offer(
        s.c,
        id,
        s.Arin,
        1,
        [
          { item_id: s.potions, quantity: 1 },
          { item_id: s.potions, quantity: 1 },
        ],
        0,
      ),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      pub.offer(
        s.c,
        id,
        s.Arin,
        1,
        Array.from({ length: 9 }, () => ({ item_id: randomUUID(), quantity: 1 })),
        0,
      ),
    ).rejects.toThrow(/Invalid request/)
    await expect(pub.offer(s.c, id, s.Arin, 1, [], -1)).rejects.toThrow(/Invalid request/)
    // Equipped items cannot be offered.
    const equipped = (await res('select public.equip_item($1,$2,0,$3,$4) result', [
      s.c,
      s.ring,
      'ring_1',
      randomUUID(),
    ])) as { item_id: string }
    await expect(
      pub.offer(s.c, id, s.Arin, 1, [{ item_id: equipped.item_id, quantity: 1 }], 0),
    ).rejects.toThrow(/Item equipped/)
    // Nothing was written by the failed attempts.
    expect((await pub.state(s.c)).trade).toMatchObject({ revision: 1 })
    // A stale revision on an offer is rejected too.
    await pub.offer(s.c, id, s.Arin, 1, [{ item_id: s.potions, quantity: 1 }], 0)
    await expect(pub.offer(s.c, id, s.Arin, 1, [], 0)).rejects.toThrow(/Stale revision/)
  })

  it('keeps the swap atomic when a stack or balance changes before the final confirmation', async () => {
    const s = await setup()
    const id = await openTrade(s)
    await asUser(player)
    await pub.offer(s.c, id, s.Arin, 1, [{ item_id: s.potions, quantity: 3 }], 100)
    await asUser(peer)
    await pub.offer(s.c, id, s.Bea, 2, [{ item_id: s.rope, quantity: 1 }], 0)
    await pub.confirm(s.c, id, s.Bea, 3)
    // Arin drinks a potion outside the trade; the completion must refuse and move nothing.
    await asUser(player)
    await res('select public.use_item($1,$2,0,1,$3) result', [s.c, s.potions, randomUUID()])
    await expect(pub.confirm(s.c, id, s.Arin, 3)).rejects.toThrow(/Insufficient quantity/)
    expect(await quantity(s.potions)).toBe(2)
    expect(await quantity(s.rope)).toBe(2)
    expect(await gold(s.Arin)).toBe(100)
    expect(await gold(s.Bea)).toBe(40)
    await asUser(player)
    expect((await pub.state(s.c)).trade).toMatchObject({ status: 'open' })
    // Gold spent elsewhere is caught the same way.
    await pub.offer(s.c, id, s.Arin, 3, [{ item_id: s.potions, quantity: 2 }], 100)
    await asUser(peer)
    await pub.confirm(s.c, id, s.Bea, 4)
    await asUser(dm)
    await db.query('select public.set_character_resources($1,$2,1,50,0,0,0,$3)', [
      s.c,
      s.Arin,
      randomUUID(),
    ])
    await asUser(player)
    await expect(pub.confirm(s.c, id, s.Arin, 4)).rejects.toThrow(/Insufficient gold/)
    expect(await gold(s.Bea)).toBe(40)
    expect(await quantity(s.rope)).toBe(2)
  })

  it('allows one active trade per character, decline, cancel and expiry', async () => {
    const s = await setup()
    await asUser(player)
    const { trade_id: first } = (await pub.invite(s.c, s.Arin, s.Bea)) as { trade_id: string }
    await expect(pub.invite(s.c, s.Arin, s.Cato)).rejects.toThrow(/Trade busy/)
    await asUser(third)
    await expect(pub.invite(s.c, s.Cato, s.Bea)).rejects.toThrow(/Partner busy/)
    await expect(pub.invite(s.c, s.Cato, s.Arin)).rejects.toThrow(/Partner busy/)
    // Decline closes the invitation and the initiator learns it through "recent".
    await asUser(peer)
    expect(await pub.respond(s.c, first, false)).toMatchObject({ status: 'declined' })
    await asUser(player)
    expect((await pub.state(s.c)).recent).toMatchObject({ id: first, status: 'declined' })
    // Invitations expire; an expired invitation cannot be accepted and frees both characters.
    const { trade_id: second } = (await pub.invite(s.c, s.Arin, s.Bea)) as { trade_id: string }
    await db.exec('reset role')
    await db.query(
      "update public.trades set expires_at = now() - interval '1 second' where id=$1",
      [second],
    )
    await asUser(peer)
    expect((await pub.state(s.c)).trade).toBeNull()
    expect((await pub.state(s.c)).recent).toMatchObject({ id: second, status: 'expired' })
    await expect(pub.respond(s.c, second, true)).rejects.toThrow(/Trade closed/)
    // Open trades expire after inactivity as well.
    const third_ = await openTrade(s)
    await db.exec('reset role')
    await db.query(
      "update public.trades set expires_at = now() - interval '1 second' where id=$1",
      [third_],
    )
    await asUser(player)
    await expect(pub.offer(s.c, third_, s.Arin, 1, [], 1)).rejects.toThrow(/Trade closed/)
    // The failed call rolls back its own sweep; reads still report the effective status and
    // the next successful mutation persists it.
    expect((await pub.state(s.c)).recent).toMatchObject({ id: third_, status: 'expired' })
    // Either side cancels; cancelling again is a no-op that reports the status.
    const fourth = await openTrade(s)
    await db.exec('reset role')
    expect(
      (await one<{ status: string }>('select status from public.trades where id=$1', [third_]))
        .status,
    ).toBe('expired')
    await asUser(peer)
    expect(await pub.cancel(s.c, fourth, s.Bea)).toMatchObject({ status: 'cancelled' })
    expect(await pub.cancel(s.c, fourth, s.Bea)).toMatchObject({ status: 'cancelled' })
    await asUser(player)
    await expect(pub.confirm(s.c, fourth, s.Arin, 1)).rejects.toThrow(/Trade closed/)
  })

  it('denies anon, outsiders, non-participants, cross-campaign DMs and direct writes', async () => {
    const s = await setup()
    await asUser(outsider)
    const other = (await one<{ id: string }>("select public.create_campaign('Other') id")).id
    const foreign = (
      await one<{ id: string }>("select public.create_character($1,'Foreign') id", [other])
    ).id
    await expect(pub.state(s.c)).rejects.toThrow(/Forbidden/)
    await expect(pub.invite(s.c, s.Arin, s.Bea)).rejects.toThrow(/Forbidden/)
    // A DM of another campaign cannot swap campaign ids to reach these characters.
    await expect(pub.invite(other, s.Arin, s.Bea)).rejects.toThrow(/Character unavailable/)
    await expect(pub.invite(other, foreign, s.Bea)).rejects.toThrow(/Character unavailable/)
    // A Player invites only from the own character and never to an unassigned one.
    await asUser(player)
    await expect(pub.invite(s.c, s.Bea, s.Arin)).rejects.toThrow(/Forbidden/)
    await expect(pub.invite(s.c, s.Arin, s.Npc)).rejects.toThrow(/Character unavailable/)
    await expect(pub.invite(s.c, s.Arin, foreign)).rejects.toThrow(/Character unavailable/)
    await expect(pub.state(s.c, peer)).rejects.toThrow(/Forbidden/)
    const id = await openTrade(s)
    // A non-participant Player sees nothing and cannot act on the trade.
    await asUser(third)
    expect((await db.query('select * from public.trades')).rows).toHaveLength(0)
    expect((await db.query('select * from public.trade_offer_items')).rows).toHaveLength(0)
    expect((await pub.state(s.c)).trade).toBeNull()
    await expect(pub.respond(s.c, id, true)).rejects.toThrow(/Forbidden/)
    await expect(pub.offer(s.c, id, s.Cato, 1, [], 0)).rejects.toThrow(/Forbidden/)
    await expect(pub.offer(s.c, id, s.Arin, 1, [], 0)).rejects.toThrow(/Forbidden/)
    await expect(pub.confirm(s.c, id, s.Cato, 1)).rejects.toThrow(/Forbidden/)
    await expect(pub.cancel(s.c, id, s.Cato)).rejects.toThrow(/Forbidden/)
    await expect(pub.cancel(s.c, id, s.Bea)).rejects.toThrow(/Forbidden/)
    // The partner cannot edit the initiator's side.
    await asUser(peer)
    await expect(pub.offer(s.c, id, s.Arin, 1, [], 0)).rejects.toThrow(/Forbidden/)
    await asUser(outsider)
    await expect(pub.respond(s.c, id, true)).rejects.toThrow(/Forbidden/)
    await expect(pub.confirm(other, id, foreign, 1)).rejects.toThrow(/Forbidden/)
    await expect(pub.cancel(other, id, foreign)).rejects.toThrow(/Forbidden/)
    await asUser(outsider)
    expect((await db.query('select * from public.trades')).rows).toHaveLength(0)
    // The campaign DM reads the trade; it acts only as a previewed assigned character.
    await asUser(dm)
    expect((await db.query('select * from public.trades where id=$1', [id])).rows).toHaveLength(1)
    expect((await pub.state(s.c, player)).trade).toMatchObject({ id, initiated_by_you: true })
    expect((await pub.state(s.c)).character).toBeNull()
    await expect(pub.invite(s.c, s.Npc, s.Cato)).rejects.toThrow(/Character unavailable/)
    // Direct writes are closed for every signed-in role.
    for (const actor of [player, dm]) {
      await asUser(actor)
      await expect(db.query("update public.trades set status='completed'")).rejects.toThrow(
        /permission denied/,
      )
      await expect(db.query('delete from public.trade_offer_items')).rejects.toThrow(
        /permission denied/,
      )
    }
    // Inactive members lose access.
    await asUser(dm)
    await db.query('select public.change_campaign_member($1,$2,null)', [s.c, third])
    await asUser(third)
    await expect(pub.state(s.c)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role; set role anon')
    await expect(pub.state(s.c)).rejects.toThrow(/permission denied/)
    await expect(pub.invite(s.c, s.Arin, s.Bea)).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.trades')).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
  })

  it('refuses to accept an empty trade until either side offers something', async () => {
    for (const schema of ['public', 'pre']) {
      const s = await setup(schema)
      const a = api(schema)
      const id = await openTrade(s, schema)
      await asUser(player)
      await expect(a.confirm(s.c, id, s.Arin, 1)).rejects.toThrow(/Empty trade/)
      // Clearing a gold offer back to zero is empty again.
      await a.offer(s.c, id, s.Arin, 1, [], 1)
      await a.offer(s.c, id, s.Arin, 2, [], 0)
      await asUser(peer)
      await expect(a.confirm(s.c, id, s.Bea, 3)).rejects.toThrow(/Empty trade/)
      // One gold piece on one side is a deal both can accept.
      await a.offer(s.c, id, s.Bea, 3, [], 1)
      expect(await a.confirm(s.c, id, s.Bea, 4)).toMatchObject({ status: 'open' })
      await asUser(player)
      expect(await a.confirm(s.c, id, s.Arin, 4)).toMatchObject({ status: 'completed' })
    }
  })

  it('mirrors tables, policies and RPCs into a PRE copied before the migration', async () => {
    await db.exec('reset role')
    expect((await db.query("select to_regclass('pre.trades') t")).rows[0]).toEqual({
      t: 'pre.trades',
    })
    const s = await setup('pre')
    const pre = api('pre')
    const id = await openTrade(s, 'pre')
    await asUser(player)
    await pre.offer(s.c, id, s.Arin, 1, [{ item_id: s.potions, quantity: 1 }], 10)
    await asUser(peer)
    await pre.confirm(s.c, id, s.Bea, 2)
    await asUser(player)
    expect(await pre.confirm(s.c, id, s.Arin, 2)).toMatchObject({ status: 'completed' })
    expect(await gold(s.Bea, 'pre')).toBe(50)
    // PRE helpers authorize only against PRE membership.
    await expect(pub.state(s.c)).rejects.toThrow(/Forbidden/)
    await asUser(third)
    expect((await db.query('select * from pre.trades')).rows).toHaveLength(0)
    await db.exec('reset role; set role anon')
    await expect(pre.state(s.c)).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
    const sources = (
      await db.query<{ src: string }>(
        "select prosrc src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('pre','pre_private') and p.proname like '%trade%'",
      )
    ).rows
    expect(sources.length).toBeGreaterThanOrEqual(12)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
