import type { CampaignRepository } from '../domain/campaign'

export const demoCampaignRepository: CampaignRepository = {
  async list() {
    return [
      {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'The Sunken Coast',
        description: 'An old debt. A missing captain. A coastline that keeps its secrets.',
        created_at: '2026-10-27T00:00:00Z',
        role: 'dm',
        player_modules: ['party'],
      },
    ]
  },
  async invitations() {
    return []
  },
  async members() {
    return []
  },
  async sentInvitations() {
    return []
  },
  async revelations() {
    return []
  },
  async auditEvents() {
    return []
  },
  async create() {
    throw new Error('Read-only demo')
  },
  async invite() {
    throw new Error('Read-only demo')
  },
  async respond() {
    throw new Error('Read-only demo')
  },
  async revoke() {
    throw new Error('Read-only demo')
  },
  async changeMember() {
    throw new Error('Read-only demo')
  },
  async setModules() {
    throw new Error('Read-only demo')
  },
  async createRevelation() {
    throw new Error('Read-only demo')
  },
  async setRevelationVisibility() {
    throw new Error('Read-only demo')
  },
}
