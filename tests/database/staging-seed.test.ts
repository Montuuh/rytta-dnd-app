import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-116: the synthetic seed of the staging project. A fresh database with every migration and no
// PRE (like the staging project), an auth.users table with the hosted columns the seed writes and
// the hosted auth.uid() (claim.sub first, then the claims JSON).

// The app's own sheet schemas, loaded through Vitest's alias (the tests' tsconfig does not compile
// application sources), so the seeded sheets are checked against what the client parses.
type Schema = { safeParse: (value: unknown) => { success: boolean } }
const sheetModule = '@/features/characters/domain/sheet'
const { buildSchema, vitalsSchema } = (await import(/* @vite-ignore */ sheetModule)) as {
  buildSchema: Schema
  vitalsSchema: Schema
}
const seedPath = 'supabase/seed/staging_seed.sql'
const unseedPath = 'supabase/seed/staging_unseed.sql'
const seedSql = readFileSync(seedPath, 'utf8')
const unseedSql = readFileSync(unseedPath, 'utf8')
const db = new PGlite()
type Json = Record<string, unknown>
type Counts = Record<string, number>

const id = (n: string) => `00000000-5eed-4000-8000-${n}`
const users = {
  mara: id('000000000001'),
  teo: id('000000000002'),
  ilse: id('000000000003'),
  corin: id('000000000004'),
  nell: id('000000000005'),
}
const salt = id('0000000c0001')
const mere = id('0000000c0002')
const hiddenToken = '00000000-5eed-4000-8002-000000000006'

const asUser = async (who: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const asSystem = async () => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const rows = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows
const scalar = async <T = unknown>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result

/** Rows of every table in the schemas the seed can touch. */
async function counts(): Promise<Counts> {
  await asSystem()
  const tables = await rows<{ name: string }>(
    `select n.nspname || '.' || c.relname as name from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and n.nspname in ('public', 'private', 'auth', 'storage')
      order by 1`,
  )
  const result: Counts = {}
  for (const { name } of tables)
    result[name] = await scalar<number>(`select count(*)::int as result from ${name}`)
  return result
}
const run = async (sql: string) => {
  await asSystem()
  await db.exec(sql)
}

let empty: Counts
let seeded: Counts

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255),
      email varchar(255), encrypted_password varchar(255), email_confirmed_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb default '{}', created_at timestamptz,
      updated_at timestamptz, confirmation_token varchar(255), recovery_token varchar(255),
      email_change_token_new varchar(255), email_change varchar(255), banned_until timestamptz,
      is_sso_user boolean not null default false, is_anonymous boolean not null default false);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
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
  empty = await counts()
}, 120000)
afterAll(() => db.close())

describe('the staging seed', () => {
  it('applies on a fresh database and twice in a row with the same rows', async () => {
    await run(seedSql)
    seeded = await counts()
    await run(seedSql)
    expect(await counts()).toEqual(seeded)
    const changed = Object.fromEntries(
      Object.entries(seeded).filter(([table, n]) => n !== empty[table]),
    )
    // Every area of the app has rows.
    for (const table of [
      'auth.users',
      'public.profiles',
      'public.campaigns',
      'public.campaign_members',
      'public.campaign_invitations',
      'public.campaign_events',
      'public.campaign_rolls',
      'public.characters',
      'public.character_sheets',
      'public.character_vitals',
      'public.character_resources',
      'public.character_events',
      'public.item_definitions',
      'public.inventory_items',
      'public.inventory_events',
      'public.item_proposals',
      'public.shops',
      'public.shop_listings',
      'public.shop_orders',
      'public.trades',
      'public.glossary_entries',
      'public.combatant_templates',
      'public.encounters',
      'public.encounter_combatants',
      'public.encounter_events',
      'public.tabletop_scenes',
      'public.tabletop_items',
      'public.tabletop_live',
      'public.tabletop_cards',
      'public.rest_requests',
      'private.rest_votes',
    ])
      expect(changed[table], table).toBeGreaterThan(0)
    expect(changed['auth.users']).toBe(5)
    expect(changed['public.campaigns']).toBe(2)
    expect(changed['public.characters']).toBe(9)
    expect(changed['public.campaign_invitations']).toBe(9)
  }, 60000)

  it('creates the intended table', async () => {
    await asSystem()
    expect(
      await rows(
        'select id, dice_mode, roll_visibility, party_level, owner_id from public.campaigns order by name',
      ),
    ).toEqual([
      {
        id: mere,
        dice_mode: 'physical',
        roll_visibility: 'table',
        party_level: null,
        owner_id: users.teo,
      },
      {
        id: salt,
        dice_mode: 'app',
        roll_visibility: 'roller_dm',
        party_level: 3,
        owner_id: users.mara,
      },
    ])
    expect(
      await rows(
        `select c.name, m.user_id, m.role from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
          where m.active and m.role = 'dm' order by 1, 2`,
      ),
    ).toEqual([
      { name: 'Lanterns of Hollowmere', user_id: users.teo, role: 'dm' },
      { name: 'Lanterns of Hollowmere', user_id: users.ilse, role: 'dm' },
      { name: 'The Salt Road', user_id: users.mara, role: 'dm' },
    ])
    // Sheets: the four casting styles complete in The Salt Road, one draft, one absent, one archived.
    const sheets = await rows<{
      name: string
      campaign_id: string
      user_id: string | null
      status: string
      level: number
      build: unknown
      absent: boolean
      archived: boolean
      is_active: boolean
    }>(
      `select c.name, c.campaign_id, c.user_id, s.status, s.level, s.build, c.absent,
         c.archived_at is not null as archived, c.is_active
         from public.characters c join public.character_sheets s on s.character_id = c.id order by c.name`,
    )
    expect(sheets.map((s) => [s.name, s.status, s.level, s.absent, s.archived])).toEqual([
      ['Bram Ashcombe', 'complete', 3, false, false],
      ['Dagny Stoutreed', 'complete', 3, false, false],
      ['Hollis Reed', 'complete', 2, false, true],
      ['Juniper Fallow', 'complete', 2, true, false],
      ['Oriel Thistlewood', 'complete', 3, false, false],
      ['Pell Ambrose', 'draft', 1, false, false],
      ['Sefa Nightbloom', 'complete', 3, false, false],
      ['Wren Halloway', 'complete', 2, false, false],
      ['Ysolde Varr', 'complete', 3, false, false],
    ])
    expect(buildSchema.safeParse({}).success).toBe(false)
    for (const s of sheets) expect(buildSchema.safeParse(s.build).success, s.name).toBe(true)
    const kinds = Object.fromEntries(
      sheets.map((s) => [s.name, (s.build as { casterKind: string }).casterKind]),
    )
    expect(kinds).toMatchObject({
      'Oriel Thistlewood': 'full',
      'Bram Ashcombe': 'half',
      'Sefa Nightbloom': 'pact',
      'Dagny Stoutreed': 'none',
    })
    expect(
      (
        sheets.find((s) => s.name === 'Oriel Thistlewood')!.build as {
          spells: { prepared: boolean; level: number }[]
        }
      ).spells.filter((x) => x.prepared && x.level > 0).length,
    ).toBeGreaterThan(2)
    for (const v of await rows('select * from public.character_vitals'))
      expect(vitalsSchema.safeParse(v).success).toBe(true)
    expect(
      await rows(
        `select c.name, v.slots_used, v.concentration from public.character_vitals v
           join public.characters c on c.id = v.character_id where v.concentration is not null order by 1`,
      ),
    ).toEqual([
      { name: 'Bram Ashcombe', slots_used: [1, 0, 0, 0, 0, 0, 0, 0, 0], concentration: 'Bless' },
      { name: 'Sefa Nightbloom', slots_used: [0, 1, 0, 0, 0, 0, 0, 0, 0], concentration: 'Hex' },
    ])
    // The level-up audit entry and the closed and live encounters.
    expect(
      await rows(
        "select before_value, after_value from public.character_events where kind = 'level_up'",
      ),
    ).toEqual([
      {
        before_value: { level: 2, max_hp: 20 },
        after_value: { level: 3, max_hp: 28, party_level: 3 },
      },
    ])
    expect(await rows('select name, status from public.encounters order by name')).toEqual([
      { name: 'Ambush at Mile Nine', status: 'ended' },
      { name: 'The Drowned Bell Cellar', status: 'initiative' },
    ])
    expect(
      await scalar<number>(
        `select count(*)::int as result from public.encounter_events v join public.encounters e on e.id = v.encounter_id
          where e.status = 'ended'`,
      ),
    ).toBeGreaterThan(5)
    expect(
      await rows(
        `select k.name, k.public_name, k.hidden from public.encounter_combatants k
           join public.encounters e on e.id = k.encounter_id
          where e.status = 'initiative' and k.kind = 'npc' and (k.hidden or k.public_name is not null) order by 1`,
      ),
    ).toEqual([
      { name: 'Bandit Captain', public_name: 'Hooded Stranger', hidden: false },
      { name: 'Brine-Touched Ghoul', public_name: null, hidden: true },
    ])
    expect(
      await rows(
        'select visibility, count(*)::int as n from public.campaign_rolls group by 1 order by 1',
      ),
    ).toEqual([
      { visibility: 'roller', n: 1 },
      { visibility: 'roller_dm', n: 4 },
      { visibility: 'table', n: 6 },
    ])
    expect(
      await rows(
        "select campaign_id, kind, status from public.rest_requests where status = 'open'",
      ),
    ).toEqual([{ campaign_id: mere, kind: 'short', status: 'open' }])
    expect(
      await rows(
        "select email, campaign_id from public.campaign_invitations where status = 'pending'",
      ),
    ).toEqual([{ email: 'newcomer@example.test', campaign_id: mere }])
    // A calibrated table screen in The Salt Road, none in Hollowmere; no uploaded image anywhere.
    expect(
      await rows('select campaign_id, screen from public.tabletop_live order by campaign_id'),
    ).toEqual([
      {
        campaign_id: salt,
        screen: { diagonal_in: 55, px_w: 3840, px_h: 2160, base_mm: 25.4, fine: 1, flip: false },
      },
      { campaign_id: mere, screen: {} },
    ])
    expect(
      await scalar<number>(
        `select (select count(*) from public.tabletop_scenes where map_path is not null)
           + (select count(*) from public.character_sheets where portrait_path is not null)
           + (select count(*) from public.item_definitions where image_path is not null)
           + (select count(*) from public.shops where image_path is not null)
           + (select count(*) from storage.objects) as result`,
      ),
    ).toBe(0)
    expect(
      await rows(
        `select d.name, l.stock from public.shop_listings l join public.item_definitions d on d.id = l.definition_id
          join public.shops s on s.id = l.shop_id where s.name = 'The Brass Gull' and d.basic_key = 'torch'`,
      ),
    ).toEqual([{ name: 'Torch', stock: 18 }])
    expect(await rows('select status from public.trades')).toEqual([{ status: 'completed' }])
    // Only the reserved test domain and no password or identity.
    expect(
      await rows(
        "select email from auth.users where email not like '%@example.test' or encrypted_password is not null",
      ),
    ).toEqual([])
  })
})

describe('access with the seeded actors', () => {
  it("a Player reads their own sheet and not another Player's private data", async () => {
    await asSystem()
    const [oriel, sefa] = await rows<{ id: string }>(
      "select id from public.characters where name in ('Oriel Thistlewood', 'Sefa Nightbloom') order by name",
    ).then((r) => r.map((x) => x.id))
    await asUser(users.teo)
    expect(
      await rows('select character_id from public.character_sheets where character_id = $1', [
        oriel,
      ]),
    ).toHaveLength(1)
    expect(
      await rows('select gold from public.character_resources where character_id = $1', [oriel]),
    ).toEqual([{ gold: '47.50' }]) // 42.50 plus the 5 gp of the trade
    // Sefa's purse, inventory and roll made under roller_dm stay hers and the DM's.
    expect(
      await rows('select gold from public.character_resources where character_id = $1', [sefa]),
    ).toEqual([])
    expect(
      await rows('select id from public.inventory_items where character_id = $1', [sefa]),
    ).toEqual([])
    expect(await rows("select id from public.campaign_rolls where label = 'Deception'")).toEqual([])
    await asUser(users.corin)
    expect(
      await rows('select gold from public.character_resources where character_id = $1', [sefa]),
    ).toHaveLength(1)
    await asUser(users.mara)
    expect(
      await rows('select gold from public.character_resources where character_id = $1', [sefa]),
    ).toHaveLength(1)
    // A DM of the other campaign who also plays here sees nothing more than a Player.
    await asUser(users.ilse)
    expect(
      await rows('select gold from public.character_resources where character_id = $1', [sefa]),
    ).toEqual([])
    await asAnon()
    await expect(db.query('select 1 from public.character_sheets')).rejects.toThrow(
      /permission denied/,
    )
  })

  it('the hidden token and hidden combatant reach the DM only', async () => {
    await asSystem()
    const encounter = await scalar<string>(
      "select id as result from public.encounters where status = 'initiative'",
    )
    const scene = await scalar<string>(
      "select id as result from public.tabletop_scenes where name = 'Drowned Bell Cellar'",
    )
    for (const player of [users.teo, users.ilse, users.corin, users.nell]) {
      await asUser(player)
      expect(
        await rows('select id from public.tabletop_items where id = $1', [hiddenToken]),
      ).toEqual([])
      expect(await rows('select id from public.encounter_combatants')).toEqual([])
      const state = JSON.stringify(
        await scalar('select public.get_combat_state($1, $2, false) as result', [salt, encounter]),
      )
      expect(state).not.toContain('Brine-Touched Ghoul')
      expect(state).not.toContain('Bandit Captain')
      expect(state).toContain('Hooded Stranger')
      const table = JSON.stringify(
        await scalar('select public.get_tabletop($1, $2, true) as result', [salt, scene]),
      )
      expect(table).not.toContain(hiddenToken)
      expect(table).toContain('00000000-5eed-4000-8002-000000000001')
    }
    await asUser(users.mara)
    expect(
      await rows('select hidden from public.tabletop_items where id = $1', [hiddenToken]),
    ).toEqual([{ hidden: true }])
    const state = JSON.stringify(
      await scalar('select public.get_combat_state($1, $2, false) as result', [salt, encounter]),
    )
    expect(state).toContain('Brine-Touched Ghoul')
    expect(state).toContain('Bandit Captain')
    // The DM of the other campaign is an outsider there.
    await asUser(users.teo)
    await expect(
      db.query('select public.get_combat_state($1, $2, false)', [mere, encounter]),
    ).rejects.toThrow(/Forbidden|unavailable/i)
  })
})

describe('the guard and the unseed', () => {
  const foreign = '7d1c2a4e-9b8f-4c3d-a1e2-123456789abc'

  it('refuses a database with another account, for both scripts', async () => {
    await asSystem()
    await db.query(
      "insert into auth.users(id, email, email_confirmed_at) values ($1, 'someone@example.test', now())",
      [foreign],
    )
    const before = await counts()
    await expect(run(seedSql)).rejects.toThrow(/Refused: auth.users has accounts/)
    await expect(run(unseedSql)).rejects.toThrow(/Refused: auth.users has accounts/)
    expect(await counts()).toEqual(before)
    await asSystem()
    await db.query('delete from auth.users where id = $1', [foreign])
  })

  it('refuses a database with PRE, for both scripts', async () => {
    for (const schema of ['pre', 'pre_private']) {
      await asSystem()
      await db.exec(`create schema ${schema}`)
      await expect(run(seedSql)).rejects.toThrow(/Refused: schema pre exists/)
      await expect(run(unseedSql)).rejects.toThrow(/Refused: schema pre exists/)
      await asSystem()
      await db.exec(`drop schema ${schema}`)
    }
    expect(await counts()).toEqual(seeded)
  })

  it('refuses a campaign that is not part of the seed', async () => {
    await asSystem()
    const other = await scalar<string>(
      "insert into public.campaigns(owner_id, name) values (null, 'Elsewhere') returning id as result",
    )
    await expect(run(seedSql)).rejects.toThrow(/Refused: public.campaigns has campaigns/)
    await asSystem()
    await db.query('delete from public.campaigns where id = $1', [other])
  })

  it('removes exactly the seed rows, and seeds again afterwards', async () => {
    await run(unseedSql)
    expect(await counts()).toEqual(empty)
    // Running it on an empty database changes nothing.
    await run(unseedSql)
    expect(await counts()).toEqual(empty)
    await run(seedSql)
    expect(await counts()).toEqual(seeded)
    await run(unseedSql)
    expect(await counts()).toEqual(empty)
  }, 60000)
})

describe('the files', () => {
  it('are printable ASCII without backslashes, small, and share the guard and removal', () => {
    for (const path of [seedPath, unseedPath]) {
      const text = readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
      const outside = [...text]
        .map((ch, index) => ({ index, cp: ch.codePointAt(0)! }))
        .filter(({ cp }) => cp !== 0x0a && (cp < 0x20 || cp > 0x7e))
      expect(outside, path).toEqual([])
      expect(text.includes(String.fromCharCode(92)), path).toBe(false)
      expect(text, path).not.toMatch(/\bE'/)
      expect(statSync(path).size, path).toBeLessThan(200 * 1024)
    }
    const block = (text: string, from: string, to: string) => {
      const start = text.indexOf(from)
      const end = text.indexOf(to, start)
      expect(start).toBeGreaterThan(0)
      expect(end).toBeGreaterThan(start)
      return text.slice(start, end)
    }
    const seed = seedSql.replaceAll('\r\n', '\n')
    const unseed = unseedSql.replaceAll('\r\n', '\n')
    const guard = (t: string) => block(t, '-- Guard: staging only.', '-- Removal of the seed rows')
    const removal = (t: string) =>
      block(t, '-- Removal of the seed rows', "raise exception 'Seed removal incomplete'")
    expect(guard(unseed)).toEqual(guard(seed))
    expect(removal(unseed)).toEqual(removal(seed))
    // Only reserved addresses.
    const addresses = seed.match(/[a-z0-9._-]+@[a-z0-9.-]+/gi) ?? []
    expect(addresses.length).toBeGreaterThan(5)
    for (const address of addresses) expect(address).toMatch(/@example[.]test$/)
  })
})
