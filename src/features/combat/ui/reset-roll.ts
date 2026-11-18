import { useCallback, useRef } from 'react'
import { attemptFor, rerollExpression, useRollContext, type Attempt } from '@/features/dice'
import { newRequestId } from '@/shared/lib/request-id'
import { isLive, type Combatant, type EncounterStatus } from '../domain/combat'
import type { Run } from './helpers'

/**
 * RYT-137 (DM): clear or re-roll a Player's initiative roll. The server's one-roll state says whose
 * roll is used, so the action is offered only where there is one to reset. Clearing lets the Player
 * roll and save once again; re-rolling has the server roll d20 plus the Player's bonus (the bonus
 * of their own roll when the DM can read it, else the one saved on the combatant) and sets the
 * result. One request id belongs to each intent: a retry after a failure sends the same one.
 */
export function useResetInitiative(campaignId: string, run: Run, status: EncounterStatus) {
  const context = useRollContext(campaignId)
  const attempt = useRef<Attempt | null>(null)
  const { spent, roll } = context
  const canReset = useCallback(
    (combatant: Combatant) =>
      isLive(status) &&
      combatant.kind === 'character' &&
      combatant.character_id !== undefined &&
      spent(combatant.character_id, 'initiative'),
    [spent, status],
  )
  const reset = useCallback(
    async (combatant: Combatant, mode: 'clear' | 'reroll') => {
      const characterId = combatant.character_id
      if (!characterId) return false
      const expression =
        mode === 'clear'
          ? null
          : rerollExpression(roll(characterId, 'initiative'), combatant.initiative_bonus ?? null)
      // A bonus the server cannot roll with never reaches it.
      if (mode === 'reroll' && !expression) return false
      attempt.current = attemptFor(
        attempt.current,
        `${characterId}:${expression ?? 'clear'}`,
        newRequestId,
      )
      const done = await run({
        kind: 'resetRoll',
        characterId,
        expression,
        requestId: attempt.current.id,
      })
      if (done) attempt.current = null
      return done
    },
    [roll, run],
  )
  return { canReset, reset }
}
