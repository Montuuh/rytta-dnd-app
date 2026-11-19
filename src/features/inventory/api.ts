import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import {
  archiveDefinition,
  changeInventory,
  loadDefinitionImpact,
  syncListingPrices,
  loadCatalogue,
  itemImageTtlSeconds,
  itemImageUrl,
  listCampaignPortraits,
  listLootBatches,
  deleteLootBatch,
  distributeLoot,
  type LootRequest,
  listRoster,
  loadInventory,
  portraitUrl,
  removePortrait,
  uploadPortrait,
  cancelItemProposal,
  importBasicItems,
  listItemProposals,
  mergeItemDefinitions,
  proposeItem,
  resolveItemProposal,
  searchCampaignItems,
  setItemTemplate,
  type ProposalInput,
  type Resolution,
} from './data/repository'
import { loadBasicItemDescriptions, loadBasicItems } from './domain/basic-items'
import type { ImportItem } from './domain/catalogue'
import type { InventoryAction } from './domain/item'

export const inventoryQuery = (userId: string, campaignId: string, characterId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'inventory', characterId],
    queryFn: ({ signal }) => loadInventory(campaignId, characterId, signal),
    refetchInterval: 20_000,
  })
export const rosterQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'inventory', 'roster'],
    queryFn: ({ signal }) => listRoster(campaignId, signal),
    refetchInterval: 20_000,
  })
export const campaignPortraitsQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'portraits'],
    queryFn: ({ signal }) => listCampaignPortraits(campaignId, signal),
    refetchInterval: 60_000,
  })
/** Map of character id → portrait path for every face this viewer may see in a campaign. */
export function useCampaignPortraits(campaignId: string) {
  const { state } = useAuth()
  const query = useQuery({
    ...campaignPortraitsQuery(state.user?.id ?? 'anon', campaignId),
    enabled: Boolean(state.user),
  })
  return query.data ?? new Map<string, string>()
}
export const portraitQuery = (userId: string, path: string | null) =>
  queryOptions({
    queryKey: ['private', userId, 'portrait', path],
    queryFn: () => portraitUrl(path!),
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
  })

function useGuard() {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  return {
    userId,
    current: () =>
      navigator.onLine && Boolean(userId) && controller?.getSnapshot().user?.id === userId,
  }
}

export function useInventoryAction(campaignId: string) {
  const { userId, current } = useGuard()
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: InventoryAction) => {
      if (!current()) throw new Error('unavailable')
      return changeInventory(campaignId, action)
    },
    onSettled: async (_data, error) => {
      if (!current() || (error && !['stale', 'conflict', 'occupied'].includes(error.message)))
        return
      // Equipment moves AC on the sheet, so refresh the whole campaign character scope.
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ['private', userId, 'campaign', campaignId],
        }),
        cache.invalidateQueries({
          queryKey: ['private', userId, 'campaign', campaignId, 'characters'],
        }),
      ])
    },
  })
}

export function usePortraitUpload(campaignId: string, characterId: string) {
  const { userId, current } = useGuard()
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (image: Blob) => {
      if (!current()) throw new Error('unavailable')
      return uploadPortrait(campaignId, characterId, image)
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
}

export function usePortraitRemove(campaignId: string, characterId: string) {
  const { userId, current } = useGuard()
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async () => {
      if (!current()) throw new Error('unavailable')
      return removePortrait(campaignId, characterId)
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
}

export const catalogueQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'catalogue'],
    queryFn: ({ signal }) => loadCatalogue(campaignId, signal),
    refetchInterval: 20_000,
  })
export const definitionImpactQuery = (userId: string, campaignId: string, definitionId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'catalogue', 'impact', definitionId],
    queryFn: ({ signal }) => loadDefinitionImpact(campaignId, definitionId, signal),
    staleTime: 0,
    retry: false,
  })

/** RYT-032 soft delete and price sync; both refresh the campaign scope (shops and satchels). */
export function useItemLifecycle(campaignId: string) {
  const { userId, current } = useGuard()
  const cache = useQueryClient()
  const refresh = async () => {
    if (current())
      await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
  }
  const archive = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (input: { definitionId: string; revision: number; requestId: string }) => {
      if (!current()) throw new Error('unavailable')
      return archiveDefinition(campaignId, input.definitionId, input.revision, input.requestId)
    },
    onSettled: refresh,
  })
  const syncPrices = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (input: {
      definitionId: string
      listingIds: string[]
      price: number
      requestId: string
    }) => {
      if (!current()) throw new Error('unavailable')
      return syncListingPrices(
        campaignId,
        input.definitionId,
        input.listingIds,
        input.price,
        input.requestId,
      )
    },
    onSettled: refresh,
  })
  return { archive, syncPrices }
}

/** Re-sign ten minutes before the signed URL expires; signing is batched per screen. */
export const itemImageRefreshMs = (itemImageTtlSeconds - 600) * 1000
export const itemImageQuery = (userId: string | undefined, path?: string | null) =>
  queryOptions({
    queryKey: ['private', userId, 'item-image', path],
    queryFn: () => itemImageUrl(path!),
    enabled: Boolean(userId && path),
    staleTime: itemImageRefreshMs,
    refetchInterval: itemImageRefreshMs,
    retry: false,
  })

// RYT-104/105 catalogue: search, templates, basic import, proposals and merges.
export const catalogueSearchQuery = (
  userId: string,
  campaignId: string,
  search: string,
  limit = 50,
) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'catalogue', 'search', search, limit],
    queryFn: ({ signal }) => searchCampaignItems(campaignId, search, limit, signal),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  })
export const proposalsQuery = (userId: string, campaignId: string, characterId: string | null) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'proposals', characterId ?? 'all'],
    queryFn: ({ signal }) => listItemProposals(campaignId, characterId, signal),
    refetchInterval: 20_000,
  })

/** Every catalogue write refreshes the whole campaign scope: satchels, shops and the storeroom. */
function useCatalogueMutation<Input, Output>(
  campaignId: string,
  run: (input: Input) => Promise<Output>,
) {
  const { userId, current } = useGuard()
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (input: Input) => {
      if (!current()) throw new Error('unavailable')
      return run(input)
    },
    onSettled: async () => {
      if (current())
        await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
}

export function useItemTemplate(campaignId: string) {
  return useCatalogueMutation(
    campaignId,
    (input: { definitionId: string; template: boolean; revision: number; requestId: string }) =>
      setItemTemplate(
        campaignId,
        input.definitionId,
        input.template,
        input.revision,
        input.requestId,
      ),
  )
}
/**
 * DM import of basic catalogue items. Errors are Error('cents') when the server does not take
 * cent prices yet, else the inventory codes ('forbidden', 'unavailable'…).
 */
export function useBasicImport(campaignId: string) {
  return useCatalogueMutation(
    campaignId,
    (input: { items: ImportItem[]; requestId: string; updateExisting?: boolean }) =>
      importBasicItems(campaignId, input.items, input.requestId, input.updateExisting),
  )
}

/** The bundled basic catalogue and both description files: application content, loaded once. */
export const basicCatalogueQuery = () =>
  queryOptions({
    queryKey: ['static', 'basic-items'],
    queryFn: async () => {
      const [items, en, es] = await Promise.all([
        loadBasicItems(),
        loadBasicItemDescriptions('en'),
        loadBasicItemDescriptions('es'),
      ])
      return { items, descriptions: { en, es } }
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
export function useProposeItem(campaignId: string) {
  return useCatalogueMutation(campaignId, (input: ProposalInput) => proposeItem(campaignId, input))
}
export function useCancelProposal(campaignId: string) {
  return useCatalogueMutation(
    campaignId,
    (input: { proposalId: string; revision: number; requestId: string }) =>
      cancelItemProposal(campaignId, input.proposalId, input.revision, input.requestId),
  )
}
export function useResolveProposal(campaignId: string) {
  return useCatalogueMutation(
    campaignId,
    (input: {
      proposal: { id: string; revision: number }
      decision: Resolution & { note: string }
      requestId: string
    }) => resolveItemProposal(campaignId, input.proposal, input.decision, input.requestId),
  )
}
export function useMergeItems(campaignId: string) {
  return useCatalogueMutation(
    campaignId,
    (input: {
      source: { id: string; revision: number }
      target: { id: string; revision: number }
      requestId: string
    }) => mergeItemDefinitions(campaignId, input.source, input.target, input.requestId),
  )
}

/** RYT-105: pending proposals of the campaign, for the DM's storeroom entry points. */
export function usePendingProposalCount(campaignId: string, enabled: boolean) {
  const { state } = useAuth()
  const query = useQuery({
    ...proposalsQuery(state.user?.id ?? 'anon', campaignId, null),
    enabled: enabled && Boolean(state.user),
  })
  return query.data?.filter((proposal) => proposal.status === 'pending').length ?? 0
}

export const lootBatchesQuery = (userId: string, campaignId: string, after: string | null) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'loot-batches', after],
    queryFn: ({ signal }) => listLootBatches(campaignId, after, signal),
  })
export function useDistributeLoot(campaignId: string) {
  return useCatalogueMutation(campaignId, (input: LootRequest) => distributeLoot(campaignId, input))
}

export function useDeleteLootBatch(campaignId: string) {
  return useCatalogueMutation(campaignId, (input: { id: string; requestId: string }) =>
    deleteLootBatch(campaignId, input.id, input.requestId),
  )
}
