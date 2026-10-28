import { z } from 'zod'

export const campaignSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  description: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  role: z.enum(['dm', 'player']),
})
export type Campaign = z.infer<typeof campaignSchema>
export interface CampaignRepository {
  list(signal?: AbortSignal): Promise<Campaign[]>
  invitations(signal?: AbortSignal): Promise<Invitation[]>
  members(campaignId: string, signal?: AbortSignal): Promise<Member[]>
  sentInvitations(campaignId: string, signal?: AbortSignal): Promise<SentInvitation[]>
  create(name: string, description: string): Promise<string>
  invite(campaignId: string, email: string): Promise<string>
  respond(invitationId: string, accept: boolean): Promise<string>
  revoke(invitationId: string): Promise<void>
  changeMember(campaignId: string, userId: string, role: 'dm' | 'player' | null): Promise<void>
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
