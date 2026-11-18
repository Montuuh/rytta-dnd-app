const visitKey = (userId: string, campaignId: string) =>
  `rytta-campaign-visit:${userId}:${campaignId}`
const visits = new Map<string, number>()

export function recordCampaignVisit(userId: string, campaignId: string) {
  const key = visitKey(userId, campaignId)
  const visitedAt = Date.now()
  visits.set(key, visitedAt)
  try {
    localStorage.setItem(key, String(visitedAt))
  } catch {
    // The visit remains available until the browser reloads.
  }
}

export function readCampaignVisit(userId: string, campaignId: string) {
  const key = visitKey(userId, campaignId)
  try {
    const visitedAt = Number(localStorage.getItem(key))
    if (visitedAt > 0 && !Number.isNaN(new Date(visitedAt).getTime()))
      return Math.max(visitedAt, visits.get(key) ?? 0)
  } catch {
    // Storage may be unavailable on this device.
  }
  return visits.get(key)
}
