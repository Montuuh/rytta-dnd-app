import { queryOptions } from '@tanstack/react-query'
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

// Add user identity to private query keys when RYT-001 supplies the auth provider.
// Clear the QueryClient on sign-out or identity change before enabling that flow.
export const campaignsQuery = queryOptions({
  queryKey: ['campaigns', config.VITE_DATA_MODE],
  queryFn: async ({ signal }) => (await repository()).list(signal),
})
