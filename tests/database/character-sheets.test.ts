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
const scalar = async (sql: string, args: unknown[] = []) =>
  (await db.query<{ result: string }>(sql, args)).rows[0]!.result
const build = {
  classKey: 'bard',
  abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 13, cha: 15 },
}
const save = (
  c: string,
  ch: string,
  rev = 0,
  opts: { level?: number; maxHp?: number; complete?: boolean; key?: string; data?: unknown } = {},
) =>
  db.query('select public.save_character_sheet($1,$2,$3,$4,$5,14,$6,$7,$8) result', [
    c,
    ch,
    rev,
    opts.level ?? 3,
    opts.maxHp ?? 24,
    JSON.stringify(opts.data ?? build),
    opts.complete ?? false,
    opts.key ?? randomUUID(),
  ])
const vitals = (
  c: string,
  ch: string,
  rev = 0,
  opts: { hp?: number; conditions?: string[]; slots?: number[]; key?: string } = {},
) =>
  db.query('select public.set_character_vitals($1,$2,$3,$4,2,1,0,0,true,$5,$6,$7,$8) result', [
    c,
    ch,
    rev,
    opts.hp ?? 10,
    opts.conditions ?? ['poisoned'],
    opts.slots ?? [1, 0, 0, 0, 0, 0, 0, 0, 0],
    JSON.stringify({ inspiration: 1 }),
    opts.key ?? randomUUID(),
  ])
async function setup() {
  await asUser(dm)
  const c = await scalar("select public.create_campaign('Sheet table') result")
  const ch = await scalar("select public.create_character($1, 'Arin') result", [c])
  const peerCh = await scalar("select public.create_character($1, 'Bea') result", [c])
  for (const [user, email, character] of [
    [player, 'player@example.com', ch],
    [peer, 'peer@example.com', peerCh],
  ] as const) {
    await asUser(dm)
    const id = await scalar('select public.invite_character_player($1,$2,$3) result', [
      c,
      character,
      email,
    ])
    await asUser(user)
    await db.query('select public.respond_campaign_invitation($1,true)', [id])
  }
  return { c, ch, peerCh }
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

describe('RYT-024 character sheets', () => {
  it('creates a draft sheet and play state for every character', async () => {
    const { c, ch } = await setup()
    await asUser(player)
    expect(
      (
        await db.query(
          'select status, level, revision from public.character_sheets where character_id=$1',
          [ch],
        )
      ).rows,
    ).toEqual([{ status: 'draft', level: 1, revision: 0 }])
    expect(
      (await db.query('select current_hp from public.character_vitals where campaign_id=$1', [c]))
        .rows,
    ).toHaveLength(1)
  })

  it('lets the assigned Player complete the wizard and play, with full HP on completion', async () => {
    const { c, ch } = await setup()
    await asUser(player)
    await save(c, ch, 0)
    expect(
      await scalar('select status result from public.character_sheets where character_id=$1', [ch]),
    ).toBe('draft')
    await save(c, ch, 1, { complete: true })
    expect(
      (await db.query('select current_hp from public.character_vitals where character_id=$1', [ch]))
        .rows,
    ).toEqual([{ current_hp: 24 }])
    await vitals(c, ch, 1)
    await asUser(dm)
    await save(c, ch, 2, { maxHp: 8, level: 1 })
    expect(
      (
        await db.query(
          'select s.status, v.current_hp, v.hit_dice_spent, v.conditions from public.character_sheets s join public.character_vitals v using (character_id) where character_id=$1',
          [ch],
        )
      ).rows,
    ).toEqual([{ status: 'complete', current_hp: 8, hit_dice_spent: 1, conditions: ['poisoned'] }])
    const kinds = (
      await db.query<{ kind: string }>(
        'select kind from public.character_events where character_id=$1 order by created_at',
        [ch],
      )
    ).rows.map((row) => row.kind)
    expect(kinds).toContain('character_sheets:UPDATE')
    expect(kinds).toContain('character_vitals:UPDATE')
  })

  it('denies anon, outsider, peer Player, cross-campaign DM, inactive Player and direct writes', async () => {
    const { c, ch, peerCh } = await setup()
    await asUser(outsider)
    const other = await scalar("select public.create_campaign('Other table') result")
    await scalar("select public.create_character($1, 'Foreign') result", [other])
    for (const actor of [outsider, peer]) {
      await asUser(actor)
      await expect(save(c, ch)).rejects.toThrow(/Forbidden/)
      await expect(vitals(c, ch)).rejects.toThrow(/Forbidden/)
      for (const table of ['character_sheets', 'character_vitals'])
        expect(
          (await db.query(`select * from public.${table} where character_id=$1`, [ch])).rows,
        ).toHaveLength(0)
    }
    await asUser(player)
    await expect(save(c, peerCh)).rejects.toThrow(/Forbidden/)
    await expect(
      db.query('select public.set_character_resources($1,$2,0,99,0,0,0,$3)', [c, ch, randomUUID()]),
    ).rejects.toThrow(/Forbidden/)
    for (const table of ['character_sheets', 'character_vitals']) {
      await expect(db.query(`update public.${table} set revision = 9`)).rejects.toThrow(
        /permission denied/,
      )
      await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/)
      await expect(
        db.query(`insert into public.${table}(campaign_id, character_id) values ($1,$2)`, [c, ch]),
      ).rejects.toThrow(/permission denied/)
    }
    await asUser(dm)
    await expect(db.query('update public.character_sheets set level = 5')).rejects.toThrow(
      /permission denied/,
    )
    await db.query('select public.change_campaign_member($1,$2,null)', [c, player])
    await asUser(player)
    await expect(save(c, ch)).rejects.toThrow(/Forbidden/)
    expect(
      (await db.query('select * from public.character_sheets where character_id=$1', [ch])).rows,
    ).toHaveLength(0)
    await db.exec('reset role; set role anon')
    await expect(save(c, ch)).rejects.toThrow(/permission denied/)
    await expect(vitals(c, ch)).rejects.toThrow(/permission denied/)
    for (const table of ['character_sheets', 'character_vitals'])
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/)
  })

  it('rejects stale revisions, mismatched replays and invalid values; replays idempotently', async () => {
    const { c, ch } = await setup()
    await asUser(player)
    const key = randomUUID()
    expect((await save(c, ch, 0, { key })).rows).toEqual([{ result: 1 }])
    expect((await save(c, ch, 0, { key })).rows).toEqual([{ result: 1 }])
    await expect(save(c, ch, 0, { key, level: 4 })).rejects.toThrow(/Request mismatch/)
    await expect(save(c, ch, 0)).rejects.toThrow(/Stale revision/)
    await expect(save(c, ch, 1, { level: 21 })).rejects.toThrow(/check constraint/)
    await expect(save(c, ch, 1, { data: [1, 2] })).rejects.toThrow(/check constraint/)
    await expect(
      save(c, ch, 1, { data: { notes: 'x'.repeat(70000) + crypto.randomUUID().repeat(500) } }),
    ).rejects.toThrow(/check constraint/)
    const vkey = randomUUID()
    expect((await vitals(c, ch, 0, { key: vkey })).rows).toEqual([{ result: 1 }])
    expect((await vitals(c, ch, 0, { key: vkey })).rows).toEqual([{ result: 1 }])
    await expect(vitals(c, ch, 0)).rejects.toThrow(/Stale revision/)
    await expect(vitals(c, ch, 1, { hp: 25 })).rejects.toThrow(/Invalid vitals/)
    await expect(vitals(c, ch, 1, { conditions: ['exhaustion'] })).rejects.toThrow(
      /check constraint/,
    )
    await expect(vitals(c, ch, 1, { slots: [1, 2] })).rejects.toThrow(/check constraint/)
    await expect(vitals(c, ch, 1, { slots: [-1, 0, 0, 0, 0, 0, 0, 0, 0] })).rejects.toThrow(
      /check constraint/,
    )
  })
})
