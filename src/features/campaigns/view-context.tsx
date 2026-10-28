import { createContext, useContext } from 'react'
export const CampaignViewContext = createContext({ playerPreview: false })
export const useCampaignView = () => useContext(CampaignViewContext)
