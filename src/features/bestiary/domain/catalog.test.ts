import { describe, expect, it } from 'vitest'
import { campaignCreatures, emptyFilters, filterCreatures, type CreatureListItem } from './catalog'
import { challengeRatings } from './types'

const base = {
  cr: '1' as const,
  type: 'beast' as const,
  size: ['medium' as const],
  ac: 12,
  hp: 10,
  initiative: 0,
  legendary: 0,
}

const pack = (id: string, packId = 'p1'): CreatureListItem => ({
  ...base,
  key: `srd:${id}`,
  source: 'srd',
  id,
  name: id,
  packId,
})
const own = (id: string, extra: Partial<CreatureListItem> = {}): CreatureListItem => ({
  ...base,
  key: `hb:${id}`,
  source: 'homebrew',
  id,
  name: `own ${id}`,
  ...extra,
})

const items = [
  pack('wolf'),
  pack('abcd1234--yeti', 'p2'),
  pack('bear'),
  pack('owl'),
  own('t1'),
  own('t2', { version: true, srdId: 'owl' }),
]

describe('the campaign view of the bestiary', () => {
  it('is empty when nothing was touched', () => {
    expect(campaignCreatures([pack('wolf')], new Set(), null).size).toBe(0)
  })

  it('joins favourites, own creatures, edited pack creatures and creatures used in encounters', () => {
    const reasons = campaignCreatures(items, new Set(['srd:wolf']), {
      references: ['abcd1234--yeti'],
      templates: [],
    })
    expect(Object.fromEntries(reasons)).toEqual({
      'srd:wolf': 'favorite',
      'srd:abcd1234--yeti': 'used',
      'hb:t1': 'own',
      'hb:t2': 'own',
    })
  })

  it('matches the stored reference whole: a bare key is the SRD one', () => {
    const reasons = campaignCreatures(
      [pack('abcd1234--yeti', 'p2'), pack('yeti', 'p1')],
      new Set(),
      { references: ['yeti'], templates: [] },
    )
    expect([...reasons.keys()]).toEqual(['srd:yeti'])
    expect(reasons.size).toBe(1)
  })

  it('names the favourite first, then the use, and counts a used campaign creature', () => {
    const reasons = campaignCreatures(items, new Set(['srd:bear', 'hb:t1']), {
      references: ['bear', 'owl'],
      templates: ['t1', 't2'],
    })
    expect(reasons.get('srd:bear')).toBe('favorite')
    expect(reasons.get('hb:t1')).toBe('favorite')
    expect(reasons.get('hb:t2')).toBe('used')
  })

  it('filters by the campaign source and keeps the query', () => {
    const reasons = campaignCreatures(items, new Set(['srd:wolf']), null)
    const find = (query: string, source: 'campaign' | 'all') =>
      filterCreatures(
        items,
        { ...emptyFilters, source, query },
        new Set(),
        challengeRatings,
        reasons,
      ).map((i) => i.key)
    expect(find('', 'campaign')).toEqual(['srd:wolf', 'hb:t1', 'hb:t2'].sort())
    expect(find('yeti', 'campaign')).toEqual([])
    expect(find('yeti', 'all')).toEqual(['srd:abcd1234--yeti'])
  })
})
