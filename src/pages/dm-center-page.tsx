import { useQuery } from '@tanstack/react-query'
import { Navigate, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  CampaignMembers,
  QueryFeedback,
  membersQuery,
  partySuggested,
  useCampaign,
  useCampaignView,
  type PartyCharacter,
} from '@/features/campaigns'
import { BestiaryPanel } from '@/features/combat'
import { CampaignContentPanel } from '@/features/campaign-content'
import {
  characterRosterQuery,
  hasActiveCharacter,
  MemberCharacterLine,
  MemberCharacterSheet,
  partyOverviewQuery,
} from '@/features/characters'
import { usePendingProposalCount } from '@/features/inventory'
import { useAuth } from '@/features/auth'
import { ItemStore } from './item-store'

export function DmCenterPage() {
  const campaign = useCampaign()
  const [params] = useSearchParams()
  // RYT-179: Prepare session is no longer a panel; its steps are pending work on the home.
  if (params.get('panel') === 'prepare') return <Navigate to={`/campaign/${campaign.id}`} replace />
  return <DmCenter />
}

function DmCenter() {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const { state } = useAuth()
  const { playerPreview } = useCampaignView()
  const [params] = useSearchParams()
  const dm = campaign.role === 'dm' && !playerPreview
  const encounter = params.get('panel') === 'bestiary' ? params.get('encounter') : null
  const focusedBestiary = dm && Boolean(encounter)
  const manage = dm && !focusedBestiary
  const roster = useQuery({ ...characterRosterQuery(state.user!.id, campaign.id), enabled: manage })
  const party = useQuery({ ...partyOverviewQuery(state.user!.id, campaign.id), enabled: manage })
  const members = useQuery({ ...membersQuery(state.user!.id, campaign.id), enabled: manage })
  const proposals = usePendingProposalCount(campaign.id, manage)
  if (focusedBestiary) return <BestiaryPanel key={encounter} campaignId={campaign.id} />

  // RYT-180: the Party level panel lists the party's characters with their Player and level. The
  // campaigns feature takes them as plain data; the Player comes from the roster and the members.
  const partyCharacters: PartyCharacter[] | undefined = party.data?.map((row) => {
    const owner = roster.data?.find((entry) => entry.id === row.id)?.user_id
    const ownerName = members.data?.find((member) => member.user_id === owner)?.display_name
    return {
      id: row.id,
      name: row.name,
      ownerName: row.is_assigned ? ownerName : null,
      level: row.sheet_status === 'complete' ? row.level : null,
      below: Boolean(row.below_party_level),
      draft: row.sheet_status !== 'complete',
      href: `/campaign/${campaign.id}/party/${row.id}`,
    }
  })

  return (
    <CampaignMembers
      itemsPanel={dm ? <ItemStore campaignId={campaign.id} /> : undefined}
      bestiaryPanel={dm ? <BestiaryPanel campaignId={campaign.id} /> : undefined}
      contentPanel={
        dm ? (
          <CampaignContentPanel campaignId={campaign.id} title={t('dm.panelContent')} />
        ) : undefined
      }
      rosterFeedback={
        <QueryFeedback
          pending={roster.isPending}
          error={roster.isError}
          cause={roster.error}
          retry={() => void roster.refetch()}
        />
      }
      memberCharacters={(member) =>
        roster.isSuccess &&
        (member.role === 'player' || hasActiveCharacter(roster.data, member.user_id)) ? (
          <MemberCharacterLine
            campaignId={campaign.id}
            userId={member.user_id}
            roster={roster.data}
            showEmpty={member.role === 'player'}
          />
        ) : null
      }
      memberCharacterSheet={(member, sheet) =>
        roster.isSuccess ? (
          <MemberCharacterSheet
            campaignId={campaign.id}
            userId={member.user_id}
            roster={roster.data}
            manage={member.role === 'player'}
            {...sheet}
          />
        ) : null
      }
      pendingProposals={proposals}
      partySuggested={partySuggested(party.data)}
      partyCharacters={partyCharacters}
      partyFeedback={
        <QueryFeedback
          pending={party.isPending}
          error={party.isError}
          cause={party.error}
          retry={() => void party.refetch()}
        />
      }
    />
  )
}
