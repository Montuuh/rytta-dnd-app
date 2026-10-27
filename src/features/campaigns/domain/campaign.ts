import { z } from 'zod'

export const campaignSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  description: z.string(),
  created_at: z.iso.datetime({ offset: true }),
})
export type Campaign = z.infer<typeof campaignSchema>
export interface CampaignRepository {
  list(signal?: AbortSignal): Promise<Campaign[]>
}
