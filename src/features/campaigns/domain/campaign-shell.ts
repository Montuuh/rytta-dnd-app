import { z } from 'zod'
import type { Campaign } from './campaign'

/**
 * RYT-160 (owner decision, block O): to draw a campaign's header and navigation after a reload
 * without signal, the device keeps, per account and only for the campaigns opened on it, the
 * campaign's id, name, the account's role and the enabled modules. Nothing else from the campaign.
 * It is refreshed by every successful campaign list, which also drops campaigns the account left or
 * lost; signing out or changing account removes it all.
 */
const prefix = 'rytta-campaign-shell:'
const keyFor = (userId: string) => `${prefix}${userId}`

const shellSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  role: z.enum(['dm', 'player']),
  player_modules: z.array(z.string().max(40)).max(30),
})
const storeSchema = z.record(z.uuid(), shellSchema)
export type CampaignShell = z.infer<typeof shellSchema>
type Store = Record<string, CampaignShell>

const shellOf = (campaign: Campaign): CampaignShell => ({
  id: campaign.id,
  name: campaign.name,
  role: campaign.role,
  player_modules: campaign.player_modules,
})

function read(userId: string): Store {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return {}
    const parsed = storeSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
    localStorage.removeItem(keyFor(userId))
  } catch {
    // Storage may be unavailable or hold something unreadable: keep nothing.
  }
  return {}
}

function write(userId: string, store: Store) {
  try {
    if (Object.keys(store).length === 0) localStorage.removeItem(keyFor(userId))
    else localStorage.setItem(keyFor(userId), JSON.stringify(store))
  } catch {
    // Without storage the shell is simply not available offline.
  }
}

/** Keeps the shell of a campaign the account just opened. */
export function rememberCampaignShell(userId: string, campaign: Campaign) {
  const parsed = shellSchema.safeParse(shellOf(campaign))
  if (!parsed.success) return
  const store = read(userId)
  const next = parsed.data
  const known = store[campaign.id]
  if (known && JSON.stringify(known) === JSON.stringify(next)) return
  write(userId, { ...store, [campaign.id]: next })
}

/** The kept shell of a campaign, or null. */
export function readCampaignShell(userId: string, campaignId: string): CampaignShell | null {
  const shell = read(userId)[campaignId]
  // A record filed under another campaign's id is not this campaign's.
  return shell && shell.id === campaignId ? shell : null
}

/**
 * After a successful campaign list: kept campaigns take their current name, role and modules, and
 * those no longer listed (left, removed, deleted) are dropped.
 */
export function syncCampaignShells(userId: string, campaigns: Campaign[]) {
  const store = read(userId)
  const ids = Object.keys(store)
  if (ids.length === 0) return
  const listed = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  const next: Store = {}
  for (const id of ids) {
    const campaign = listed.get(id)
    if (campaign) next[id] = shellOf(campaign)
  }
  if (JSON.stringify(next) !== JSON.stringify(store)) write(userId, next)
}

/**
 * Removes the kept shells of every account on this device, or of every account but `keep` (the
 * one signed in). Signing out and changing account call it.
 */
export function forgetCampaignShells(keep?: string) {
  try {
    for (let at = localStorage.length - 1; at >= 0; at -= 1) {
      const key = localStorage.key(at)
      if (key?.startsWith(prefix) && (!keep || key !== keyFor(keep))) localStorage.removeItem(key)
    }
  } catch {
    // Nothing to remove when storage is unavailable.
  }
}

/** The kept shell as a campaign for the header and navigation only; never for a screen's data. */
export const campaignFromShell = (shell: CampaignShell): Campaign => ({
  ...shell,
  description: '',
  created_at: new Date(0).toISOString(),
  party_level: null,
  dice_mode: 'physical',
  roll_visibility: 'roller_dm',
})
