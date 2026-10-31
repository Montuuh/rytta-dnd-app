import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  outsider = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!
const result = async (sql: string, args: unknown[] = []) =>
  (await one<{ result: { item_id: string; event_id: string; revision: number; id: string } }>(sql, args))
    .result
const define = (c: string, item: Record<string, unknown>, key = randomUUID()) =>
  result('select public.save_item_definition($1, null, null, $2, $3) result', [
    c,
    JSON.stringify(item),
    key,
  ])
const grant = (c: string, ch: string, def: string, amount = 1, key = randomUUID()) =>
  result('select public.grant_item($1,$2,$3,$4,$5) result', [c, ch, def, amount, key])
const use = (c: string, item: string, rev: number, amount = 1, key = randomUUID()) =>
  result('select public.use_item($1,$2,$3,$4,$5) result', [c, item, rev, amount, key])
const equip = (c: string, item: string, rev: number, slot: string) =>
  result('select public.equip_item($1,$2,$3,$4,$5) result', [c, item, rev, slot, randomUUID()])
const undo = (c: string, event: string) =>
  result('select public.undo_inventory_event($1,$2,$3) result', [c, event, randomUUID()])
const quantity = async (item: string) =>
  (await one<{ quantity: number }>('select quantity from public.inventory_items where id=$1', [item]))
    .quantity
const potion = { name: 'Poción de curación', category: 'consumable', icon: 'flask-conical' }

async function setup() {
  await asUser(dm)
  const c = (await one<{ id: string }>("select public.create_campaign('Bag table') id")).id
  const ch = (await one<{ id: string }>("select public.create_character($1,'Arin') id", [c])).id
  const peerCh = (await one<{ id: string }>("select public.create_character($1,'Bea') id", [c])).id
  for (const [user, email, character] of [
    [player, 'player@example.com', ch],
    [peer, 'peer@example.com', peerCh],
  ] as const) {
    await asUser(dm)
    const id = (
      await one<{ id: string }>('select public.invite_character_player($1,$2,$3) id', [
        c,
        character,
        email,
      ])
    ).id
    await asUser(user)
    await db.query('select public.respond_campaign_invitation($1,true)', [id])
  }
  await asUser(dm)
  const def = (await define(c, { ...potion, value_gp: 50 })).id
  return { c, ch, peerCh, def }
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

describe('RYT-004 inventory', () => {
  it('lets the DM grant and the Player use, replay idempotently and undo within the window', async () => {
    const { c, ch, def } = await setup()
    const granted = await grant(c, ch, def, 3)
    await asUser(player)
    expect(
      (await db.query('select name, value_gp from public.item_definitions where id=$1', [def])).rows,
    ).toEqual([{ name: 'Poción de curación', value_gp: 50 }])
    const key = randomUUID()
    const used = await use(c, granted.item_id, granted.revision, 1, key)
    expect(await use(c, granted.item_id, granted.revision, 1, key)).toEqual(used)
    expect(await quantity(granted.item_id)).toBe(2)
    await expect(use(c, granted.item_id, granted.revision)).rejects.toThrow(/Stale revision/)
    await expect(use(c, granted.item_id, used.revision, 5)).rejects.toThrow(/Insufficient/)
    await undo(c, used.event_id)
    expect(await quantity(granted.item_id)).toBe(3)
    await expect(undo(c, used.event_id)).rejects.toThrow(/Not undoable/)
    // The Player cannot undo the DM's grant, and nothing older than ten minutes.
    await expect(undo(c, granted.event_id)).rejects.toThrow(/Forbidden/)
    const late = await use(c, granted.item_id, used.revision + 1)
    await db.exec('reset role')
    await db.query("update public.inventory_events set created_at = now() - interval '11 minutes' where id=$1", [
      late.event_id,
    ])
    await asUser(player)
    await expect(undo(c, late.event_id)).rejects.toThrow(/Forbidden/)
    await asUser(dm)
    await undo(c, late.event_id)
    expect(await quantity(granted.item_id)).toBe(3)
  })

  it('rejects undo after a later change touched the stack', async () => {
    const { c, ch, def } = await setup()
    const granted = await grant(c, ch, def, 3)
    await asUser(player)
    const first = await use(c, granted.item_id, granted.revision)
    await use(c, granted.item_id, first.revision)
    await expect(undo(c, first.event_id)).rejects.toThrow(/Undo conflict/)
  })

  it('keeps Players away from prices and DM stacks, but lets them add their own items', async () => {
    const { c, ch, def } = await setup()
    await grant(c, ch, def, 1)
    await asUser(player)
    await expect(define(c, { ...potion, value_gp: 5 })).rejects.toThrow(/Forbidden/)
    await expect(grant(c, ch, def, 10)).rejects.toThrow(/Forbidden/)
    const own = (await define(c, { name: 'Amuleto de la abuela', category: 'treasure', origin: 'dm' })).id
    expect(
      await one('select origin, value_gp from public.item_definitions where id=$1', [own]),
    ).toEqual({ origin: 'player', value_gp: null })
    const added = await grant(c, ch, own, 2)
    expect(
      await one('select source, quantity from public.inventory_items where id=$1', [added.item_id]),
    ).toEqual({ source: 'player', quantity: 2 })
    await expect(use(c, added.item_id, added.revision)).rejects.toThrow(/Not usable/)
    await expect(
      result('select public.save_item_definition($1,$2,0,$3,$4) result', [
        c,
        def,
        JSON.stringify(potion),
        randomUUID(),
      ]),
    ).rejects.toThrow(/Forbidden/)
  })

  it('denies anon, outsider, peer Player, cross-campaign DM, inactive Player and direct writes', async () => {
    const { c, ch, def } = await setup()
    const granted = await grant(c, ch, def, 2)
    await asUser(outsider)
    const other = (await one<{ id: string }>("select public.create_campaign('Other') id")).id
    const otherDef = (await define(other, potion)).id
    for (const actor of [outsider, peer]) {
      await asUser(actor)
      await expect(grant(c, ch, def)).rejects.toThrow(/Forbidden/)
      await expect(use(c, granted.item_id, granted.revision)).rejects.toThrow(/Forbidden/)
      await expect(equip(c, granted.item_id, granted.revision, 'main_hand')).rejects.toThrow(
        /Forbidden/,
      )
      await expect(undo(c, granted.event_id)).rejects.toThrow(/Forbidden/)
      await expect(
        db.query('select public.set_character_portrait($1,$2,null)', [c, ch]),
      ).rejects.toThrow(/Forbidden/)
      for (const table of ['inventory_items', 'inventory_events'])
        expect(
          (await db.query(`select * from public.${table} where character_id=$1`, [ch])).rows,
        ).toHaveLength(0)
      expect(
        (await db.query('select * from public.item_definitions where id=$1', [def])).rows,
      ).toHaveLength(0)
    }
    await asUser(dm)
    await expect(grant(c, ch, otherDef)).rejects.toThrow(/unavailable/)
    for (const table of ['item_definitions', 'inventory_items', 'inventory_events']) {
      await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/)
      await expect(db.query(`update public.${table} set campaign_id = campaign_id`)).rejects.toThrow(
        /permission denied/,
      )
    }
    await db.query('select public.change_campaign_member($1,$2,null)', [c, player])
    await asUser(player)
    await expect(use(c, granted.item_id, granted.revision)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role; set role anon')
    await expect(grant(c, ch, def)).rejects.toThrow(/permission denied/)
    for (const table of ['item_definitions', 'inventory_items', 'inventory_events'])
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/)
  })

  it('enforces slots, two-handed weapons and recomputes AC from equipment', async () => {
    const { c, ch, def } = await setup()
    await asUser(player)
    const sheet = await one<{ revision: number }>(
      'select revision from public.character_sheets where character_id=$1',
      [ch],
    )
    const build = {
      baseAbilities: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 },
      bonuses: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      acOverride: null,
    }
    await db.query('select public.save_character_sheet($1,$2,$3,1,10,13,$4,true,$5)', [
      c,
      ch,
      sheet.revision,
      JSON.stringify(build),
      randomUUID(),
    ])
    const ac = async () =>
      (await one<{ armor_class: number }>('select armor_class from public.character_sheets where character_id=$1', [ch]))
        .armor_class
    expect(await ac()).toBe(13)
    await asUser(dm)
    const armor = (
      await define(c, { name: 'Cota de escamas', category: 'armor', slot_kind: 'body', properties: { base: 14, dexCap: 2 } })
    ).id
    const shield = (await define(c, { name: 'Escudo', category: 'shield', slot_kind: 'shield', properties: { acBonus: 2 } })).id
    const greatsword = (await define(c, { name: 'Mandoble', category: 'weapon', slot_kind: 'two_hands' })).id
    const a = await grant(c, ch, armor)
    const s = await grant(c, ch, shield)
    const g = await grant(c, ch, greatsword)
    const potionStack = await grant(c, ch, def, 2)
    await asUser(player)
    await expect(equip(c, potionStack.item_id, potionStack.revision, 'main_hand')).rejects.toThrow(/Wrong slot/)
    await expect(equip(c, a.item_id, a.revision, 'head')).rejects.toThrow(/Wrong slot/)
    const worn = await equip(c, a.item_id, a.revision, 'body')
    expect(await ac()).toBe(16)
    const held = await equip(c, s.item_id, s.revision, 'off_hand')
    expect(await ac()).toBe(18)
    await expect(equip(c, g.item_id, g.revision, 'main_hand')).rejects.toThrow(/Slot occupied/)
    await result('select public.unequip_item($1,$2,$3,$4) result', [c, held.item_id, held.revision, randomUUID()])
    expect(await ac()).toBe(16)
    await equip(c, g.item_id, g.revision, 'main_hand')
    const s2 = await one<{ id: string; revision: number }>(
      "select id, revision from public.inventory_items where definition_id=$1 and quantity=1",
      [shield],
    )
    await expect(equip(c, s2.id, s2.revision, 'off_hand')).rejects.toThrow(/Slot occupied/)
    await result('select public.unequip_item($1,$2,$3,$4) result', [c, worn.item_id, worn.revision, randomUUID()])
    expect(await ac()).toBe(13)
  })

  it('splits stacks when equipping one unit and merges them back on unequip', async () => {
    const { c, ch } = await setup()
    const dagger = (await define(c, { name: 'Daga', category: 'weapon', slot_kind: 'one_hand' })).id
    const stack = await grant(c, ch, dagger, 2)
    await asUser(player)
    const held = await equip(c, stack.item_id, stack.revision, 'main_hand')
    expect(held.item_id).not.toBe(stack.item_id)
    expect(await quantity(stack.item_id)).toBe(1)
    const back = await result('select public.unequip_item($1,$2,$3,$4) result', [
      c,
      held.item_id,
      held.revision,
      randomUUID(),
    ])
    expect(back.item_id).toBe(stack.item_id)
    expect(await quantity(stack.item_id)).toBe(2)
    expect(await quantity(held.item_id)).toBe(0)
  })
})
