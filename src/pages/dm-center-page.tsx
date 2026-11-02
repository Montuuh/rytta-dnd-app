import { CampaignMembers } from '@/features/campaigns'
import { useCampaign, useCampaignView } from '@/features/campaigns'
import { ItemStore } from './item-store'

/** RYT-027: one DM Command Center. The page composes the storeroom (inventory + shops) into
 * the campaigns feature so features stay independent of each other. */
export function DmCenterPage() {
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm' && !playerPreview
  return <CampaignMembers itemsPanel={dm ? <ItemStore campaignId={campaign.id} /> : undefined} />
}
