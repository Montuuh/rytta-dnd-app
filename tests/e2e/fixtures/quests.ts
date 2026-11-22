import type { Page } from '@playwright/test'

// RYT-006 SDK contract fixture: an in-memory quest journal mirroring what list_quests returns to
// a DM (everything) and to a Player (published quests, visible objectives, own read time).
// Authorization, hidden content and change marks are verified in tests/database/quests.test.ts.
type Json = Record<string, unknown>
type Objective = {
  id: string
  body: string
  visible: boolean
  done: boolean
  changed_at: string | null
}
type Quest = {
  id: string
  title: string
  summary: string
  status: 'active' | 'rumour' | 'completed' | 'failed'
  published: boolean
  revision: number
  note: string | null
  changed_at: string | null
  updated_at: string
  seen_at: string | null
  objectives: Objective[]
}

export const lighthouseId = '60000000-0000-4000-8000-000000000001'
const earlier = '2026-11-20T18:00:00Z'
const later = '2026-11-21T20:00:00Z'

function sample(): Quest[] {
  return [
    {
      id: lighthouseId,
      title: 'The dark lighthouse',
      summary: 'The keeper of Grey Point has not lit the lamp for three nights. Ships are lost.',
      status: 'active',
      published: true,
      revision: 3,
      note: 'The keeper is under a cult spell.',
      changed_at: later,
      updated_at: later,
      seen_at: earlier,
      objectives: [
        {
          id: '61000000-0000-4000-8000-000000000001',
          body: 'Talk to the keeper',
          visible: true,
          done: true,
          changed_at: earlier,
        },
        {
          id: '61000000-0000-4000-8000-000000000002',
          body: 'Climb to the lamp',
          visible: true,
          done: false,
          changed_at: later,
        },
        {
          id: '61000000-0000-4000-8000-000000000003',
          body: 'Break the spell',
          visible: false,
          done: false,
          changed_at: null,
        },
      ],
    },
    {
      id: '60000000-0000-4000-8000-000000000002',
      title: 'Brannoc’s debt',
      summary: 'The smith owes the Harbour Guild more than he can pay.',
      status: 'active',
      published: true,
      revision: 1,
      note: null,
      changed_at: earlier,
      updated_at: earlier,
      seen_at: earlier,
      objectives: [
        {
          id: '61000000-0000-4000-8000-000000000004',
          body: 'Find the ledger',
          visible: true,
          done: false,
          changed_at: earlier,
        },
        {
          id: '61000000-0000-4000-8000-000000000005',
          body: 'Speak to the guild',
          visible: true,
          done: false,
          changed_at: earlier,
        },
      ],
    },
    {
      id: '60000000-0000-4000-8000-000000000003',
      title: 'Lights under the water',
      summary: 'Something glows in the bay at night.',
      status: 'rumour',
      published: true,
      revision: 1,
      note: null,
      changed_at: earlier,
      updated_at: earlier,
      seen_at: earlier,
      objectives: [],
    },
    {
      id: '60000000-0000-4000-8000-000000000004',
      title: 'The dry well',
      summary: 'The village well ran dry and the party found why.',
      status: 'completed',
      published: true,
      revision: 2,
      note: null,
      changed_at: earlier,
      updated_at: earlier,
      seen_at: earlier,
      objectives: [
        {
          id: '61000000-0000-4000-8000-000000000006',
          body: 'Clear the cistern',
          visible: true,
          done: true,
          changed_at: earlier,
        },
      ],
    },
    {
      id: '60000000-0000-4000-8000-000000000005',
      title: 'The cult’s new moon',
      summary: 'Not yet discovered.',
      status: 'rumour',
      published: false,
      revision: 1,
      note: 'They meet at the old chapel.',
      changed_at: null,
      updated_at: earlier,
      seen_at: null,
      objectives: [],
    },
  ]
}

export function questServer(options: { dm?: boolean; empty?: boolean; stale?: boolean } = {}) {
  const dm = options.dm ?? false
  const calls: { method: string; body: Json }[] = []
  let quests = options.empty ? [] : sample()
  const playerQuest = (q: Quest) => ({
    id: q.id,
    title: q.title,
    summary: q.summary,
    status: q.status,
    changed_at: q.changed_at,
    seen_at: q.seen_at,
    objectives: q.objectives
      .filter((o) => o.visible)
      .map(({ id, body, done, changed_at }) => ({ id, body, done, changed_at })),
  })
  const dmQuest = (q: Quest) => {
    const { seen_at, ...rest } = q
    void seen_at
    return rest
  }
  return {
    calls,
    quests: () => quests,
    async install(page: Page) {
      await page.route(
        /\/rest\/v1\/rpc\/(list_quests|save_quest|delete_quest|mark_quest_seen)$/,
        async (route) => {
          const method = new URL(route.request().url()).pathname.split('/').at(-1)!
          let body: Json = {}
          try {
            body = route.request().postDataJSON() ?? {}
          } catch {
            /* GET */
          }
          calls.push({ method, body })
          const respond = (data: unknown, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
          if (method === 'list_quests')
            return respond({
              dm,
              quests: dm ? quests.map(dmQuest) : quests.filter((q) => q.published).map(playerQuest),
            })
          if (method === 'mark_quest_seen') {
            const now = new Date().toISOString()
            quests = quests.map((q) => (q.id === body.target_quest ? { ...q, seen_at: now } : q))
            return respond(now)
          }
          if (method === 'delete_quest') {
            quests = quests.filter((q) => q.id !== body.target_quest)
            return respond({ id: body.target_quest, deleted: true })
          }
          if (options.stale) return respond({ message: 'Stale revision' }, 400)
          const payload = body.payload as Json
          const now = new Date().toISOString()
          const current = quests.find((q) => q.id === body.target_quest)
          const saved: Quest = {
            id: String(body.target_quest),
            title: String(payload.title),
            summary: String(payload.summary),
            status: payload.status as Quest['status'],
            published: Boolean(payload.published),
            revision: (current?.revision ?? 0) + 1,
            note: String(payload.note) || null,
            changed_at: payload.published ? now : (current?.changed_at ?? null),
            updated_at: now,
            seen_at: null,
            objectives: (payload.objectives as Objective[]).map((o) => ({ ...o, changed_at: now })),
          }
          quests = [saved, ...quests.filter((q) => q.id !== saved.id)]
          return respond(dmQuest(saved))
        },
      )
    },
  }
}
