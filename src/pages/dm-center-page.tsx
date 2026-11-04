import { CampaignMembers } from '@/features/campaigns'
import { BestiaryPanel } from '@/features/combat'
import { useCampaign, useCampaignView } from '@/features/campaigns'
import { ItemStore } from './item-store'

/** RYT-027 / ADR 028: one DM Command Center. The page composes the storeroom (inventory + shops)
 * and the bestiary (combat) into the campaigns feature so features stay independent. */
export function DmCenterPage() {
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm' && !playerPreview
  return (
    <CampaignMembers
      itemsPanel={dm ? <ItemStore campaignId={campaign.id} /> : undefined}
      bestiaryPanel={dm ? <BestiaryPanel campaignId={campaign.id} /> : undefined}
    />
  )
}
