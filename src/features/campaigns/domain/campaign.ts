import { z } from 'zod'

export const campaignModuleKeys = [
  'party',
  'inventory',
  'shops',
  'quests',
  'combat',
  'atlas',
  'glossary',
  'memories',
  'stronghold',
  'workshop',
] as const
export type CampaignModuleKey = (typeof campaignModuleKeys)[number]

export const campaignSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  description: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  role: z.enum(['dm', 'player']),
  player_modules: z.array(z.string()).default(['party']),
})
export type Campaign = z.infer<typeof campaignSchema>

export const revelationCategorySchema = z.enum(['shop', 'quest', 'atlas', 'glossary', 'npc'])
export type RevelationCategory = z.infer<typeof revelationCategorySchema>
export const revelationVisibilitySchema = z.enum(['dm_only', 'party'])
export type RevelationVisibility = z.infer<typeof revelationVisibilitySchema>

export const revelationSchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  title: z.string().min(1).max(120),
  category: revelationCategorySchema,
  summary: z.string().max(1000),
  visibility: revelationVisibilitySchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
})
export type Revelation = z.infer<typeof revelationSchema>

export const createRevelationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: revelationCategorySchema,
  summary: z.string().trim().max(1000),
  visibility: revelationVisibilitySchema,
})

export const auditEventSchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  character_id: z.uuid(),
  actor_id: z.uuid().nullable(),
  kind: z.string(),
  before_value: z.record(z.string(), z.unknown()).nullable(),
  after_value: z.record(z.string(), z.unknown()),
  created_at: z.iso.datetime({ offset: true }),
})
export type AuditEvent = z.infer<typeof auditEventSchema>

export interface CampaignRepository {
  list(signal?: AbortSignal): Promise<Campaign[]>
  invitations(signal?: AbortSignal): Promise<Invitation[]>
  members(campaignId: string, signal?: AbortSignal): Promise<Member[]>
  sentInvitations(campaignId: string, signal?: AbortSignal): Promise<SentInvitation[]>
  revelations(campaignId: string, signal?: AbortSignal): Promise<Revelation[]>
  auditEvents(campaignId: string, signal?: AbortSignal): Promise<AuditEvent[]>
  create(name: string, description: string): Promise<string>
  invite(campaignId: string, email: string): Promise<string>
  respond(invitationId: string, accept: boolean): Promise<string>
  revoke(invitationId: string): Promise<void>
  changeMember(campaignId: string, userId: string, role: 'dm' | 'player' | null): Promise<void>
  setModules(campaignId: string, modules: string[]): Promise<string[]>
  createRevelation(
    campaignId: string,
    input: {
      title: string
      category: RevelationCategory
      summary: string
      visibility: RevelationVisibility
    },
  ): Promise<string>
  setRevelationVisibility(
    campaignId: string,
    revelationId: string,
    visibility: RevelationVisibility,
  ): Promise<void>
}
export const invitationSchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  campaign_name: z.string(),
  character_id: z.uuid().nullable(),
  character_name: z.string().nullable(),
  email: z.email(),
  expires_at: z.iso.datetime({ offset: true }),
})
export const memberSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(['dm', 'player']),
  email: z.email(),
  display_name: z.string(),
})
export const sentInvitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  expires_at: z.iso.datetime({ offset: true }),
})
export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000),
})
export const inviteEmailSchema = z.email().max(254)
export type Invitation = z.infer<typeof invitationSchema>
export type Member = z.infer<typeof memberSchema>
export type SentInvitation = z.infer<typeof sentInvitationSchema>
export class MembershipError extends Error {
  readonly reason: 'last-dm' | 'already-member' | 'unavailable'
  constructor(reason: 'last-dm' | 'already-member' | 'unavailable') {
    super(reason)
    this.reason = reason
  }
}
