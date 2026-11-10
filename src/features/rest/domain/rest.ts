import { z } from 'zod'

/** RYT-080: the group rest with a vote (ADR 037). PostgreSQL owns every rule; this only reads. */
export const restKinds = ['short', 'long'] as const
export type RestKind = (typeof restKinds)[number]
export const restStatuses = ['open', 'done', 'rejected', 'cancelled', 'expired'] as const
export type RestStatus = (typeof restStatuses)[number]

const count = z.number().int().min(0).max(100_000)
const effectSchema = z.object({
  can_rest: z.boolean(),
  max_hp: count,
  hp_before: count,
  hp_after: count,
  temp_before: count,
  temp_after: count,
  hit_die: z.number().int().min(0).max(12),
  con_mod: z.number().int().min(-10).max(20),
  dice_left_before: count,
  dice_left_after: count,
  dice_spent: count,
  trackers: z
    .object({
      id: z.string().max(40),
      key: z.string().max(60).nullable().optional(),
      name: z.string().max(60).nullable(),
      max: count,
      before: count,
      after: count,
    })
    .array()
    .max(30),
  slots: z.array(count).length(9),
})
export type RestEffect = z.infer<typeof effectSchema>

const participantSchema = z.object({
  id: z.uuid(),
  name: z.string().max(100),
  own: z.boolean(),
  dm_controlled: z.boolean(),
  controlled: z.boolean(),
  vote: z.enum(['yes', 'no']).nullable(),
  dice_spent: count.optional().default(0),
  dice_roll: count.nullable().optional(),
  can_rest: z.boolean().optional(),
  rested: z.boolean().optional(),
  shares: z.boolean(),
  effect: effectSchema.nullable(),
})
export type RestParticipant = z.infer<typeof participantSchema>

export const restStateSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(restKinds),
    status: z.enum(restStatuses),
    created_at: z.string(),
    expires_at: z.string(),
    resolved_at: z.string().nullable(),
    revision: z.number().int().min(0),
    requester_name: z.string().max(100).nullable(),
    mine: z.boolean(),
    dm: z.boolean(),
    can_cancel: z.boolean(),
    participants: participantSchema.array().max(200),
  })
  .nullable()
export type RestState = NonNullable<z.infer<typeof restStateSchema>>

export type RestAction =
  | { kind: 'request'; rest: RestKind; requestId: string }
  | {
      kind: 'vote'
      requestId: string
      characterId: string
      vote: 'yes' | 'no'
      spent: number | null
      roll: number | null
    }
  | { kind: 'now'; requestId: string }
  | { kind: 'cancel'; requestId: string }

export type RestError =
  'open' | 'combat' | 'unavailable' | 'closed' | 'dice' | 'cannotRest' | 'forbidden'
/** Maps server messages of the rest RPCs to user-facing error kinds. */
export function restError(message: string): RestError {
  if (message.includes('Rest open')) return 'open'
  if (message.includes('Character in combat')) return 'combat'
  if (message.includes('Rest closed')) return 'closed'
  if (message.includes('Invalid dice')) return 'dice'
  if (message.includes('Cannot rest')) return 'cannotRest'
  if (message.includes('Forbidden')) return 'forbidden'
  return 'unavailable'
}

/** Characters that vote: in play with at least 1 HP (SRD 5.2.1: a rest needs 1 HP). */
export const voters = (state: RestState) =>
  state.participants.filter((person) => person.can_rest !== false)

export function tally(state: RestState) {
  const all = voters(state)
  return {
    total: all.length,
    yes: all.filter((person) => person.vote === 'yes').length,
    waiting: all.filter((person) => person.vote === null),
  }
}

/** Whole minutes left before an open request expires (never below 0). */
export const minutesLeft = (state: RestState, now: number) =>
  Math.max(0, Math.ceil((Date.parse(state.expires_at) - now) / 60_000))

/** Hit points a short rest heals: the rolled total plus CON per die, at least 1 per die. */
export const shortRestHeal = (spent: number, roll: number, conMod: number) =>
  spent > 0 ? Math.max(spent, roll + conMod * spent) : 0

export type DiceChoice = { spent: number; roll: string }

/** A short-rest roll is valid with no dice, or a total between the dice count and its maximum. */
export const rollValid = (choice: DiceChoice, die: number) => {
  if (choice.spent === 0) return true
  const roll = Number(choice.roll)
  return (
    choice.roll.trim() !== '' &&
    Number.isInteger(roll) &&
    roll >= choice.spent &&
    roll <= choice.spent * die
  )
}

export type VoteMark = 'yes' | 'no' | 'wait' | 'cannot'
/** A participant's vote as shown: 0 HP characters cannot rest and do not vote. */
export const voteMark = (person: RestParticipant): VoteMark =>
  person.can_rest === false ? 'cannot' : (person.vote ?? 'wait')
