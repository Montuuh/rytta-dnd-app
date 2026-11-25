import { useRef, useState } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import type { CreatureListItem, MonsterRow, StatBlock } from '@/features/bestiary'
import { combatStateQuery } from '../api'
import type { CombatantEntry } from '../domain/combat'
import { npcEntryFor, useSpellLabel } from './creatures'
import { useRunner, type Run } from './helpers'
import { rememberEncounter } from './last-encounter'

/** The most creatures one add can bring (the dialog's own limit). */
export const maxAdd = 20

/** What the stat block says about its last add, and what Undo may still remove. */
export type AddLine = {
  /** Changes with every add, so the same sentence said twice is announced and shown as new. */
  serial: number
  /** The creature the add was made from; the line shows only in its stat block. */
  key: string
  creature: string
  count: number
  encounterId: string
  encounterName: string
  /** The combatants that add created; null when they could not be told apart. */
  ids: string[] | null
  phase: 'added' | 'removing' | 'removed' | 'stuck'
  /** How many could not be removed (phase stuck). */
  left: number
}

/** The ids of the combatants in an encounter right now, or null when they cannot be read. */
async function combatantIds(
  cache: QueryClient,
  userId: string,
  campaignId: string,
  encounterId: string,
) {
  try {
    const state = await cache.fetchQuery({
      ...combatStateQuery(userId, campaignId, encounterId),
      staleTime: 0,
    })
    return new Set(state.combatants.map((combatant) => combatant.id))
  } catch {
    return null
  }
}

/**
 * Runs an add and works out which combatants it created: the encounter's combatants before the
 * request and after it (the add operation answers with a count, not the ids). The "before" is
 * handed back so a retry of the same request, which the server may already have applied, still
 * compares against the original roster.
 */
export function useTracedAdd(campaignId: string, run: Run) {
  const { state } = useAuth()
  const cache = useQueryClient()
  const userId = state.user!.id
  return async (
    encounterId: string,
    entries: CombatantEntry[],
    options: { requestId?: string; before?: Set<string> | null } = {},
  ) => {
    const before =
      options.before === undefined
        ? await combatantIds(cache, userId, campaignId, encounterId)
        : options.before
    const ok = await run({ kind: 'add', encounterId, entries, requestId: options.requestId })
    if (!ok) return { ok: false as const, before, ids: null }
    rememberEncounter(campaignId, encounterId)
    const after = before ? await combatantIds(cache, userId, campaignId, encounterId) : null
    const ids = before && after ? [...after].filter((id) => !before.has(id)) : null
    return { ok: true as const, before, ids }
  }
}

let addSerial = 0

/** The line for an add that just landed; Undo is offered only when its combatants are known. */
export function addedLine(
  item: Pick<CreatureListItem, 'key' | 'name'>,
  count: number,
  encounter: { id: string; name: string },
  ids: string[] | null,
): AddLine {
  return {
    serial: ++addSerial,
    key: item.key,
    creature: item.name,
    count,
    encounterId: encounter.id,
    encounterName: encounter.name,
    ids: ids && ids.length > 0 ? ids : null,
    phase: 'added',
    left: 0,
  }
}

/**
 * The stat block's add state: one-tap add to an encounter, the line that says what happened and
 * the Undo that removes exactly the combatants that add created.
 */
export function useEncounterAdd(campaignId: string) {
  const runner = useRunner(campaignId)
  const { run, clear } = runner
  const tracedAdd = useTracedAdd(campaignId, run)
  const spellLabel = useSpellLabel()
  const [line, setLine] = useState<AddLine | null>(null)
  const submitting = useRef(false)
  const intent = useRef<{ count: number; requestId: string; before: Set<string> | null } | null>(
    null,
  )

  const add = async (args: {
    item: CreatureListItem
    block: StatBlock | null
    row?: MonsterRow
    count: number
    encounter: { id: string; name: string }
  }) => {
    if (submitting.current) return false
    submitting.current = true
    try {
      const { item, block, row, count, encounter } = args
      const entry = npcEntryFor(
        item,
        block,
        {
          count,
          side: item.side ?? 'enemy',
          hpMode: 'average',
          alias: '',
          hidden: false,
          share: true,
        },
        spellLabel,
        row,
      )
      const retry = intent.current?.count === count ? intent.current : null
      const requestId = retry?.requestId ?? crypto.randomUUID()
      const done = await tracedAdd(encounter.id, [entry], {
        requestId,
        before: retry ? retry.before : undefined,
      })
      if (!done.ok) {
        intent.current = { count, requestId, before: done.before }
        return false
      }
      intent.current = null
      setLine(addedLine(item, count, encounter, done.ids))
      return true
    } finally {
      submitting.current = false
    }
  }

  const undo = async () => {
    if (!line?.ids || line.phase !== 'added') return
    const target = line
    setLine({ ...target, phase: 'removing' })
    let left = target.ids!.length
    for (const combatantId of target.ids!) {
      if (!(await run({ kind: 'remove', combatantId }))) break
      left -= 1
    }
    // A combatant that cannot be removed any more (the encounter moved on) is said in the line,
    // not as a separate error.
    clear()
    setLine({
      ...target,
      phase: left === 0 ? 'removed' : 'stuck',
      left,
      ids: left === 0 ? null : target.ids,
    })
  }

  return { ...runner, line, setLine, add, undo }
}
