import { useQuery } from '@tanstack/react-query'
import { CampaignMembers, partyBelow, partySuggested } from '@/features/campaigns'
import { BestiaryPanel } from '@/features/combat'
import { charactersQuery, partyOverviewQuery } from '@/features/characters'
import { useAuth } from '@/features/auth'
import { useCampaign, useCampaignView } from '@/features/campaigns'
import { ItemStore } from './item-store'

/** RYT-027 / ADR 028: one DM Command Center. The page composes the storeroom (inventory + shops)
 * and the bestiary (combat) into the campaigns feature so features stay independent. The
 * character count (RYT-112) comes from the same query the party list uses. */
export function DmCenterPage() {
  const campaign = useCampaign()
  const { state } = useAuth()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm' && !playerPreview
  const characters = useQuery({ ...charactersQuery(state.user!.id, campaign.id), enabled: dm })
  const party = useQuery({ ...partyOverviewQuery(state.user!.id, campaign.id), enabled: dm })
  return (
    <CampaignMembers
      itemsPanel={dm ? <ItemStore campaignId={campaign.id} /> : undefined}
      bestiaryPanel={dm ? <BestiaryPanel campaignId={campaign.id} /> : undefined}
      characterCount={characters.isError ? undefined : characters.data?.length}
      partySuggested={partySuggested(party.data)}
      partyBelow={partyBelow(party.data)}
    />
  )
}
