import { z } from 'zod'
import { conditionKeys, type Condition } from './srd'

/** One row of get_party_overview (RYT-031). Players only receive live, non-economic fields;
 * for teammates the DM does not share (RYT-097) every live field arrives null. */
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

/** Teammates a Player sees (RYT-097): every assigned character that is not the viewer's,
 * shared live or not. */
export function partyTeammates(rows: PartyMember[], ownIds: ReadonlySet<string>) {
  return rows.filter((row) => !row.is_own && !ownIds.has(row.id) && row.is_assigned)
}

export type TeammateLive = {
  current: number
  max: number
  temp: number
  armorClass: number | null
  exhaustion: number
  conditions: Condition[]
  ratio: number
  tone: HpTone
}

/** A teammate's live state, or null when it is not shared or the sheet is not finished. A DM
 * previewing a Player receives every field, so sharing decides, not the presence of data. */
export function teammateLive(member: PartyMember): TeammateLive | null {
  if (!member.shares_live || member.sheet_status !== 'complete') return null
  if (member.current_hp === null || member.max_hp === null) return null
  return {
    current: member.current_hp,
    max: member.max_hp,
    temp: member.temp_hp ?? 0,
    armorClass: member.armor_class,
    exhaustion: member.exhaustion ?? 0,
    conditions: member.conditions ?? [],
    ...hpTone(member.current_hp, member.max_hp),
  }
}
