import { z } from 'zod'
import { conditionKeys } from './srd'

/** One row of get_party_overview (RYT-031). Players only receive live, non-economic fields. */
export const partyMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  is_own: z.boolean(),
  is_assigned: z.boolean(),
  shares_live: z.boolean(),
  sheet_status: z.enum(['draft', 'complete']).nullable(),
  class_key: z.string().nullable(),
  class_label: z.string().nullable(),
  level: z.number().int().nullable(),
  current_hp: z.number().int().nullable(),
  max_hp: z.number().int().nullable(),
  temp_hp: z.number().int().nullable(),
  armor_class: z.number().int().nullable(),
  exhaustion: z.number().int().nullable(),
  conditions: z.array(z.enum(conditionKeys)).nullable(),
})
export type PartyMember = z.infer<typeof partyMemberSchema>

export type HpTone = 'healthy' | 'wounded' | 'critical'
export function hpTone(current: number, max: number): { ratio: number; tone: HpTone } {
  const ratio = Math.min(100, Math.max(0, Math.round((current / Math.max(1, max)) * 100)))
  return { ratio, tone: ratio > 50 ? 'healthy' : ratio > 25 ? 'wounded' : 'critical' }
}

/** Teammates a Player sees: assigned, shared, not the viewer's own character. */
export function sharedTeammates(rows: PartyMember[], ownIds: ReadonlySet<string>) {
  return rows.filter(
    (row) => !row.is_own && !ownIds.has(row.id) && row.is_assigned && row.shares_live,
  )
}
