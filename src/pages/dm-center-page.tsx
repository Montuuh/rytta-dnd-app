import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CampaignMembers,
  QueryFeedback,
  partyBelow,
  partySuggested,
  useCampaign,
  useCampaignView,
} from '@/features/campaigns'
import { BestiaryPanel } from '@/features/combat'
import {
  characterRosterQuery,
  MemberCharacterDialog,
  MemberCharacters,
  partyOverviewQuery,
  type MemberCharacterChoice,
} from '@/features/characters'
import { usePendingProposalCount } from '@/features/inventory'
import { useAuth } from '@/features/auth'
import { ItemStore } from './item-store'

export function DmCenterPage() {
  const campaign = useCampaign()
  const { state } = useAuth()
  const { playerPreview } = useCampaignView()
  const dm = campaign.role === 'dm' && !playerPreview
  const roster = useQuery({ ...characterRosterQuery(state.user!.id, campaign.id), enabled: dm })
  const party = useQuery({ ...partyOverviewQuery(state.user!.id, campaign.id), enabled: dm })
  const proposals = usePendingProposalCount(campaign.id, dm)
  const [choice, setChoice] = useState<MemberCharacterChoice | null>(null)
  return (
    <>
      <CampaignMembers
        itemsPanel={dm ? <ItemStore campaignId={campaign.id} /> : undefined}
        bestiaryPanel={dm ? <BestiaryPanel campaignId={campaign.id} /> : undefined}
        roster={roster.isSuccess ? roster.data : undefined}
        rosterFeedback={
          <QueryFeedback
            pending={roster.isPending}
            error={roster.isError}
            cause={roster.error}
            retry={() => void roster.refetch()}
          />
        }
        memberCharacters={(member) =>
          roster.isSuccess && (
            <MemberCharacters
              campaignId={campaign.id}
              userId={member.user_id}
              roster={roster.data}
              choose={(mode) => setChoice({ ...member, mode })}
            />
          )
        }
        onAssign={(member) => setChoice({ ...member, mode: 'assign' })}
        pendingProposals={proposals}
        partySuggested={partySuggested(party.data)}
        partyBelow={partyBelow(party.data)}
      />
      {dm && choice && roster.data && (
        <MemberCharacterDialog
          choice={choice}
          campaignId={campaign.id}
          roster={roster.data}
          close={() => setChoice(null)}
        />
      )}
    </>
  )
}
