import { describe, expect, it } from 'vitest'
import type { CreatureListItem } from '@/features/bestiary'
import { campaignBestiary } from './campaign-bestiary'

const item = (key: string, extra: Partial<CreatureListItem> = {}): CreatureListItem => ({
  key,
  source: key.startsWith('srd:') ? 'srd' : 'homebrew',
  id: key.split(':')[1]!,
  name: key,
  cr: null,
  type: null,
  size: [],
  ac: 10,
  hp: 10,
  initiative: 0,
  legendary: 0,
  ...extra,
})
const official = [item('srd:wolf'), item('srd:owlbear'), item('srd:goblin-warrior')]
const own = [
  item('hb:alpha', { srdId: 'wolf' }),
  item('hb:my-owlbear', { srdId: 'owlbear', version: true }),
]
const keys = (items: CreatureListItem[]) => items.map((i) => i.key)

describe('RYT-089 campaign bestiary', () => {
  it('lists only the campaign creatures until the official bestiary is downloaded', () => {
    expect(keys(campaignBestiary(own, official, undefined))).toEqual(['hb:alpha', 'hb:my-owlbear'])
    expect(keys(campaignBestiary(own, official, { downloaded: false, removed: [] }))).toEqual([
      'hb:alpha',
      'hb:my-owlbear',
    ])
  })

  it('adds the official creatures, minus the removed ones and those with a campaign version', () => {
    // A creature based on the wolf is not its version: the official wolf stays.
    expect(keys(campaignBestiary(own, official, { downloaded: true, removed: [] }))).toEqual([
      'hb:alpha',
      'hb:my-owlbear',
      'srd:wolf',
      'srd:goblin-warrior',
    ])
    expect(
      keys(campaignBestiary(own, official, { downloaded: true, removed: ['goblin-warrior'] })),
    ).toEqual(['hb:alpha', 'hb:my-owlbear', 'srd:wolf'])
  })
})
