import { z } from 'zod'
import { diceModes, partyLevelSchema, rollVisibilities } from './settings'

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
  'tabletop',
] as const
export type CampaignModuleKey = (typeof campaignModuleKeys)[number]

export const campaignSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  description: z.string(),
  created_at: z.iso.datetime({ offset: true }),
  role: z.enum(['dm', 'player']),
  player_modules: z.array(z.string()).default(['party']),
  /** RYT-130: the level the DM set for the party; null until set (or before the migration). */
  party_level: partyLevelSchema.nullable().default(null),
  /** RYT-133: how the table rolls and who reads the rolls; defaults match the database. */
  dice_mode: z.enum(diceModes).default('physical'),
  roll_visibility: z.enum(rollVisibilities).default('roller_dm'),
})
export type Campaign = z.infer<typeof campaignSchema>

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
  auditEvents(campaignId: string, signal?: AbortSignal, characterId?: string): Promise<AuditEvent[]>
  create(
    name: string,
    description: string,
    chosen?: { pack: string; category: string }[],
  ): Promise<string>
  invite(campaignId: string, email: string): Promise<string>
  respond(invitationId: string, accept: boolean): Promise<string>
  revoke(invitationId: string): Promise<void>
  changeMember(campaignId: string, userId: string, role: 'dm' | 'player' | null): Promise<void>
  setModules(campaignId: string, modules: string[]): Promise<string[]>
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
/** Why a campaign or membership action failed; each value has an `action.<reason>` text. */
export type MembershipReason =
  | 'last-dm'
  | 'already-member'
  | 'campaign-limit'
  | 'member-limit'
  | 'too-many-invitations'
  | 'recipient-limit'
  | 'invitation-declined'
  /** Answering an invitation that expired, was revoked or belongs to another account. */
  | 'invitation-unavailable'
  | 'unavailable'
export class MembershipError extends Error {
  readonly reason: MembershipReason
  constructor(reason: MembershipReason) {
    super(reason)
    this.reason = reason
  }
}
const membershipMessages: [string, MembershipReason][] = [
  ['Keep at least one DM', 'last-dm'],
  ['Already a member', 'already-member'],
  // RYT-113 quotas and invitation throttles.
  ['Campaign limit', 'campaign-limit'],
  ['Member limit', 'member-limit'],
  ['Too many invitations', 'too-many-invitations'],
  ['Recipient invitation limit', 'recipient-limit'],
  ['Invitation declined', 'invitation-declined'],
]
/** Maps a database error message of the campaign RPCs to a typed reason. */
export function membershipReason(message: string): MembershipReason {
  return membershipMessages.find(([text]) => message.includes(text))?.[1] ?? 'unavailable'
}

/** RYT-095: why the viewer cannot leave yet. A DM waits for the member list ('checking') and is
 * blocked as the only DM; a list that failed to load does not block, because PostgreSQL keeps at
 * least one DM anyway. Presentation only. */
export type LeaveBlock = 'checking' | 'last-dm' | null
export function leaveBlock(
  role: Campaign['role'],
  members: readonly Pick<Member, 'role'>[] | undefined,
  failed = false,
): LeaveBlock {
  if (role !== 'dm' || failed) return null
  if (!members) return 'checking'
  return members.filter((member) => member.role === 'dm').length <= 1 ? 'last-dm' : null
}

/** Router state My campaigns reads after a member leaves (RYT-095). */
export const leftCampaignState = z.object({ leftCampaign: z.string().min(1).max(100) })
