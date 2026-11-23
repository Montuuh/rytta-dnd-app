import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign } from './campaign'
import {
  campaignFromShell,
  forgetCampaignShells,
  readCampaignShell,
  rememberCampaignShell,
  syncCampaignShells,
} from './campaign-shell'

const memory = new Map<string, string>()
vi.stubGlobal('localStorage', {
  get length() {
    return memory.size
  },
  key: (at: number) => [...memory.keys()][at] ?? null,
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
})

const user = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const campaign = (id: string, name = 'The Sunken Coast'): Campaign => ({
  id,
  name,
  description: 'Private notes about the campaign',
  created_at: '2026-11-01T10:00:00.000Z',
  role: 'dm',
  player_modules: ['party', 'combat'],
  party_level: 5,
  dice_mode: 'physical',
  roll_visibility: 'roller_dm',
})
const first = '20000000-0000-4000-8000-000000000001'
const second = '20000000-0000-4000-8000-000000000002'
const third = '20000000-0000-4000-8000-000000000003'

describe('campaign shell kept on the device (RYT-160)', () => {
  beforeEach(() => memory.clear())

  it('keeps only the id, name, role and modules of an opened campaign', () => {
    rememberCampaignShell(user, campaign(first))
    expect(readCampaignShell(user, first)).toEqual({
      id: first,
      name: 'The Sunken Coast',
      role: 'dm',
      player_modules: ['party', 'combat'],
    })
    const stored = [...memory.values()].join()
    expect(stored).not.toContain('Private notes')
    expect(stored).not.toContain('2026-11-01')
  })

  it('keeps campaigns per account', () => {
    rememberCampaignShell(user, campaign(first))
    expect(readCampaignShell(other, first)).toBeNull()
  })

  it('follows the list: renamed campaigns update, left ones go, unopened ones are not added', () => {
    rememberCampaignShell(user, campaign(first))
    rememberCampaignShell(user, campaign(second))
    syncCampaignShells(user, [campaign(first, 'The Drowned Coast'), campaign(third)])
    expect(readCampaignShell(user, first)?.name).toBe('The Drowned Coast')
    expect(readCampaignShell(user, second)).toBeNull()
    expect(readCampaignShell(user, third)).toBeNull()
    syncCampaignShells(user, [])
    expect(memory.size).toBe(0)
  })

  it('drops what it cannot read', () => {
    memory.set(`rytta-campaign-shell:${user}`, '{"x":{"name":1}}')
    expect(readCampaignShell(user, first)).toBeNull()
    expect(memory.size).toBe(0)
  })

  it('forgets every account on sign-out or an account change', () => {
    rememberCampaignShell(user, campaign(first))
    rememberCampaignShell(other, campaign(second))
    memory.set('rytta-language', 'es')
    forgetCampaignShells()
    expect([...memory.keys()]).toEqual(['rytta-language'])
    rememberCampaignShell(user, campaign(first))
    rememberCampaignShell(other, campaign(second))
    forgetCampaignShells(other)
    expect(readCampaignShell(user, first)).toBeNull()
    expect(readCampaignShell(other, second)).not.toBeNull()
  })

  it('draws a campaign without any of its data', () => {
    const drawn = campaignFromShell({
      id: first,
      name: 'The Sunken Coast',
      role: 'player',
      player_modules: ['party'],
    })
    expect(drawn).toMatchObject({ name: 'The Sunken Coast', description: '', party_level: null })
  })
})

describe('campaign shell records (RYT-160 security review)', () => {
  beforeEach(() => memory.clear())

  it('ignores a record filed under another campaign', () => {
    memory.set(
      'rytta-campaign-shell:10000000-0000-4000-8000-000000000001',
      JSON.stringify({
        [first]: { id: second, name: 'Other', role: 'dm', player_modules: ['party'] },
      }),
    )
    expect(readCampaignShell(user, first)).toBeNull()
  })
})
