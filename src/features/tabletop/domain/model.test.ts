import { describe, expect, it, vi } from 'vitest'
import { itemSchema, lenientItems, tabletopErrorCode } from './model'

describe('tabletop error codes', () => {
  it('tells the scene quota apart from a full scene (RYT-113)', () => {
    expect(tabletopErrorCode('Scene limit')).toBe('sceneLimit')
    expect(tabletopErrorCode('Scene is full')).toBe('full')
    expect(tabletopErrorCode('Scene unavailable')).toBe('gone')
    expect(tabletopErrorCode('something else')).toBe('unavailable')
  })
})

describe('tabletop items', () => {
  const token = {
    id: '50000000-0000-4000-8000-000000000001',
    kind: 'token',
    x: 1,
    y: 1,
    w: 1,
    h: 1,
    rotation: 0,
    label: 'Stranger',
    combatant_id: null,
    controllable: true,
    data: { color: 'azure' },
  }
  it('keeps a masked token usable without its character (RYT-113)', () => {
    expect(itemSchema.parse({ ...token, character_id: null })).toMatchObject({
      label: 'Stranger',
      character_id: null,
      controllable: true,
    })
    expect(itemSchema.parse(token)).toMatchObject({ character_id: null, controllable: true })
  })
})

describe('lenient item parsing (RYT-126)', () => {
  const token = (n: number, data: Record<string, unknown>) => ({
    id: `50000000-0000-4000-8000-00000000000${n}`,
    kind: 'token',
    x: 1,
    y: 1,
    w: 1,
    h: 1,
    rotation: 0,
    label: `T${n}`,
    combatant_id: null,
    data,
  })
  it('skips and logs one token with an invalid colour, keeping the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const items = lenientItems.parse([
      token(1, { color: 'azure' }),
      token(2, { color: 'not-a-colour' }),
      token(3, {}),
      null,
    ])
    expect(items.map((i) => i.label)).toEqual(['T1', 'T3'])
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0]![1]).toMatchObject({ kind: 'token', fields: ['data.color'] })
    warn.mockRestore()
  })
})
