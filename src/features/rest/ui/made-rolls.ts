import type { CampaignRoll } from '@/features/campaigns'
import { onIdentityChange } from '@/shared/lib/identity-scope'

/**
 * The hit dice Rytta rolled on this screen, kept for the session. The roll log is the source of
 * truth; this covers a log that cannot load, so closing and reopening the rest does not forget a
 * roll the server already made (and does not offer a second one). Each entry is the roll the server
 * stored, never a value made up here. It belongs to the account that rolled (the key carries the
 * user) and is emptied whenever the account changes or signs out; a reload empties it too.
 */
const made = new Map<string, CampaignRoll>()
onIdentityChange(() => made.clear())

/** One roll per account, character and rest: the rest's creation time tells two rests apart. */
export const madeRollKey = (
  userId: string,
  campaignId: string,
  characterId: string,
  restStarted: string,
) => `${userId}:${campaignId}:${characterId}:${restStarted}`

export const rememberMadeRoll = (key: string, roll: CampaignRoll) => void made.set(key, roll)
export const madeRoll = (key: string) => made.get(key)
