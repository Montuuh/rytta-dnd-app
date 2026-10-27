import type { CampaignRepository } from '../domain/campaign'

export const demoCampaignRepository: CampaignRepository = {
  async list() {
    return [
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'The Sunken Coast',
        description: 'An old debt. A missing captain. A coastline that keeps its secrets.',
        created_at: '2026-10-27T00:00:00Z',
      },
    ]
  },
}
