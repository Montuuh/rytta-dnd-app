import { createContext, useContext } from 'react'
import type { Campaign } from './domain/campaign'
import { useCampaignView } from './view-context'
export const CampaignContext = createContext<Campaign | null>(null)
export function useCampaign() {
  const campaign = useContext(CampaignContext)
  const { playerPreview } = useCampaignView()
  if (!campaign) throw new Error('CampaignBoundary is required')
  return playerPreview ? { ...campaign, role: 'player' as const } : campaign
}
