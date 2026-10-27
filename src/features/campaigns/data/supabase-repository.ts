import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/api/database.types'
import { campaignSchema, type CampaignRepository } from '../domain/campaign'
import { CampaignAccessError } from '../domain/errors'

export function createSupabaseCampaignRepository(
  client: SupabaseClient<Database>,
): CampaignRepository {
  return {
    async list(signal) {
      const {
        data: { session },
        error: authError,
      } = await client.auth.getSession()
      if (authError) throw authError
      if (!session) throw new CampaignAccessError('sign-in')
      let query = client
        .from('campaigns')
        .select('id, name, description, created_at')
        .order('created_at', { ascending: false })
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      if (error) throw new CampaignAccessError('unavailable')
      return campaignSchema.array().parse(data)
    },
  }
}
