import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { useCampaign, useCampaignView } from '@/features/campaigns'
import { charactersQuery } from '@/features/characters'
import { carriedTenths, inventoryQuery } from '@/features/inventory'
import { changeShop, getShopAdmin, getStorefront, listOrders } from './data/repository'
import { ShopError, type ShopAction } from './domain/shops'

export const storefrontQuery = (userId: string, campaignId: string, characterId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'shops', 'storefront', characterId],
    queryFn: ({ signal }) => getStorefront(campaignId, characterId, signal),
    refetchInterval: 20_000,
  })
export const shopAdminQuery = (userId: string, campaignId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'shops', 'admin'],
    queryFn: ({ signal }) => getShopAdmin(campaignId, signal),
    refetchInterval: 20_000,
  })
export const ordersQuery = (userId: string, campaignId: string, characterId: string | null) =>
  queryOptions({
    queryKey: ['private', userId, 'campaign', campaignId, 'shops', 'orders', characterId ?? 'all'],
    queryFn: ({ signal }) => listOrders(campaignId, characterId, signal),
    refetchInterval: 20_000,
  })

/** Every shop mutation refreshes campaign-scoped data: gold, stock and inventory move together. */
export function useShopAction(campaignId: string) {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: ShopAction) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new ShopError('unavailable')
      return changeShop(campaignId, action)
    },
    onSettled: async (_data, error) => {
      if (controller?.getSnapshot().user?.id !== userId) return
      if (!error || (error instanceof ShopError && error.code !== 'unavailable'))
        await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
  })
}

/**
 * The character whose storefront is shown: the Player's assigned character, or the previewed
 * Player's for a DM in Player view. DMs outside the preview use the admin panel instead.
 */
export function useShopCharacter() {
  const { state } = useAuth()
  const campaign = useCampaign()
  const { previewUserId } = useCampaignView()
  const characters = useQuery(
    charactersQuery(state.user!.id, campaign.id, previewUserId ?? state.user!.id),
  )
  return { characters, selected: characters.data?.[0] ?? null }
}

/** Carried weight, strength and stacks from the RYT-004 inventory, for the cart and "you own". */
export function useHoldings(characterId: string | undefined) {
  const { state } = useAuth()
  const campaign = useCampaign()
  const inventory = useQuery({
    ...inventoryQuery(state.user!.id, campaign.id, characterId ?? ''),
    enabled: Boolean(characterId),
  })
  const data = inventory.data
  const definitions = new Map((data?.definitions ?? []).map((d) => [d.id, d]))
  return {
    definitions,
    stacks: data?.stacks ?? [],
    tenths: data ? carriedTenths(data.stacks, definitions) : 0,
    strength: data?.holder.str ?? null,
  }
}
