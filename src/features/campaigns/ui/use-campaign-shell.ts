import { config } from '@/shared/lib/config'
import type { Campaign } from '../domain/campaign'
import { campaignFromShell, readCampaignShell } from '../domain/campaign-shell'

interface ListQuery {
  data: Campaign[] | undefined
  isError: boolean
  fetchStatus: string
}

/**
 * RYT-160: the campaign kept on the device, for the header and navigation only, while the campaign
 * list has never loaded on this page (a reload without signal) and cannot load now.
 */
export function useCampaignShell(
  userId: string | undefined,
  campaignId: string | undefined,
  campaigns: ListQuery,
): Campaign | undefined {
  if (config.VITE_DATA_MODE !== 'supabase' || !userId || !campaignId || campaigns.data)
    return undefined
  if (!campaigns.isError && campaigns.fetchStatus !== 'paused') return undefined
  const shell = readCampaignShell(userId, campaignId)
  return shell ? campaignFromShell(shell) : undefined
}
