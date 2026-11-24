import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-006: the quest journal. The DM writes quests, reveals objectives one by one and keeps a
// private note; Players read published quests only while the quests module is on, never a draft,
// a hidden objective or the note, and get "new" marks from their own last-opened time.
const db = new PGlite()
type Json = Record<string, unknown>

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
const scalar = async <T = unknown>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result

const emails = new Map<string, string>()
async function user(label: string) {
  const id = randomUUID()
  emails.set(id, `${label}-${id.slice(0, 8)}@example.com`)
  await asSystem()
  await db.query(
    'insert into auth.users(id, email, email_confirmed_at, created_at) values ($1, $2, now(), now())',
    [id, emails.get(id)],
  )
  return id
}
async function campaign(dm: string, name: string) {
  await asUser(dm)
  return scalar<string>('select public.create_campaign($1) result', [name])
}
async function join(c: string, dm: string, who: string) {
  await asUser(dm)
  const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
    c,
    emails.get(who),
  ])
  await asUser(who)
  await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
}
async function refused(sql: string, args: unknown[] = []) {
  await expect(db.query(sql, args)).rejects.toThrow(/Forbidden|permission denied/)
}
async function setModules(c: string, dm: string, modules: string[]) {
  await asUser(dm)
  await db.query('select public.set_campaign_modules($1, $2)', [c, modules])
}

let dmA: string, playerA: string, dmB: string, outsider: string
let campaignA: string, campaignB: string

const objective = (body: string, visible: boolean, done = false, id: string = randomUUID()) => ({
  id,
  body,
  visible,
  done,
})
async function save(
  quest: string,
  revision: number | null,
  payload: Json,
  c: string = campaignA,
): Promise<Json> {
  return scalar<Json>('select public.save_quest($1, $2, $3, $4) result', [
    c,
    quest,
    revision,
    JSON.stringify({ objectives: [], ...payload, note: payload.note ?? '' }),
  ])
}
const list = async () =>
  scalar<{ dm: boolean; quests: Json[] }>('select public.list_quests($1) result', [campaignA])

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
      raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}',
      created_at timestamptz, last_sign_in_at timestamptz);
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

  dmA = await user('dma')
  playerA = await user('playera')
  dmB = await user('dmb')
  outsider = await user('outsider')
  campaignA = await campaign(dmA, 'Sunken Coast')
  campaignB = await campaign(dmB, 'Winter Keep')
  await join(campaignA, dmA, playerA)
  await setModules(campaignA, dmA, ['party', 'quests'])
}, 180000)
afterAll(() => db.close())

describe('quest journal (RYT-006)', () => {
  const lighthouse = randomUUID()
  const talk = randomUUID()
  const climb = randomUUID()
  const spell = randomUUID()

  it('keeps every quest table closed to clients and the signal readable only in scope', async () => {
    for (const table of [
      'public.quests',
      'public.quest_objectives',
      'private.quest_notes',
      'private.quest_reads',
    ]) {
      for (const who of [dmA, playerA]) {
        await asUser(who)
        await refused(`select * from ${table}`)
        await refused(`delete from ${table}`)
      }
      await asAnon()
      await refused(`select * from ${table}`)
    }
    await asUser(dmA)
    await refused('insert into public.quest_signals(campaign_id) values ($1)', [campaignA])
    await asAnon()
    await refused('select * from public.quest_signals')
  })

  it('refuses every quest RPC to anon, outsiders and the DM of another campaign', async () => {
    const calls: [string, unknown[]][] = [
      ['select public.list_quests($1)', [campaignA]],
      [
        'select public.save_quest($1, $2, null, $3)',
        [
          campaignA,
          randomUUID(),
          JSON.stringify({ title: 'X', status: 'active', published: true }),
        ],
      ],
      ['select public.delete_quest($1, $2, 1)', [campaignA, randomUUID()]],
      ['select public.mark_quest_seen($1, $2)', [campaignA, randomUUID()]],
    ]
    await asAnon()
    for (const [sql, args] of calls) await refused(sql, args)
    for (const who of [outsider, dmB]) {
      await asUser(who)
      for (const [sql, args] of calls) await refused(sql, args)
    }
  })

  it('lets only the DM write; a Player sees published quests without hidden parts', async () => {
    await asUser(playerA)
    await refused('select public.save_quest($1, $2, null, $3)', [
      campaignA,
      randomUUID(),
      JSON.stringify({ title: 'Mine', status: 'active', published: true }),
    ])
    await asUser(dmA)
    const saved = await save(lighthouse, null, {
      title: 'The dark lighthouse',
      summary: 'The keeper has not lit the lamp for three nights.',
      status: 'active',
      published: false,
      note: 'The keeper is under a cult spell.',
      objectives: [
        objective('Talk to the keeper', true, true, talk),
        objective('Climb to the lamp', true, false, climb),
        objective('Break the spell', false, false, spell),
      ],
    })
    expect(saved).toMatchObject({ revision: 1, published: false, changed_at: null })
    // A retried create with the same content is a replay.
    expect(
      await save(lighthouse, null, {
        title: 'The dark lighthouse',
        summary: 'The keeper has not lit the lamp for three nights.',
        status: 'active',
        published: false,
        note: 'The keeper is under a cult spell.',
        objectives: [
          objective('Talk to the keeper', true, true, talk),
          objective('Climb to the lamp', true, false, climb),
          objective('Break the spell', false, false, spell),
        ],
      }),
    ).toMatchObject({ revision: 1 })
    // A draft is invisible to the Player and leaves the signal untouched.
    await asUser(playerA)
    expect((await list()).quests).toEqual([])
    expect(
      await scalar<number>(
        'select count(*)::int result from public.quest_signals where campaign_id = $1',
        [campaignA],
      ),
    ).toBe(0)
    await refused('select public.save_quest($1, $2, 1, $3)', [
      campaignA,
      lighthouse,
      JSON.stringify({ title: 'Hijack', status: 'failed', published: true }),
    ])
    await refused('select public.delete_quest($1, $2, 1)', [campaignA, lighthouse])

    await asUser(dmA)
    await save(lighthouse, 1, { ...saved, published: true, note: saved.note })
    await asUser(playerA)
    const seen = await list()
    expect(seen.dm).toBe(false)
    expect(seen.quests).toHaveLength(1)
    const quest = seen.quests[0]!
    expect(quest).toMatchObject({ id: lighthouse, status: 'active', seen_at: null })
    expect(quest.changed_at).not.toBeNull()
    expect(quest.objectives).toEqual([
      expect.objectContaining({ id: talk, body: 'Talk to the keeper', done: true }),
      expect.objectContaining({ id: climb, body: 'Climb to the lamp', done: false }),
    ])
    const raw = JSON.stringify(seen)
    expect(raw).not.toContain('cult spell')
    expect(raw).not.toContain('Break the spell')
    expect(raw).not.toContain(spell)
    expect(raw).not.toContain('"note"')
    expect(raw).not.toContain('"visible"')
    expect(
      await scalar<number>(
        'select revision::int result from public.quest_signals where campaign_id = $1',
        [campaignA],
      ),
    ).toBe(1)
  })

  it('marks what changed after a Player last opened the quest, and only that', async () => {
    await asUser(playerA)
    const seenAt = await scalar<string>('select public.mark_quest_seen($1, $2) result', [
      campaignA,
      lighthouse,
    ])
    expect((await list()).quests[0]!.seen_at).not.toBeNull()
    await asSystem()
    // Move the past back in time so later changes compare strictly after the read.
    await db.query(
      "update public.quest_objectives set player_changed_at = player_changed_at - interval '2 minutes' where quest_id = $1",
      [lighthouse],
    )
    await db.query(
      "update public.quests set player_changed_at = player_changed_at - interval '2 minutes' where id = $1",
      [lighthouse],
    )
    await db.query(
      "update private.quest_reads set seen_at = seen_at - interval '1 minute' where quest_id = $1",
      [lighthouse],
    )
    await asUser(dmA)
    const dmView = (await list()).quests[0]!
    expect(dmView.note).toBe('The keeper is under a cult spell.')
    await asUser(playerA)
    const playerBefore = JSON.stringify(await list())
    await asUser(dmA)
    // The DM only edits the note and a hidden objective: nothing the Player sees changes.
    const signalBefore = await scalar<number>(
      'select revision::int result from public.quest_signals where campaign_id = $1',
      [campaignA],
    )
    const noteOnly = await save(lighthouse, dmView.revision as number, {
      ...dmView,
      note: 'The cult meets at the new moon.',
      objectives: (dmView.objectives as Json[]).map((o) =>
        o.id === spell ? { ...o, body: 'Break the moon spell' } : o,
      ),
    })
    await asUser(playerA)
    // Byte for byte: no time, order or field gives the hidden edit away.
    expect(JSON.stringify(await list())).toBe(playerBefore)
    expect(
      await scalar<number>(
        'select revision::int result from public.quest_signals where campaign_id = $1',
        [campaignA],
      ),
    ).toBe(signalBefore)
    // Revealing the hidden objective is a change the Player is told about.
    await asUser(dmA)
    await save(lighthouse, noteOnly.revision as number, {
      ...noteOnly,
      objectives: (noteOnly.objectives as Json[]).map((o) =>
        o.id === spell ? { ...o, visible: true } : o,
      ),
    })
    await asUser(playerA)
    const after = (await list()).quests[0]!
    const objectives = after.objectives as Json[]
    expect(objectives.map((o) => o.id)).toEqual([talk, climb, spell])
    expect(new Date(after.changed_at as string) > new Date(after.seen_at as string)).toBe(true)
    const revealed = objectives.find((o) => o.id === spell)!
    const untouched = objectives.find((o) => o.id === talk)!
    expect(new Date(revealed.changed_at as string) > new Date(after.seen_at as string)).toBe(true)
    expect(new Date(untouched.changed_at as string) < new Date(after.seen_at as string)).toBe(true)
    expect(seenAt).toBeTruthy()
    expect(
      await scalar<number>(
        'select revision::int result from public.quest_signals where campaign_id = $1',
        [campaignA],
      ),
    ).toBe(signalBefore + 1)
  })

  it('checks revisions, validates input and caps objectives', async () => {
    await asUser(dmA)
    const current = (await list()).quests[0]!
    await expect(save(lighthouse, 1, { ...current })).rejects.toThrow(/Stale revision/)
    for (const bad of [
      { ...current, status: 'lost' },
      { ...current, title: '' },
      { ...current, title: 'x'.repeat(121) },
      { ...current, published: 'yes' },
      { ...current, objectives: Array.from({ length: 21 }, (_, i) => objective(`O${i}`, true)) },
      {
        ...current,
        objectives: [objective('A', true, false, talk), objective('B', true, false, talk)],
      },
    ])
      await expect(save(lighthouse, current.revision as number, bad)).rejects.toThrow(/Invalid/)
    // An objective id from this quest cannot be smuggled into another campaign's quest.
    await asUser(dmB)
    await expect(
      save(
        randomUUID(),
        null,
        {
          title: 'Other',
          status: 'active',
          published: false,
          objectives: [objective('S', true, false, talk)],
        },
        campaignB,
      ),
    ).rejects.toThrow(/Invalid/)
  })

  it('hides everything when the DM turns the module off, and a Player cannot mark drafts', async () => {
    await asUser(dmA)
    const draft = randomUUID()
    await save(draft, null, { title: 'Secret lead', status: 'rumour', published: false })
    await asUser(playerA)
    await expect(
      db.query('select public.mark_quest_seen($1, $2)', [campaignA, draft]),
    ).rejects.toThrow(/Quest unavailable/)
    await setModules(campaignA, dmA, ['party'])
    await asUser(playerA)
    await refused('select public.list_quests($1)', [campaignA])
    await refused('select public.mark_quest_seen($1, $2)', [campaignA, lighthouse])
    expect(
      await scalar<number>(
        'select count(*)::int result from public.quest_signals where campaign_id = $1',
        [campaignA],
      ),
    ).toBe(0)
    // The DM keeps full access whatever the switch says.
    await asUser(dmA)
    expect((await list()).quests).toHaveLength(2)
    await setModules(campaignA, dmA, ['party', 'quests'])
  })

  it('keeps campaigns apart, requires whole payloads and signals unpublishing only', async () => {
    // Real ids of campaign A, used by the DM of campaign B.
    await asUser(dmB)
    await expect(
      save(lighthouse, null, { title: 'Taken', status: 'active', published: false }, campaignB),
    ).rejects.toThrow(/Invalid/)
    expect(
      await scalar<Json>('select public.delete_quest($1, $2, 1) result', [campaignB, lighthouse]),
    ).toMatchObject({ deleted: true })
    expect(
      await scalar<number>(
        'select count(*)::int result from public.quest_signals where campaign_id = $1',
        [campaignA],
      ),
    ).toBe(0)
    await asUser(outsider)
    expect(
      await scalar<number>(
        'select count(*)::int result from public.quest_signals where campaign_id = $1',
        [campaignA],
      ),
    ).toBe(0)
    await asUser(dmA)
    expect((await list()).quests.some((q) => q.id === lighthouse)).toBe(true)
    // A payload without its objectives or note would silently erase them: refused.
    const current = (await list()).quests.find((q) => q.id === lighthouse)!
    for (const missing of ['objectives', 'note'])
      await expect(
        db.query('select public.save_quest($1, $2, $3, $4)', [
          campaignA,
          lighthouse,
          current.revision,
          JSON.stringify({ ...current, [missing]: undefined }),
        ]),
      ).rejects.toThrow(/Invalid/)
    // A retried create with different content is a conflict, not a replay.
    const retried = randomUUID()
    await save(retried, null, { title: 'Bell tower', status: 'rumour', published: true })
    await expect(
      save(retried, null, { title: 'Bell tower!', status: 'rumour', published: true }),
    ).rejects.toThrow(/Stale revision/)
    const signal = async () =>
      scalar<number>(
        'select revision::int result from public.quest_signals where campaign_id = $1',
        [campaignA],
      )
    // Unpublishing hides it from Players and tells them to read again.
    const before = await signal()
    const published = (await list()).quests.find((q) => q.id === retried)!
    await save(retried, published.revision as number, { ...published, published: false })
    expect(await signal()).toBe(before + 1)
    await asUser(playerA)
    expect((await list()).quests.some((q) => q.id === retried)).toBe(false)
    // Deleting a draft leaves no trace for Players.
    await asUser(dmA)
    const draft = (await list()).quests.find((q) => q.id === retried)!
    await db.query('select public.delete_quest($1, $2, $3)', [campaignA, retried, draft.revision])
    expect(await signal()).toBe(before + 1)
  })

  it('removes read times and authorship when an account deletes itself', async () => {
    await asSystem()
    const def = await scalar<string>(
      "select pg_get_functiondef('public.delete_my_account(text,uuid)'::regprocedure) result",
    )
    expect(def).toContain('delete from private.quest_reads where user_id = viewer;')
    expect(def).toContain('update public.quests set created_by = null where created_by = viewer;')
  })

  it('deletes with a revision check, idempotently, and signals Players when a published quest goes', async () => {
    await asUser(dmA)
    const current = (await list()).quests.find((q) => q.id === lighthouse)!
    const before = await scalar<number>(
      'select revision::int result from public.quest_signals where campaign_id = $1',
      [campaignA],
    )
    await expect(
      db.query('select public.delete_quest($1, $2, 1)', [campaignA, lighthouse]),
    ).rejects.toThrow(/Stale revision/)
    await db.query('select public.delete_quest($1, $2, $3)', [
      campaignA,
      lighthouse,
      current.revision,
    ])
    expect(
      await scalar<Json>('select public.delete_quest($1, $2, $3) result', [
        campaignA,
        lighthouse,
        current.revision,
      ]),
    ).toMatchObject({ deleted: true })
    expect(
      await scalar<number>(
        'select revision::int result from public.quest_signals where campaign_id = $1',
        [campaignA],
      ),
    ).toBe(before + 1)
    await asSystem()
    for (const table of ['public.quest_objectives', 'private.quest_notes', 'private.quest_reads'])
      expect(
        await scalar<number>(`select count(*)::int result from ${table} where quest_id = $1`, [
          lighthouse,
        ]),
      ).toBe(0)
  })
})
