/**
 * The encounter the DM opened or added to last in this browser session, per campaign. The bestiary
 * offers it as the target of a one-tap add when no encounter is in progress.
 */
const storageKey = (campaignId: string) => `rytta.combat.lastEncounter.${campaignId}`

export function rememberEncounter(campaignId: string, encounterId: string) {
  try {
    sessionStorage.setItem(storageKey(campaignId), encounterId)
  } catch {
    // Blocked storage only costs the shortcut.
  }
}

export function recallEncounter(campaignId: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(campaignId))
  } catch {
    return null
  }
}
