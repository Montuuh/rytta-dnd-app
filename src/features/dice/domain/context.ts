import { z } from 'zod'
import { campaignRollSchema, type CampaignRoll } from '@/features/campaigns'

/** The two kinds the server limits to one roll in app mode. */
export const oneRollKinds = ['initiative', 'hit_die'] as const
export type OneRollKind = (typeof oneRollKinds)[number]

/**
 * RYT-137: what `get_roll_context` returns. The server decides which rolls are in force: an
 * initiative roll while its fight is live, a hit-dice roll until a rest completes, none once the DM
 * cleared it. `spent` names the characters the caller controls (the DM: every character) whose
 * one roll is used and carries no roll content; `rolls` are those rolls in force that the caller
 * may read.
 */
export const rollContextSchema = z.object({
  encounter_id: z.uuid().nullable(),
  rest_id: z.uuid().nullable(),
  spent: z
    .array(z.object({ character_id: z.uuid(), kind: z.enum(oneRollKinds) }))
    .max(1000)
    .default([]),
  rolls: campaignRollSchema.array().max(1000).default([]),
})
export type RollContext = z.infer<typeof rollContextSchema>

/**
 * The roll in force for a character and kind, newest first. A roll still being revealed (`held`)
 * is left out, so the total is not read here before the card shows it. An initiative roll counts
 * only for the fight that is live now.
 */
export function rollInForce(
  context: RollContext | undefined,
  characterId: string | null,
  kind: OneRollKind,
  held: ReadonlySet<string> = new Set(),
): CampaignRoll | undefined {
  if (!context || !characterId) return undefined
  return context.rolls
    .filter(
      (roll) =>
        roll.character_id === characterId &&
        roll.kind === kind &&
        roll.source === 'app' &&
        roll.superseded_at === null &&
        !held.has(roll.id) &&
        (kind === 'hit_die' ||
          (roll.encounter_id !== null && roll.encounter_id === context.encounter_id)),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0]
}

/**
 * Whether the server holds this character's one roll of a kind. It can be true while the roll
 * itself is not readable by the viewer (a roll the DM made, under a narrow visibility). While the
 * roll is still being revealed it is false, so nothing spoils the total.
 */
export function isSpent(
  context: RollContext | undefined,
  characterId: string | null,
  kind: OneRollKind,
  held: ReadonlySet<string> = new Set(),
): boolean {
  if (!context || !characterId) return false
  const entry = context.spent.some(
    (item) => item.character_id === characterId && item.kind === kind,
  )
  if (!entry) return false
  const revealing = context.rolls.some(
    (roll) => roll.character_id === characterId && roll.kind === kind && held.has(roll.id),
  )
  return !revealing
}

const bonusSuffix = /^1?d20(?:([+-])(\d{1,2}))?$/
export const initiativeBonusRange = { min: -20, max: 30 } as const

/** The modifier of a `d20±N` initiative expression; null for anything else. */
export function initiativeModifier(expression: string): number | null {
  const match = bonusSuffix.exec(expression)
  if (!match) return null
  const value = match[2] ? Number(match[2]) * (match[1] === '-' ? -1 : 1) : 0
  return value >= initiativeBonusRange.min && value <= initiativeBonusRange.max ? value : null
}

/** `d20+2`: the only shape the server accepts for an app initiative roll (modifier -20 to 30). */
export function initiativeExpression(modifier: number): string | null {
  if (!Number.isInteger(modifier)) return null
  if (modifier < initiativeBonusRange.min || modifier > initiativeBonusRange.max) return null
  return `d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `-${-modifier}`}`
}

/**
 * The expression the DM re-rolls with: the bonus of the Player's roll when the DM can read it,
 * else the sheet's initiative bonus, else the one saved on the combatant, else none. The server
 * knows none of them, so this is the client's, kept inside what the server accepts.
 */
export function rerollExpression(
  existing: CampaignRoll | undefined,
  sheetBonus: number | null,
  savedBonus: number | null,
): string {
  const fromRoll = existing ? initiativeModifier(existing.expression) : null
  const bonus = fromRoll ?? sheetBonus ?? savedBonus ?? 0
  return (
    initiativeExpression(
      Math.min(initiativeBonusRange.max, Math.max(initiativeBonusRange.min, bonus)),
    ) ?? 'd20'
  )
}

/**
 * Request ids of the DM's resets. One attempt per character and kind (the slot); its signature
 * says what the intent was (the fight or rest, the roll in force when readable, clear or re-roll).
 * The same signature on the same slot is a retry and keeps its id; another signature is a new
 * intent and gets a new one. An attempt ends with its success and when the server no longer marks
 * the slot as spent, so one pending attempt never touches another's.
 */
export type ResetAttempt = { id: string; signature: string; expression: string | null }
export function createAttemptBook() {
  const slots = new Map<string, ResetAttempt>()
  return {
    /**
     * The attempt of a slot for an intent. The same signature is a retry; `reuse` also accepts a
     * retry whose signature moved on because the first try did apply (a re-roll whose reply was
     * lost shows its own roll as the one in force). The attempt keeps the expression it was first
     * made with, so a retry never sends another payload.
     */
    forIntent(
      slot: string,
      signature: string,
      newId: () => string,
      options: { expression?: string | null; reuse?: (previous: ResetAttempt) => boolean } = {},
    ): ResetAttempt {
      const found = slots.get(slot)
      if (found && (found.signature === signature || options.reuse?.(found))) return found
      const next = { id: newId(), signature, expression: options.expression ?? null }
      slots.set(slot, next)
      return next
    },
    done(slot: string) {
      slots.delete(slot)
    },
    /** Drops the attempts of slots the server no longer marks as spent. */
    prune(stillSpent: (slot: string) => boolean) {
      for (const slot of [...slots.keys()]) if (!stillSpent(slot)) slots.delete(slot)
    },
    has: (slot: string) => slots.has(slot),
    entries: (): [string, ResetAttempt][] => [...slots.entries()],
  }
}
export const resetSlot = (characterId: string, kind: OneRollKind) => `${characterId}:${kind}`

/**
 * The context with a roll the server just stored added to it, so the screen shows the roll at once
 * and does not offer another while the next read is on its way. Only a roll the server would count
 * (an app roll linked to the live fight or to a rest) is added; the next read reconciles.
 */
export function withRoll(context: RollContext, roll: CampaignRoll): RollContext {
  const kind = oneRollKinds.find((item) => item === roll.kind)
  if (!kind || roll.source !== 'app' || roll.character_id === null || roll.superseded_at !== null)
    return context
  const linked =
    kind === 'initiative'
      ? roll.encounter_id !== null && roll.encounter_id === context.encounter_id
      : roll.rest_id !== null
  if (!linked) return context
  const characterId = roll.character_id
  return {
    ...context,
    spent: context.spent.some((item) => item.character_id === characterId && item.kind === kind)
      ? context.spent
      : [...context.spent, { character_id: characterId, kind }],
    rolls: [...context.rolls.filter((item) => item.id !== roll.id), roll],
  }
}

/**
 * Whether a re-roll attempt already applied: the roll in force is the DM's own and is not the one
 * the attempt started from (the first try's reply was lost). The attempt is then over, so a
 * deliberate re-roll made much later is a new intent with a new request id, not a replay.
 */
export function reRollApplied(
  attempt: ResetAttempt,
  inForce: CampaignRoll | undefined,
  dmId: string | undefined,
): boolean {
  if (attempt.expression === null || !inForce || !dmId) return false
  const started = attempt.signature.split('|')[1]
  return inForce.roller_id === dmId && inForce.id !== started
}
