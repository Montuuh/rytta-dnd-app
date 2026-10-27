import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { config } from '@/shared/lib/config'
import type { CampaignRepository } from './domain/campaign'

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

export const campaignsQuery = (userId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaigns'],
    queryFn: async ({ signal }) => (await repository()).list(signal),
    refetchInterval: 20_000,
  })
export const invitationsQuery = (userId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'invitations'],
    queryFn: async ({ signal }) => (await repository()).invitations(signal),
    refetchInterval: 30_000,
  })
export const membersQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'members'],
    queryFn: async ({ signal }) => (await repository()).members(campaignId, signal),
    refetchInterval: 20_000,
  })
export const sentInvitationsQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'sent-invitations'],
    queryFn: async ({ signal }) => (await repository()).sentInvitations(campaignId, signal),
    refetchInterval: 30_000,
  })
export type CampaignAction =
  | { kind: 'create'; name: string; description: string }
  | { kind: 'invite'; campaignId: string; email: string }
  | { kind: 'respond'; invitationId: string; accept: boolean }
  | { kind: 'revoke'; invitationId: string }
  | { kind: 'member'; campaignId: string; userId: string; role: 'dm' | 'player' | null }

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
      }
    },
    onSuccess: async () => {
      if (controller?.getSnapshot().user?.id !== userId) return
      await client.cancelQueries({ queryKey: ['private', userId] })
      client.removeQueries({
        predicate: (q) =>
          q.queryKey[0] === 'private' && q.queryKey[1] === userId && q.queryKey[2] === 'campaign',
      })
      await client.invalidateQueries({ queryKey: ['private', userId] })
    },
  })
}
