import { createContext, useContext } from 'react'

export type CampaignView = {
  playerPreview: boolean
  previewUserId: string | null
  previewLabel: string | null
}

export const CampaignViewContext = createContext<CampaignView>({
  playerPreview: false,
  previewUserId: null,
  previewLabel: null,
})
export const useCampaignView = () => useContext(CampaignViewContext)
