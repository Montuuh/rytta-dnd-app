import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { initiativeBonus, sheetQuery } from '@/features/characters'
import {
  createAttemptBook,
  reRollApplied,
  rerollExpression,
  resetSlot,
  useRollContext,
} from '@/features/dice'
import { newRequestId } from '@/shared/lib/request-id'
import { isLive, type Combatant, type EncounterStatus } from '../domain/combat'
import type { Run } from './helpers'

/**
 * RYT-137 (DM): clear or re-roll a Player's initiative roll. The server's one-roll state says whose
 * roll is used, so the action is offered only where there is one to reset. Clearing lets the Player
 * roll and save once again; re-rolling has the server roll d20 plus the Player's bonus (the bonus
 * of their own roll when the DM can read it, else the sheet's, else the one saved on the
 * combatant). Each character has its own attempt: a retry of the same intent (same fight, same
 * roll in force, same choice) sends the same request id, a new intent a new one, and an attempt
 * ends with its success or when the server no longer holds the roll.
 */
export function useResetInitiative(
  campaignId: string,
  run: Run,
  status: EncounterStatus,
  enabled: boolean,
  /** A re-roll whose reply was lost turned out to have applied: say so once. */
  onApplied?: (characterId: string) => void,
) {
  const { state } = useAuth()
  const cache = useQueryClient()
  const context = useRollContext(campaignId, { enabled })
  const attempts = useRef(createAttemptBook())
  const { spent, roll, encounterId } = context
  const canReset = useCallback(
    (combatant: Combatant) =>
      isLive(status) &&
      combatant.kind === 'character' &&
      combatant.character_id !== undefined &&
      spent(combatant.character_id, 'initiative'),
    [spent, status],
  )
  // An attempt for a character whose roll the server no longer holds is over.
  useEffect(() => {
    if (context.status !== 'ready') return
    attempts.current.prune((slot) => spent(slot.split(':')[0]!, 'initiative'))
  }, [context.status, spent, encounterId])
  // A re-roll whose reply was lost shows up as this DM's own roll in force: the attempt is over and
  // is announced once, so a deliberate re-roll much later is a new intent and rolls. Attempts that
  // are in flight are left to their own answer.
  const inFlight = useRef(new Set<string>())
  useEffect(() => {
    if (context.status !== 'ready') return
    for (const [slot, attempt] of attempts.current.entries()) {
      if (inFlight.current.has(slot)) continue
      const characterId = slot.split(':')[0]!
      if (reRollApplied(attempt, roll(characterId, 'initiative'), state.user?.id)) {
        attempts.current.done(slot)
        onApplied?.(characterId)
      }
    }
  }, [context.status, roll, state.user, onApplied])
  const reset = useCallback(
    async (combatant: Combatant, mode: 'clear' | 'reroll') => {
      const characterId = combatant.character_id
      if (!characterId) return false
      const inForce = roll(characterId, 'initiative')
      let expression: string | null = null
      if (mode === 'reroll') {
        let sheetBonus: number | null = null
        if (!inForce) {
          try {
            const sheet = await cache.fetchQuery(
              sheetQuery(state.user!.id, campaignId, characterId),
            )
            sheetBonus = sheet?.sheet.build ? initiativeBonus(sheet.sheet.build) : null
          } catch {
            sheetBonus = null
          }
        }
        expression = rerollExpression(inForce, sheetBonus, combatant.initiative_bonus ?? null)
      }
      const slot = resetSlot(characterId, 'initiative')
      const attempt = attempts.current.forIntent(
        slot,
        `${encounterId ?? ''}|${inForce?.id ?? 'unreadable'}|${expression ?? 'clear'}`,
        newRequestId,
        { expression },
      )
      inFlight.current.add(slot)
      const done = await run({
        kind: 'resetRoll',
        characterId,
        expression: attempt.expression,
        requestId: attempt.id,
      })
      inFlight.current.delete(slot)
      if (done) attempts.current.done(slot)
      return done
    },
    [roll, run, cache, state.user, campaignId, encounterId],
  )
  return { canReset, reset }
}
