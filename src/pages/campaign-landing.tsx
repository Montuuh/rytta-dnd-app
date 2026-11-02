import { Navigate } from 'react-router'
import { useCampaign, useCampaignView } from '@/features/campaigns'

/** RYT-029: a campaign has no home page of its own. Players land on Party; the DM lands on
 * the DM Command Center, which also holds module visibility and the storeroom. While the DM
 * previews the Player view, the Player landing applies. */
export function CampaignLanding() {
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm' && !playerPreview
  return <Navigate to={`/campaign/${campaign.id}/${dm ? 'members' : 'party'}`} replace />
}
