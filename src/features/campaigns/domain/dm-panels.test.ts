import { describe, expect, it } from 'vitest'
import { dmPanels, dmPlaceHref, parseDmPanel } from './dm-panels'

describe('RYT-179 command centre panels', () => {
  it('lists every panel once, grouped at the table, party and settings', () => {
    expect(dmPanels).toEqual([
      'bestiary',
      'items',
      'members',
      'level',
      'modules',
      'dice',
      'content',
      'audit',
    ])
  })

  it('reads a missing, retired or unknown panel as Members', () => {
    expect(parseDmPanel(null)).toBe('members')
    expect(parseDmPanel('prepare')).toBe('members')
    expect(parseDmPanel('nope')).toBe('members')
    expect(parseDmPanel('level')).toBe('level')
  })

  it('builds the home, a panel and a panel action address', () => {
    expect(dmPlaceHref('c1', 'home')).toBe('/campaign/c1')
    expect(dmPlaceHref('c1', 'members')).toBe('/campaign/c1/members')
    expect(dmPlaceHref('c1', 'members', 'invite')).toBe('/campaign/c1/members?do=invite')
    expect(dmPlaceHref('c1', 'items', 'loot')).toBe('/campaign/c1/members?panel=items&do=loot')
  })
})
