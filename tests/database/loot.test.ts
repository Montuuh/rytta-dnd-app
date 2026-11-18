import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

const migration = '20261205120000_distribute_loot.sql'
const db = new PGlite()
const schemas = ['public', 'pre'] as const
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const asSystem = async () => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const scalar = async <T = string>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
const emails = new Map<string, string>()
async function user(label: string) {
  const id = randomUUID()
  emails.set(id, `${label}-${id.slice(0, 8)}@example.com`)
  await asSystem()
  await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
    id,
    emails.get(id),
  ])
  return id
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
    create publication supabase_realtime;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, delete on storage.objects to authenticated;`)
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files.filter((f) => f < migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  // A PRE copied before this file receives the remapped DDL.
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 120000)
afterAll(() => db.close())

describe.each(schemas)('%s loot distribution', (schema) => {
  it('confirms one receipt, retries without adding units, and rolls back any invalid line or template', async () => {
    const dm = await user('dm'),
      player = await user('player'),
      outsider = await user('outsider'),
      otherDm = await user('other-dm')
    await asUser(otherDm)
    const other = await scalar(`select ${schema}.create_campaign('Other') result`)
    const foreign = await scalar(`select ${schema}.create_character($1,'Foreign') result`, [other])
    const foreignItem = await scalar<{id:string}>(`select ${schema}.save_item_definition($1,null,null,$2,$3) result`, [other,JSON.stringify({name:'Other item',category:'gear'}),randomUUID()])
    await asUser(dm)
    const campaign = await scalar(`select ${schema}.create_campaign('Vault') result`)
    const invite = await scalar(`select ${schema}.invite_campaign_member($1,$2) result`, [
      campaign,
      emails.get(player),
    ])
    await asUser(player)
    await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invite])
    await scalar(`select ${schema}.create_own_character($1,'Active',$2) result`,[campaign,randomUUID()])
    const reserve = await scalar(`select ${schema}.create_own_character($1,'Reserve',$2) result`,[campaign,randomUUID()])
    await asUser(dm)
    const characters = []
    for (const name of ['Arin', 'Bea', 'Finn'])
      characters.push(
        await scalar(`select ${schema}.create_character($1,$2) result`, [campaign, name]),
      )
    const definitions: { id: string; revision: number }[] = []
    for (const name of ['Potion', 'Sword'])
      definitions.push(
        await scalar<{ id: string; revision: number }>(
          `select ${schema}.save_item_definition($1,null,null,$2,$3) result`,
          [campaign, JSON.stringify({ name, category: 'gear' }), randomUUID()],
        ),
      )
    const archivedChar = await scalar(`select ${schema}.create_character($1,'Archived') result`,[campaign])
    await db.query(`select ${schema}.archive_character($1,$2)`,[campaign,archivedChar])
    const archivedItem = await scalar<{id:string}>(`select ${schema}.save_item_definition($1,null,null,$2,$3) result`, [campaign,JSON.stringify({name:'Retired',category:'gear'}),randomUUID()])
    await asSystem()
    await db.query(`update ${schema}.item_definitions set archived=true where id=$1`,[archivedItem.id])
    await asUser(dm)
    const lines = characters.map((character_id, index) => ({
      character_id,
      definition_id: definitions[index === 2 ? 1 : 0]!.id,
      revision: 0,
      quantity: 1,
    }))
    const call = (allocations: unknown, name: string | null = null, key = randomUUID()) =>
      scalar<{ allocations: unknown[]; batch_id: string | null }>(
        `select ${schema}.distribute_loot($1,$2,$3,$4) result`,
        [campaign, JSON.stringify(allocations), name, key],
      )
    const batches = () =>
      scalar<unknown[]>(`select ${schema}.list_loot_batches($1,null) result`, [campaign])
    const remove = (id:string|null,key=randomUUID()) => scalar(`select ${schema}.delete_loot_batch($1,$2,$3) result`,[campaign,id,key])
    const units = () =>
      scalar<number>(
        `select coalesce(sum(quantity),0)::integer result from ${schema}.inventory_items where campaign_id=$1`,
        [campaign],
      )
    const key = randomUUID()
    await asAnon()
    await expect(call(lines)).rejects.toThrow(/permission denied/)
    await expect(batches()).rejects.toThrow(/permission denied/)
    await expect(remove(randomUUID())).rejects.toThrow(/permission denied/)
    for (const actor of [outsider, player, otherDm]) {
      await asUser(actor)
      await expect(call(lines)).rejects.toThrow('Forbidden')
      await expect(batches()).rejects.toThrow('Forbidden')
      await expect(remove(randomUUID())).rejects.toThrow('Forbidden')
    }
    await asUser(dm)
    const sent = await call(lines, 'Starter pack', key)
    const snapshot = lines.map(({ character_id, definition_id, quantity }) => ({
      character_id,
      definition_id,
      quantity,
    }))
    expect(sent).toEqual({ allocations: snapshot.map(a=>({...a,event_id:expect.any(String)})), batch_id: expect.any(String) })
    expect(await call(lines, 'Starter pack', key)).toEqual(sent)
    expect(await units()).toBe(3)
    expect(await batches()).toEqual([
      { id: sent.batch_id, name: 'Starter pack', allocations: snapshot },
    ])
    await expect(call(lines, null, key)).rejects.toThrow('Request mismatch')
    for (const [patch, message] of [
      [{ character_id: foreign }, 'Character unavailable'],
      [{ character_id: reserve }, 'Character unavailable'],
      [{ character_id: archivedChar }, 'Character unavailable'],
      [{ definition_id: archivedItem.id }, 'Item unavailable'],
      [{ definition_id: foreignItem.id }, 'Item unavailable'],
      [{ definition_id: randomUUID() }, 'Item unavailable'],
      [{ revision: 1 }, 'Stale revision'],
      [{ quantity: 0 }, 'Invalid quantity'],
    ] as const) {
      await expect(call([lines[0], { ...lines[1], ...patch }], 'Rejected')).rejects.toThrow(message)
    }
    for (const input of [null,{},[],Array(101).fill(lines[0]),[{...lines[0],quantity:'1'}],[{...lines[0],extra:true}],[{...lines[0],extra:'x'.repeat(33000)}]]) {
      await expect(call(input)).rejects.toThrow(/Invalid allocation/)
    }
    await expect(scalar(`select ${schema}.list_loot_batches($1,$2) result`,[campaign,'x'.repeat(81)])).rejects.toThrow('Invalid cursor')
    await expect(call([lines[0], lines[0]])).rejects.toThrow('Duplicate allocation')
    await expect(call(lines, 'Starter pack')).rejects.toThrow('Batch name in use')
    expect(await units()).toBe(3)
    expect(await batches()).toHaveLength(1)
    expect((await call(lines)).batch_id).toBeNull()
    expect(await units()).toBe(6)
    expect(await batches()).toHaveLength(1)
    await asUser(player)
    await expect(call(lines, 'Starter pack', key)).rejects.toThrow('Forbidden')
    const privateSchema = schema === 'pre' ? 'pre_private' : 'private'
    await asSystem()
    await db.exec(`update ${privateSchema}.quota_limits set max_count=1 where quota='loot_batches_per_campaign'`)
    await asUser(dm)
    await expect(call(lines,'Full')).rejects.toThrow('Batch limit reached')
    expect(await units()).toBe(6)
    const deleteKey = randomUUID()
    expect(await remove(sent.batch_id,deleteKey)).toEqual({id:sent.batch_id})
    expect(await remove(sent.batch_id,deleteKey)).toEqual({id:sent.batch_id})
    expect(await batches()).toHaveLength(0)
    expect(await units()).toBe(6)
    expect((await call(lines,'Fresh')).batch_id).toEqual(expect.any(String))
    for (const actor of [dm, player]) {
      await asUser(actor)
      await expect(db.exec(`select * from ${privateSchema}.loot_batches`)).rejects.toThrow(
        /permission denied/,
      )
      await expect(db.exec(`delete from ${privateSchema}.loot_batches`)).rejects.toThrow(
        /permission denied/,
      )
    }
  })
})
