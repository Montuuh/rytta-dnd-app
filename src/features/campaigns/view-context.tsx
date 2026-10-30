import { createContext, useContext } from 'react'

export type CampaignView = {
  playerPreview: boolean
  previewUserId: string | null
  previewLabel: string | null
  enterPreview?: (userId: string | null, label: string | null) => void
  exitPreview?: () => void
}

export const CampaignViewContext = createContext<CampaignView>({
  playerPreview: false,
  previewUserId: null,
  previewLabel: null,
})
export const useCampaignView = () => useContext(CampaignViewContext)
