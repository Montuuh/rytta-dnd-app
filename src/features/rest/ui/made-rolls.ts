import type { CampaignRoll } from '@/features/campaigns'

/**
 * The hit dice Rytta rolled on this screen, kept for the session. The roll log is the source of
 * truth; this covers a log that cannot load, so closing and reopening the rest does not forget a
 * roll the server already made (and does not offer a second one). Each entry is the roll the server
 * stored, never a value made up here. A reload empties it: the log answers again from then on.
 */
const made = new Map<string, CampaignRoll>()

/** One roll per character per rest: the rest's creation time tells two rests apart. */
export const madeRollKey = (campaignId: string, characterId: string, restStarted: string) =>
  `${campaignId}:${characterId}:${restStarted}`

export const rememberMadeRoll = (key: string, roll: CampaignRoll) => void made.set(key, roll)
export const madeRoll = (key: string) => made.get(key)
