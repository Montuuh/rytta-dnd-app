// Optional real PostgreSQL validation. Requires a disposable localhost PostgreSQL
// server and `pg` (RYTTA_PG_MODULE can point to an isolated installed package).
// Creates a fresh test database; never connects to a hosted Supabase project.
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { Client } = require(process.env.RYTTA_PG_MODULE || 'pg')
const config = {
  host: '127.0.0.1',
  port: Number(process.env.RYTTA_PG_PORT || 55439),
  user: 'postgres',
  database: 'postgres',
}
const admin = new Client(config)
await admin.connect()
const database = `ryt003_${Date.now()}`
await admin.query(`create database ${database}`)
await admin.end()
config.database = database
const db = new Client(config)
await db.connect()
// Roles are cluster-scoped; tolerate an earlier isolated test database.
for (const role of ['anon', 'authenticated'])
  await db.query(
    `do $$ begin create role ${role}; exception when duplicate_object then null; end $$;`,
  )
await db.query(`create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
for (const file of readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  await db.query(readFileSync(`supabase/migrations/${file}`, 'utf8'))
const dm = randomUUID(),
  player = randomUUID()
await db.query(
  'insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now()),($3,$4,now())',
  [dm, 'dm@example.com', player, 'player@example.com'],
)
async function as(client, id) {
  await client.query('set role authenticated')
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
}
await as(db, dm)
const c = (await db.query("select public.create_campaign('Concurrent table') id")).rows[0].id
const ch = (await db.query("select public.create_character($1,'Arin') id", [c])).rows[0].id
const invite = (
  await db.query('select public.invite_character_player($1,$2,$3) id', [
    c,
    ch,
    'player@example.com',
  ])
).rows[0].id
const left = new Client(config),
  right = new Client(config)
await Promise.all([left.connect(), right.connect()])
await Promise.all([as(left, player), as(right, player)])
try {
  // Hold the first transaction open: second request must wait for the campaign lock.
  await left.query('begin')
  await left.query('select public.respond_campaign_invitation($1,true)', [invite])
  let completed = false
  const duplicate = right
    .query('select public.respond_campaign_invitation($1,true)', [invite])
    .then(
      () => ({ ok: true }),
      (e) => ({ error: e.message }),
    )
    .finally(() => {
      completed = true
    })
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(completed, false)
  await left.query('commit')
  assert.match((await duplicate).error, /Invitation unavailable/)
  assert.equal(
    (
      await db.query('select count(*) from public.characters where campaign_id=$1 and user_id=$2', [
        c,
        player,
      ])
    ).rows[0].count,
    '1',
  )
  console.log(
    'PASS concurrent invitation acceptance: second connection blocks, then rejects replay; one assignment.',
  )
  await Promise.all([as(left, dm), as(right, dm)])
  const sql = 'select public.set_character_resources($1,$2,0,$3,3,4,12,$4)'
  await left.query('begin')
  await left.query(sql, [c, ch, 50, randomUUID()])
  completed = false
  const stale = right
    .query(sql, [c, ch, 99, randomUUID()])
    .then(
      () => ({ ok: true }),
      (e) => ({ error: e.message }),
    )
    .finally(() => {
      completed = true
    })
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(completed, false)
  await left.query('commit')
  assert.match((await stale).error, /Stale revision/)
  assert.equal(
    (await db.query('select gold from public.character_resources where character_id=$1', [ch]))
      .rows[0].gold,
    '50',
  )
  assert.equal(
    (
      await db.query(
        "select count(*) from public.character_events where character_id=$1 and kind='character_resources:UPDATE'",
        [ch],
      )
    ).rows[0].count,
    '1',
  )
  console.log(
    'PASS concurrent resource edits: second connection blocks, stale revision rejected; one audited update.',
  )
  if (process.argv.includes('--browser')) {
    const { verifyCharacterBrowsers } = await import('./character-browser-probe.mjs')
    await verifyCharacterBrowsers({ Client, config, db, dm })
  }
  console.log(
    `Local test database: ${database}. Auth uses a SQL shim; hosted Auth/PostgREST are not tested.`,
  )
} finally {
  await Promise.all([db.end(), left.end(), right.end()])
}
