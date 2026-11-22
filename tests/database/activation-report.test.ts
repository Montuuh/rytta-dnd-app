import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-147: the activation and return report counts known campaigns as the definitions say, leaves
// out excluded accounts and returns counts only.
const report = readFileSync('scripts/reports/activation-return.sql', 'utf8')
const db = new PGlite()

async function user(meta: { test?: boolean; internal?: boolean } = {}) {
  const id = randomUUID()
  await db.query(
    'insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values ($1, $2, now(), $3, $4)',
    [
      id,
      `${id.slice(0, 8)}@example.com`,
      meta.internal ? { rytta_internal: true } : {},
      meta.test ? { rytta_test_account: true } : {},
    ],
  )
  return id
}

/** One campaign with its DM, an optional second member and dated activity. */
async function campaign(options: {
  created: string
  dm?: string
  second?: string
  started?: string[]
  dmActivity?: string[]
}) {
  const id = randomUUID()
  const dm = options.dm ?? (await user())
  await db.query(
    'insert into public.campaigns(id, owner_id, name, created_at) values ($1, $2, $3, $4)',
    [id, dm, `Campaign ${id.slice(0, 4)}`, options.created],
  )
  await db.query(
    "insert into public.campaign_members(campaign_id, user_id, role, joined_at) values ($1, $2, 'dm', $3)",
    [id, dm, options.created],
  )
  if (options.second)
    await db.query(
      "insert into public.campaign_members(campaign_id, user_id, role, joined_at) values ($1, $2, 'player', $3)",
      [id, await user(), options.second],
    )
  for (const at of options.started ?? [])
    await db.query(
      "insert into public.encounters(campaign_id, name, status, created_by, created_at, started_at) values ($1, 'Fight', 'active', $2, $3, $3)",
      [id, dm, at],
    )
  for (const at of options.dmActivity ?? [])
    await db.query(
      "insert into public.campaign_events(campaign_id, actor_id, kind, before_value, after_value, created_at) values ($1, $2, 'party_level', '{}', '{}', $3)",
      [id, dm, at],
    )
}

type Row = Record<string, string | number | null>
async function run(at: string) {
  await db.query("select set_config('rytta.report_now', $1, false)", [at])
  const results = await db.exec(report)
  return results.at(-1)!.rows as Row[]
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
      raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}');
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
  for (const file of files) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))

  // A: a second member, then a fight within 14 days, then the DM back on another day: activated
  // and returned.
  await campaign({
    created: '2026-11-20T10:00:00Z',
    second: '2026-11-21T10:00:00Z',
    started: ['2026-11-22T20:00:00Z'],
    dmActivity: ['2026-11-22T21:00:00Z', '2026-11-30T19:00:00Z'],
  })
  // B: a fight with nobody else yet: solo preparation, not activated.
  await campaign({ created: '2026-11-20T11:00:00Z', started: ['2026-11-22T20:00:00Z'] })
  // C: the first fight comes after the 14 days: not activated.
  await campaign({
    created: '2026-11-21T10:00:00Z',
    second: '2026-11-22T10:00:00Z',
    started: ['2026-12-10T20:00:00Z'],
  })
  // D: activated, but the DM only came back the same day and after 28 days: not returned.
  await campaign({
    created: '2026-11-21T12:00:00Z',
    second: '2026-11-22T10:00:00Z',
    started: ['2026-11-23T18:00:00Z'],
    dmActivity: ['2026-11-23T22:00:00Z', '2026-12-30T18:00:00Z'],
  })
  // E and F: run by a test account and by an internal account: left out.
  for (const meta of [{ test: true }, { internal: true }])
    await campaign({
      created: '2026-11-20T10:00:00Z',
      dm: await user(meta),
      second: '2026-11-21T10:00:00Z',
      started: ['2026-11-22T20:00:00Z'],
    })
  // G: before the launch: left out.
  await campaign({
    created: '2026-11-10T10:00:00Z',
    second: '2026-11-11T10:00:00Z',
    started: ['2026-11-12T20:00:00Z'],
  })
  // H: too recent for its 14 days to have passed: counted, not in the denominator.
  await campaign({ created: '2027-01-25T10:00:00Z' })
}, 120000)
afterAll(() => db.close())

describe('activation and return report', () => {
  it('counts known campaigns per weekly cohort with denominators', async () => {
    const rows = await run('2027-01-31T00:00:00Z')
    expect(rows.map((row) => row.cohort_week)).toEqual(['2026-11-16', '2027-01-25', 'total'])
    const total = rows.at(-1)!
    expect(total).toMatchObject({
      campaigns: 5,
      activation_denominator: 4,
      activated: 2,
      activated_settled: 2,
      solo_preparation: 1,
      return_denominator: 2,
      returned_settled: 1,
      returned_so_far: 1,
    })
    expect(Number(total.activation_pct)).toBe(50)
    expect(Number(total.return_pct)).toBe(50)
    const recent = rows[1]!
    expect(recent).toMatchObject({ campaigns: 1, activation_denominator: 0, activated: 0 })
    expect(recent.activation_pct).toBeNull()
  })

  it('leaves returns open until their 28 days have passed', async () => {
    const rows = await run('2026-12-10T00:00:00Z')
    const total = rows.at(-1)!
    expect(total).toMatchObject({
      campaigns: 4,
      activation_denominator: 4,
      activated: 2,
      return_denominator: 0,
      returned_so_far: 1,
    })
    expect(total.return_pct).toBeNull()
  })

  it('returns counts only: no id, name or address', async () => {
    const rows = await run('2027-01-31T00:00:00Z')
    expect(Object.keys(rows[0]!).sort()).toEqual(
      [
        'activated',
        'activated_settled',
        'activation_denominator',
        'activation_pct',
        'campaigns',
        'cohort_week',
        'return_denominator',
        'return_pct',
        'returned_settled',
        'returned_so_far',
        'solo_preparation',
      ].sort(),
    )
    expect(JSON.stringify(rows)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|@|Campaign /)
  })

  it('creates nothing and needs no grant', async () => {
    const before = await db.query(
      "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')",
    )
    await run('2027-01-31T00:00:00Z')
    const after = await db.query(
      "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')",
    )
    expect(after.rows).toEqual(before.rows)
    expect(report).not.toMatch(/\b(create|grant|insert|update|delete|alter|drop)\b/i)
  })
})
