import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { catalogueSearchQuery, type CatalogueItem } from '@/features/inventory'

/**
 * RYT-104/106: description and picture of the items this viewer may see (their own carried
 * items), keyed by definition. Trade rows carry neither, so the partner's items keep the icon.
 */
export function useItemDetails(campaignId: string) {
  const { state } = useAuth()
  const query = useQuery({
    ...catalogueSearchQuery(state.user?.id ?? 'anon', campaignId, '', 200),
    enabled: Boolean(state.user),
    staleTime: 60_000,
  })
  return new Map<string, CatalogueItem>((query.data ?? []).map((item) => [item.id, item]))
}
