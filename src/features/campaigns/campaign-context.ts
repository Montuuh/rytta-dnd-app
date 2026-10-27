import { createContext, useContext } from 'react'
import type { Campaign } from './domain/campaign'
export const CampaignContext = createContext<Campaign | null>(null)
export function useCampaign() {
  const campaign = useContext(CampaignContext)
  if (!campaign) throw new Error('CampaignBoundary is required')
  return campaign
}
