import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { config } from '@/shared/lib/config'
import { slowPollMs } from '@/shared/lib/live-poll'
import type { CampaignRepository } from './domain/campaign'
import { setDiceSettings, setPartyLevel } from './data/settings-repository'
import { CampaignSettingsError, type DiceSettings } from './domain/settings'

async function repository(): Promise<CampaignRepository> {
  if (config.VITE_DATA_MODE === 'demo')
    return (await import('./data/demo-repository')).demoCampaignRepository
  const [{ getSupabase }, { createSupabaseCampaignRepository }] = await Promise.all([
    import('@/shared/api/supabase'),
    import('./data/supabase-repository'),
  ])
  return createSupabaseCampaignRepository(
    getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!),
  )
}

/**
 * Campaigns, invitations and members have no realtime channel. A visible tab re-reads them every
 * minute, on focus and on reconnect, and the user's own mutations invalidate them at once, so a
 * removed member or a module switch reaches the other tabs within a minute.
 */
const campaignPoll = {
  refetchInterval: slowPollMs,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const

export const campaignsQuery = (userId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaigns'],
    queryFn: async ({ signal }) => (await repository()).list(signal),
    ...campaignPoll,
  })
export const invitationsQuery = (userId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'invitations'],
    queryFn: async ({ signal }) => (await repository()).invitations(signal),
    ...campaignPoll,
  })
export const membersQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'members'],
    queryFn: async ({ signal }) => (await repository()).members(campaignId, signal),
    ...campaignPoll,
  })
export const sentInvitationsQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'sent-invitations'],
    queryFn: async ({ signal }) => (await repository()).sentInvitations(campaignId, signal),
    ...campaignPoll,
  })
export const auditEventsQuery = (userId: string, campaignId: string, characterId?: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'audit-events', characterId ?? 'all'],
    queryFn: async ({ signal }) =>
      (await repository()).auditEvents(campaignId, signal, characterId),
    ...campaignPoll,
  })
export type CampaignAction =
  | { kind: 'create'; name: string; description: string }
  | { kind: 'invite'; campaignId: string; email: string }
  | { kind: 'respond'; invitationId: string; accept: boolean }
  | { kind: 'revoke'; invitationId: string }
  | { kind: 'member'; campaignId: string; userId: string; role: 'dm' | 'player' | null }
  | { kind: 'modules'; campaignId: string; modules: string[] }

export function useCampaignAction() {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const client = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: CampaignAction) => {
      if (!navigator.onLine) throw new Error('Offline')
      if (!userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('Sign in required')
      const repo = await repository()
      if (controller?.getSnapshot().user?.id !== userId) throw new Error('Identity changed')
      switch (action.kind) {
        case 'create':
          return repo.create(action.name, action.description)
        case 'invite':
          return repo.invite(action.campaignId, action.email)
        case 'respond':
          return repo.respond(action.invitationId, action.accept)
        case 'revoke':
          return repo.revoke(action.invitationId)
        case 'member':
          return repo.changeMember(action.campaignId, action.userId, action.role)
        case 'modules':
          return repo.setModules(action.campaignId, action.modules)
      }
    },
    onSuccess: async (_result, action) => {
      if (controller?.getSnapshot().user?.id !== userId) return
      await client.cancelQueries({ queryKey: ['private', userId] })
      // Module toggles never change who may read the campaign, so cached rows can stay
      // mounted (keeping keyboard focus on the toggled switch) while they refetch. Membership
      // and role changes still drop private campaign data before refetching.
      if (action.kind !== 'modules')
        client.removeQueries({
          predicate: (q) =>
            q.queryKey[0] === 'private' && q.queryKey[1] === userId && q.queryKey[2] === 'campaign',
        })
      await client.invalidateQueries({ queryKey: ['private', userId] })
    },
  })
}

/**
 * RYT-130: the DM sets (or clears) the party level. Each intent carries one request id; pressing
 * the retry with the same id never applies twice. Campaigns, characters and the audit trail
 * reload, so the Players' prompt and the DM's count follow.
 */
export function useSetPartyLevel(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const client = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (input: { level: number | null; requestId: string }) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new CampaignSettingsError('unavailable')
      return setPartyLevel(campaignId, input.level, input.requestId)
    },
    onSuccess: async () => {
      if (controller?.getSnapshot().user?.id !== userId) return
      await client.invalidateQueries({ queryKey: ['private', userId] })
    },
  })
}

/**
 * RYT-133: the DM sets how the table rolls and who reads the rolls. Each intent carries one
 * request id, as the party level does; the campaign list reloads so every screen follows.
 */
export function useSetDiceSettings(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const client = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (input: { settings: DiceSettings; requestId: string }) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new CampaignSettingsError('unavailable')
      return setDiceSettings(campaignId, input.settings, input.requestId)
    },
    onSuccess: async () => {
      if (controller?.getSnapshot().user?.id !== userId) return
      await client.invalidateQueries({ queryKey: ['private', userId] })
    },
  })
}
