import { describe, expect, it } from 'vitest'
import type { CreatureListItem, CreaturePack } from '@/features/bestiary'
import { campaignBestiary, packOf, type PackCreatures } from './campaign-bestiary'

const item = (key: string, extra: Partial<CreatureListItem> = {}): CreatureListItem => ({
  key,
  source: key.startsWith('srd:') ? 'srd' : 'homebrew',
  id: key.slice(key.indexOf(':') + 1),
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
const pack = (extra: Partial<CreaturePack>): CreaturePack => ({
  id: '00000000-0000-4000-8000-000000000001',
  ref: '00000000',
  slug: 'srd-5-2-1',
  title_en: 'SRD',
  title_es: 'SRD',
  srd: true,
  version: 1,
  enabled: true,
  hidden: [],
  ...extra,
})
const srd = pack({})
const north = pack({
  id: 'abcdef12-0000-4000-8000-000000000002',
  ref: 'abcdef12',
  slug: 'north',
  srd: false,
  title_en: 'North',
  title_es: 'Norte',
})
const packs = (s: CreaturePack, n: CreaturePack): PackCreatures<CreatureListItem>[] => [
  { pack: s, title: 'SRD', items: [item('srd:wolf'), item('srd:owlbear'), item('srd:goblin')] },
  { pack: n, title: 'Norte', items: [item('srd:abcdef12--yeti'), item('srd:abcdef12--mammoth')] },
]
const own = [
  item('hb:alpha', { srdId: 'wolf' }),
  item('hb:my-owlbear', { srdId: 'owlbear', version: true }),
  item('hb:my-yeti', { srdId: 'abcdef12--yeti', version: true }),
]
const keys = (items: CreatureListItem[]) => items.map((i) => i.key)

describe('RYT-094 campaign bestiary from packs', () => {
  it('lists own creatures, versions in place of their pack creature, and the enabled packs', () => {
    const list = campaignBestiary(own, packs(srd, north))
    expect(keys(list)).toEqual([
      'hb:alpha',
      'hb:my-owlbear',
      'hb:my-yeti',
      'srd:wolf',
      'srd:goblin',
      'srd:abcdef12--mammoth',
    ])
    expect(list.find((i) => i.key === 'hb:my-yeti')).toMatchObject({
      packId: north.id,
      pack: 'Norte',
    })
  })

  it('leaves out hidden creatures with their versions, and turned-off packs', () => {
    const hidden = campaignBestiary(
      own,
      packs({ ...srd, hidden: ['goblin', 'owlbear'] }, { ...north, enabled: false }),
    )
    expect(keys(hidden)).toEqual(['hb:alpha', 'srd:wolf'])
    expect(keys(campaignBestiary(own, []))).toEqual(['hb:alpha'])
  })

  it('finds the pack of a stored reference', () => {
    expect(packOf([srd, north], 'wolf')?.id).toBe(srd.id)
    expect(packOf([srd, north], 'abcdef12--yeti')?.id).toBe(north.id)
    expect(packOf([srd], 'abcdef12--yeti')).toBeUndefined()
  })
})
