import type { Page } from '@playwright/test'
import { beaId, characterId, catoId } from './identity.ts'

// RYT-034 SDK contract fixture: one in-memory trade table shared by two browser contexts.
// It mirrors the RPC rules the UI relies on (revisions, confirmation resets, completion);
// authorization and atomicity are verified against PostgreSQL in tests/database/trades.test.ts.
type Item = {
  item_id: string
  definition_id: string
  name: string
  icon: string
  rarity: string
  category: string
  quantity: number
}
type Side = {
  character: string
  gold: number
  confirmed: boolean
  items: { item_id: string; quantity: number }[]
}
type Row = {
  id: string
  status: string
  revision: number
  expires: number
  updated: number
  initiator: Side
  partner: Side
  closedBy: string | null
  summary: Record<string, unknown> | null
}

const names: Record<string, string> = { [characterId]: 'Arin', [beaId]: 'Bea', [catoId]: 'Cato' }
const item = (id: string, name: string, icon: string, rarity: string, quantity: number): Item => ({
  item_id: `50000000-0000-4000-8000-0000000000${id}`,
  definition_id: `60000000-0000-4000-8000-0000000000${id}`,
  name,
  icon,
  rarity,
  category: 'gear',
  quantity,
})

export function tradeServer() {
  const inventories: Record<string, Item[]> = {
    [characterId]: [
      item('a1', 'Poción de curación', 'flask-conical', 'uncommon', 3),
      item('a2', 'Cuerda de seda', 'backpack', 'common', 1),
      item('a3', 'Gema de luna', 'gem', 'rare', 1),
    ],
    [beaId]: [item('b1', 'Daga élfica', 'sword', 'rare', 1)],
    [catoId]: [],
  }
  const gold: Record<string, number> = { [characterId]: 120, [beaId]: 45, [catoId]: 0 }
  let rows: Row[] = []
  const history: Record<string, unknown>[] = []
  const calls: { actor: string; method: string; body: Record<string, unknown> }[] = []
  const active = (character: string) =>
    rows.find(
      (r) =>
        ['invited', 'open'].includes(r.status) &&
        r.expires > Date.now() &&
        [r.initiator.character, r.partner.character].includes(character),
    )
  const sideOf = (row: Row, character: string) =>
    row.initiator.character === character ? row.initiator : row.partner
  const otherOf = (row: Row, character: string) =>
    row.initiator.character === character ? row.partner : row.initiator
  // Display data survives the stack emptying, like the SQL join on the zero-quantity row.
  const catalog = new Map(
    Object.values(inventories)
      .flat()
      .map((i) => [i.item_id, { ...i }]),
  )
  const lookup = (_character: string, itemId: string) => catalog.get(itemId)
  const sideJson = (side: Side) => ({
    character_id: side.character,
    name: names[side.character],
    gold: side.gold,
    confirmed: side.confirmed,
    items: side.items.map((line) => ({
      ...lookup(side.character, line.item_id)!,
      quantity: line.quantity,
    })),
  })
  const json = (row: Row, me: string) => ({
    id: row.id,
    status:
      ['invited', 'open'].includes(row.status) && row.expires <= Date.now()
        ? 'expired'
        : row.status,
    revision: row.revision,
    initiated_by_you: row.initiator.character === me,
    expires_at: new Date(row.expires).toISOString(),
    updated_at: new Date(row.updated).toISOString(),
    you: sideJson(sideOf(row, me)),
    partner: sideJson(otherOf(row, me)),
  })
  const summarySide = (side: Side) => ({
    name: names[side.character],
    gold: side.gold,
    items: side.items.map((line) => {
      const found = lookup(side.character, line.item_id)!
      return { name: found.name, icon: found.icon, rarity: found.rarity, quantity: line.quantity }
    }),
  })
  const complete = (row: Row) => {
    row.summary = { initiator: summarySide(row.initiator), partner: summarySide(row.partner) }
    for (const [from, to] of [
      [row.initiator, row.partner],
      [row.partner, row.initiator],
    ] as const) {
      for (const line of from.items) {
        const stack = inventories[from.character]!.find((i) => i.item_id === line.item_id)!
        stack.quantity -= line.quantity
        const target = inventories[to.character]!.find(
          (i) => i.definition_id === stack.definition_id,
        )
        if (target) target.quantity += line.quantity
        else
          inventories[to.character]!.push({
            ...stack,
            item_id: stack.item_id.replace('50000000', '51000000'),
            quantity: line.quantity,
          })
      }
      gold[from.character]! -= from.gold
      gold[to.character]! += from.gold
    }
    for (const c of Object.keys(inventories))
      inventories[c] = inventories[c]!.filter((i) => i.quantity > 0)
    row.status = 'completed'
    row.revision += 1
    row.updated = Date.now()
    history.unshift({ id: row.id, completed_at: new Date().toISOString(), row })
  }
  const fail = (message: string) => ({ error: message })
  function handle(me: string, method: string, body: Record<string, unknown>) {
    calls.push({ actor: me, method, body })
    const row = rows.find((r) => r.id === body.target_trade)
    switch (method) {
      case 'get_trade_state': {
        const current = active(me)
        const recent = rows
          .filter(
            (r) =>
              [r.initiator.character, r.partner.character].includes(me) &&
              r !== current &&
              Math.max(r.updated, ['invited', 'open'].includes(r.status) ? r.expires : 0) >
                Date.now() - 60_000,
          )
          .sort((x, y) => y.updated - x.updated)[0]
        return {
          character: { id: me, name: names[me], gold: gold[me] },
          partners: Object.keys(names)
            .filter((id) => id !== me)
            .map((id) => ({ id, name: names[id], busy: Boolean(active(id)) })),
          items: inventories[me],
          trade: current ? json(current, me) : null,
          recent: recent
            ? {
                ...json(recent, me),
                closed_by_you: recent.closedBy === me,
                summary: recent.summary,
              }
            : null,
          history: history
            .filter((h) => {
              const r = h.row as Row
              return [r.initiator.character, r.partner.character].includes(me)
            })
            .map((h) => {
              const r = h.row as Row
              const mine = r.initiator.character === me
              const s = r.summary as Record<string, Record<string, unknown>>
              return {
                id: r.id,
                completed_at: h.completed_at,
                partner: names[otherOf(r, me).character],
                gave: mine ? s.initiator : s.partner,
                received: mine ? s.partner : s.initiator,
              }
            }),
        }
      }
      case 'invite_trade': {
        if (active(me)) return fail('Trade busy')
        if (active(String(body.to_character))) return fail('Partner busy')
        const created: Row = {
          id: `70000000-0000-4000-8000-${String(rows.length + 1).padStart(12, '0')}`,
          status: 'invited',
          revision: 0,
          expires: Date.now() + 120_000,
          updated: Date.now(),
          initiator: { character: me, gold: 0, confirmed: false, items: [] },
          partner: { character: String(body.to_character), gold: 0, confirmed: false, items: [] },
          closedBy: null,
          summary: null,
        }
        rows = [...rows, created]
        return { trade_id: created.id, status: 'invited', revision: 0 }
      }
      case 'respond_trade_invite': {
        if (!row || row.partner.character !== me) return fail('Forbidden')
        if (row.status !== 'invited') return fail('Trade closed')
        row.status = body.accept ? 'open' : 'declined'
        row.closedBy = body.accept ? null : me
        row.expires = body.accept ? Date.now() + 600_000 : row.expires
        row.revision += 1
        row.updated = Date.now()
        return { trade_id: row.id, status: row.status, revision: row.revision }
      }
      case 'set_trade_offer': {
        if (!row) return fail('Forbidden')
        if (row.status !== 'open') return fail('Trade closed')
        if (row.revision !== body.expected_revision) return fail('Stale revision')
        if (Number(body.offer_gold) > gold[me]!) return fail('Insufficient gold')
        const side = sideOf(row, me)
        side.items = body.offer_items as Side['items']
        side.gold = Number(body.offer_gold)
        row.initiator.confirmed = false
        row.partner.confirmed = false
        row.revision += 1
        row.updated = Date.now()
        return { trade_id: row.id, status: row.status, revision: row.revision }
      }
      case 'confirm_trade': {
        if (!row) return fail('Forbidden')
        if (row.status === 'completed' && row.revision === Number(body.expected_revision) + 1)
          return { trade_id: row.id, status: row.status, revision: row.revision }
        if (row.status !== 'open') return fail('Trade closed')
        if (row.revision !== body.expected_revision) return fail('Stale revision')
        const sides = [row.initiator, row.partner]
        if (sides.every((side) => side.gold === 0 && side.items.length === 0))
          return fail('Empty trade')
        sideOf(row, me).confirmed = true
        row.updated = Date.now()
        if (row.initiator.confirmed && row.partner.confirmed) complete(row)
        return { trade_id: row.id, status: row.status, revision: row.revision }
      }
      case 'cancel_trade': {
        if (!row) return fail('Forbidden')
        if (['invited', 'open'].includes(row.status)) {
          row.status =
            row.status === 'invited' && row.partner.character === me ? 'declined' : 'cancelled'
          row.closedBy = me
          row.revision += 1
          row.updated = Date.now()
        }
        return { trade_id: row.id, status: row.status, revision: row.revision }
      }
    }
    return fail('Unhandled trade route')
  }
  return {
    calls,
    inventories,
    gold,
    /** Registers the trade RPCs for a page acting as `character` (after identityFixture). */
    async install(page: Page, character: string) {
      await page.routeWebSocket(/realtime\/v1\/websocket/, () => {
        /* Realtime unavailable: the UI must fall back to polling. */
      })
      await page.route(/\/rest\/v1\/rpc\/(get_trade_state|[a-z_]*trade[a-z_]*)$/, async (route) => {
        const method = new URL(route.request().url()).pathname.split('/').at(-1)!
        let body: Record<string, unknown> = {}
        try {
          body = route.request().postDataJSON() ?? {}
        } catch {
          /* empty body */
        }
        const result = handle(character, method, body) as Record<string, unknown>
        if ('error' in result && Object.keys(result).length === 1)
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'P0001', message: result.error }),
          })
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(result),
        })
      })
    },
  }
}
