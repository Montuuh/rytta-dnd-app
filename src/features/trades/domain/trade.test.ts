import { describe, expect, it } from 'vitest'
import {
  formatCountdown,
  pollInterval,
  remainingMs,
  sameOffer,
  tradeErrorCode,
  tradeSlots,
  tradeStateSchema,
  withLine,
} from './trade'

const a = '00000000-0000-4000-8000-00000000000a'
const b = '00000000-0000-4000-8000-00000000000b'

describe('RYT-034 trade domain', () => {
  it('adds, changes and removes offer lines within the slot limit', () => {
    let lines = withLine([], a, 2)
    expect(lines).toEqual([{ item_id: a, quantity: 2 }])
    lines = withLine(lines, a, 3.7)
    expect(lines).toEqual([{ item_id: a, quantity: 3 }])
    lines = withLine(lines, b, 1)
    expect(lines.map((l) => l.item_id)).toEqual([a, b])
    expect(withLine(lines, a, 0)).toEqual([{ item_id: b, quantity: 1 }])
    const full = Array.from({ length: tradeSlots }, (_, i) => ({
      item_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      quantity: 1,
    }))
    expect(withLine(full, a, 1)).toBe(full)
    expect(sameOffer(lines, [...lines].reverse())).toBe(true)
    expect(sameOffer(lines, [{ item_id: a, quantity: 3 }])).toBe(false)
  })

  it('maps SQL errors to stable codes and formats the countdown', () => {
    expect(tradeErrorCode('Stale revision')).toBe('stale')
    expect(tradeErrorCode('Partner busy')).toBe('partnerBusy')
    expect(tradeErrorCode('Insufficient gold')).toBe('gold')
    expect(tradeErrorCode('Empty trade')).toBe('empty')
    expect(tradeErrorCode('quantity')).toBe('quantity')
    expect(tradeErrorCode('boom')).toBe('unavailable')
    expect(formatCountdown(119_001)).toBe('2:00')
    expect(formatCountdown(61_000)).toBe('1:01')
    expect(remainingMs('2026-11-03T10:00:00Z', Date.parse('2026-11-03T10:00:05Z'))).toBe(0)
  })

  it('validates the trade state and polls faster while a trade is live', () => {
    const idle = tradeStateSchema.parse({
      character: { id: a, name: 'Arin', gold: '12' },
      partners: [{ id: b, name: 'Bea', busy: false }],
      items: [],
      trade: null,
      recent: null,
      history: [],
    })
    expect(idle.character?.gold).toBe(12)
    expect(pollInterval(idle)).toBe(10_000)
    expect(pollInterval(undefined)).toBe(10_000)
    const side = (id: string) => ({
      character_id: id,
      name: 'X',
      gold: 0,
      confirmed: false,
      items: [],
    })
    const live = {
      ...idle,
      trade: {
        id: a,
        status: 'open',
        revision: 1,
        initiated_by_you: true,
        expires_at: '2026-11-03T10:00:00+00:00',
        updated_at: '2026-11-03T10:00:00+00:00',
        you: side(a),
        partner: side(b),
      },
    }
    expect(pollInterval(tradeStateSchema.parse(live))).toBe(3_000)
    expect(() =>
      tradeStateSchema.parse({ ...live, trade: { ...live.trade, status: 'haggling' } }),
    ).toThrow()
  })
})
