import { z } from 'zod'

/** RYT-153: what the admin RPCs return. Every response is validated before it reaches a screen. */
export const adminStatusSchema = z.object({
  super_admin: z.boolean(),
  access: z.array(z.object({ campaign_id: z.uuid(), expires_at: z.string() })),
})
export type AdminStatus = z.infer<typeof adminStatusSchema>

export const adminCampaignSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  created_at: z.string(),
  members: z.number().int(),
  dms: z.array(z.string().nullable()),
  last_activity: z.string().nullable(),
  favourite: z.boolean(),
  access_expires_at: z.string().nullable(),
})
export type AdminCampaign = z.infer<typeof adminCampaignSchema>

export const adminSummarySchema = adminCampaignSchema.extend({
  description: z.string().nullable(),
  players: z.number().int(),
  characters: z.number().int(),
  encounters: z.number().int(),
  dm_emails: z.array(z.string().nullable()),
  viewer_role: z.enum(['dm', 'player']).nullable(),
})
export type AdminSummary = z.infer<typeof adminSummarySchema>

export const adminAccessSchema = z.object({ campaign_id: z.uuid(), expires_at: z.string() })

export const auditEntrySchema = z.object({
  id: z.uuid(),
  at: z.string(),
  action: z.enum(['enter', 'exit', 'favourite', 'unfavourite', 'account_lookup']),
  actor: z.string().nullable(),
  campaign_id: z.uuid().nullable(),
  campaign: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
})
export type AuditEntry = z.infer<typeof auditEntrySchema>

export const usageRowSchema = z.object({
  cohort_week: z.string(),
  campaigns: z.number().int(),
  activation_denominator: z.number().int(),
  activated_settled: z.number().int(),
  solo_preparation: z.number().int(),
  return_denominator: z.number().int(),
  returned_settled: z.number().int(),
  returned_so_far: z.number().int(),
})
export type UsageRow = z.infer<typeof usageRowSchema>

export const accountSchema = z.object({
  email: z.string().nullable(),
  username: z.string().nullable(),
  created_at: z.string().nullable(),
  last_sign_in_at: z.string().nullable(),
  providers: z.array(z.string()),
  campaigns: z.array(z.object({ id: z.uuid(), name: z.string(), role: z.enum(['dm', 'player']) })),
})
export type Account = z.infer<typeof accountSchema>

/** A percentage of a settled denominator, or null while nothing has settled. */
export function share(part: number, whole: number) {
  return whole > 0 ? Math.round((1000 * part) / whole) / 10 : null
}

export type AdminErrorCode = 'forbidden' | 'notFound' | 'invalid' | 'unavailable'
export function adminErrorCode(message: string): AdminErrorCode {
  if (/Forbidden|permission denied/i.test(message)) return 'forbidden'
  if (/not found/i.test(message)) return 'notFound'
  if (/Invalid/i.test(message)) return 'invalid'
  return 'unavailable'
}
