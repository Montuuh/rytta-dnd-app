import { z } from 'zod'

// Mirrors the SQL check on encounter_combatants.conditions and character_vitals.conditions (SRD
// 5.2 conditions, CC-BY-4.0). Exhaustion stays a DM-controlled resource (RYT-003).
export const combatConditions = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const
export type CombatCondition = (typeof combatConditions)[number]

export const encounterStatuses = ['draft', 'initiative', 'active', 'ended'] as const
export type EncounterStatus = (typeof encounterStatuses)[number]
export const hpStatuses = ['unhurt', 'wounded', 'bloodied', 'down', 'unknown'] as const
export type HpStatus = (typeof hpStatuses)[number]
export type Side = 'party' | 'ally' | 'enemy'
export type HpMode = 'damage' | 'heal' | 'temp'
export type DeathSaveOutcome = 'success' | 'failure' | 'nat1' | 'nat20'

const hpSchema = z.object({
  current: z.number().int().min(0),
  max: z.number().int().min(0),
  temp: z.number().int().min(0),
})

export const combatantSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['character', 'npc', 'lair']),
  side: z.enum(['party', 'ally', 'enemy']),
  name: z.string().min(1).max(80),
  initiative: z.number().int().optional(),
  initiative_bonus: z.number().int().optional(),
  in_turn_order: z.boolean(),
  is_active: z.boolean(),
  is_own: z.boolean(),
  can_act: z.boolean(),
  defeated: z.boolean(),
  character_id: z.uuid().optional(),
  hidden: z.boolean().optional(),
  shares_live: z.boolean().optional(),
  hp_revealed: z.boolean().optional(),
  group_key: z.string().optional(),
  dm_notes: z.string().max(2000).optional(),
  legendary: z.object({ max: z.number().int().min(0), used: z.number().int().min(0) }).optional(),
  hp: hpSchema.optional(),
  hp_status: z.enum(hpStatuses).optional(),
  armor_class: z.number().int().optional(),
  conditions: z.array(z.enum(combatConditions)).optional(),
  concentration: z.string().max(80).optional(),
  death_saves: z
    .object({ successes: z.number().int().min(0), failures: z.number().int().min(0) })
    .optional(),
  exhaustion: z.number().int().min(0).optional(),
})
export type Combatant = z.infer<typeof combatantSchema>

const summaryRowSchema = z.object({
  combatant_id: z.uuid(),
  name: z.string(),
  kind: z.string(),
  side: z.string(),
  defeated: z.boolean(),
  damage_taken: z.number(),
  damage_dealt: z.number(),
  healing: z.number(),
  downed: z.boolean(),
})
export type SummaryRow = z.infer<typeof summaryRowSchema>

export const encounterSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(encounterStatuses),
  round: z.number().int().min(0),
  active_combatant: z.uuid().nullable().optional(),
  revision: z.number().int().min(0),
  started_at: z.string().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  updated_at: z.string().optional(),
  summary: z
    .object({ rounds: z.number().int(), combatants: z.array(summaryRowSchema) })
    .nullable()
    .optional(),
})
export type Encounter = z.infer<typeof encounterSchema>

export const effectSchema = z.object({
  id: z.uuid(),
  target_combatant: z.uuid(),
  source_combatant: z.uuid().nullable().optional(),
  label: z.string(),
  condition: z.enum(combatConditions).nullable().optional(),
  remaining_rounds: z.number().int().nullable().optional(),
  ticks_on: z.enum(['start', 'end']),
  visible: z.boolean(),
  can_remove: z.boolean(),
})
export type Effect = z.infer<typeof effectSchema>

export const eventKinds = [
  'status',
  'turn',
  'round',
  'initiative',
  'join',
  'leave',
  'reveal',
  'damage',
  'heal',
  'temp',
  'condition_on',
  'condition_off',
  'concentration',
  'death_save',
  'defeated',
  'revived',
  'effect_on',
  'effect_off',
  'effect_expired',
  'undo',
] as const
export const eventSchema = z.object({
  id: z.uuid(),
  kind: z.enum(eventKinds),
  round: z.number().int(),
  target_combatant: z.uuid().optional(),
  target_name: z.string().optional(),
  amount: z.number().int().optional(),
  source_name: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).default({}),
  undone: z.boolean(),
  visible: z.boolean().optional(),
  mine: z.boolean().default(false),
  undoable: z.boolean().default(false),
  created_at: z.string(),
})
export type CombatEvent = z.infer<typeof eventSchema>

export const combatStateSchema = z.object({
  viewer: z.object({ role: z.enum(['dm', 'player', 'table']) }).optional(),
  encounter: encounterSchema.nullable(),
  combatants: z.array(combatantSchema).default([]),
  effects: z.array(effectSchema).default([]),
  events: z.array(eventSchema).default([]),
})
export type CombatState = z.infer<typeof combatStateSchema>

export const encounterListSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(encounterStatuses),
    round: z.number().int(),
    updated_at: z.string(),
    started_at: z.string().nullable(),
    ended_at: z.string().nullable(),
    combatants: z.number().int(),
    needs_initiative: z.boolean(),
  }),
)
export type EncounterSummary = z.infer<typeof encounterListSchema>[number]

export const templateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  side: z.enum(['ally', 'enemy']),
  max_hp: z.number().int(),
  armor_class: z.number().int(),
  initiative_bonus: z.number().int(),
  legendary_max: z.number().int(),
  notes: z.string(),
  revision: z.number().int(),
})
export type CombatantTemplate = z.infer<typeof templateSchema>
export const templateListSchema = z.array(templateSchema)

export const mutationResultSchema = z
  .object({
    encounter_id: z.uuid().optional(),
    status: z.string().optional(),
    round: z.number().int().optional(),
    active_combatant: z.uuid().nullable().optional(),
    revision: z.number().int().optional(),
    hits: z.array(z.record(z.string(), z.unknown())).optional(),
    result: z.string().nullable().optional(),
    id: z.uuid().optional(),
    deleted: z.boolean().optional(),
  })
  .loose()
export type MutationResult = z.infer<typeof mutationResultSchema>

export type NpcEntry = {
  kind: 'npc'
  name?: string
  template_id?: string
  count?: number
  max_hp?: number
  armor_class?: number
  initiative_bonus?: number
  side?: 'ally' | 'enemy'
  hidden?: boolean
  share_initiative?: boolean
  legendary_max?: number
  dm_notes?: string
}
export type CombatantEntry =
  | { kind: 'character'; character_id: string }
  | { kind: 'lair'; name?: string; hidden?: boolean }
  | NpcEntry

export type CombatantPatch = Partial<{
  name: string
  max_hp: number
  current_hp: number
  temp_hp: number
  armor_class: number
  initiative_bonus: number
  side: 'ally' | 'enemy'
  hidden: boolean
  hp_revealed: boolean
  defeated: boolean
  legendary_max: number
  legendary_used: number
  dm_notes: string
}>

export type EffectInput = {
  target_combatant: string
  source_combatant?: string | null
  label: string
  condition?: CombatCondition | null
  rounds?: number | null
  ticks_on?: 'start' | 'end'
  visible?: boolean
}

export type TemplateInput = {
  name: string
  side: 'ally' | 'enemy'
  max_hp: number
  armor_class: number
  initiative_bonus: number
  legendary_max: number
  notes: string
}

export type CombatAction =
  | { kind: 'create'; name: string }
  | { kind: 'rename'; encounterId: string; name: string }
  | { kind: 'delete'; encounterId: string }
  | { kind: 'status'; encounterId: string; status: EncounterStatus }
  | { kind: 'add'; encounterId: string; entries: CombatantEntry[] }
  | { kind: 'update'; combatantId: string; patch: CombatantPatch }
  | { kind: 'remove'; combatantId: string }
  | { kind: 'initiative'; combatantId: string; total: number; bonus: number | null }
  | { kind: 'roll'; encounterId: string }
  | { kind: 'order'; encounterId: string; ids: string[] }
  | { kind: 'turn'; encounterId: string; direction: 1 | -1; expected: string | null }
  | { kind: 'jump'; encounterId: string; target: string; expected: string | null }
  | {
      kind: 'hp'
      encounterId: string
      mode: HpMode
      hits: { combatant_id: string; amount: number }[]
    }
  | { kind: 'condition'; combatantId: string; condition: CombatCondition; enabled: boolean }
  | { kind: 'concentration'; combatantId: string; spell: string | null }
  | { kind: 'deathSave'; combatantId: string; outcome: DeathSaveOutcome }
  | { kind: 'effect'; encounterId: string; effect: EffectInput }
  | { kind: 'removeEffect'; effectId: string }
  | { kind: 'undo'; eventId: string }
  | {
      kind: 'saveTemplate'
      templateId: string | null
      revision: number | null
      data: TemplateInput
    }
  | { kind: 'deleteTemplate'; templateId: string }

export const combatErrorCodes = [
  'staleTurn',
  'stale',
  'busy',
  'live',
  'closed',
  'transition',
  'empty',
  'firstTurn',
  'notDying',
  'undoConflict',
  'undone',
  'notUndoable',
  'gone',
  'invalid',
  'forbidden',
  'unavailable',
] as const
export type CombatErrorCode = (typeof combatErrorCodes)[number]
export function combatErrorCode(message: string): CombatErrorCode {
  const table: [RegExp, CombatErrorCode][] = [
    [/Stale turn/, 'staleTurn'],
    [/Stale revision/, 'stale'],
    [/Encounter busy/, 'busy'],
    [/Encounter live/, 'live'],
    [/Encounter closed/, 'closed'],
    [/Invalid transition/, 'transition'],
    [/No combatants/, 'empty'],
    [/First turn/, 'firstTurn'],
    [/Not dying/, 'notDying'],
    [/Undo conflict/, 'undoConflict'],
    [/Already undone/, 'undone'],
    [/Not undoable/, 'notUndoable'],
    [/(Encounter|Combatant|Effect|Event|Template|Character) unavailable/, 'gone'],
    [/Invalid request|Request mismatch/, 'invalid'],
    [/Forbidden/, 'forbidden'],
  ]
  return table.find(([pattern]) => pattern.test(message))?.[1] ?? 'unavailable'
}
export const isCombatErrorCode = (value: string): value is CombatErrorCode =>
  (combatErrorCodes as readonly string[]).includes(value)

export const isLive = (status: EncounterStatus | undefined) =>
  status === 'initiative' || status === 'active'

/** SRD 5.2 concentration save: DC 10 or half the damage, whichever is higher, up to 30. */
export const concentrationDc = (damage: number) =>
  Math.min(30, Math.max(10, Math.floor(Math.max(0, damage) / 2)))

export const halfDamage = (amount: number) => Math.floor(Math.max(0, amount) / 2)

/** Polling backs up realtime: fast while a fight is live, slow otherwise. */
export const combatPollInterval = (state: CombatState | undefined) =>
  isLive(state?.encounter?.status) ? 4_000 : 15_000

/** Data older than this, or a failing connection, is presented as "last known". */
export const staleAfterMs = 15_000

export function turnOrder(combatants: readonly Combatant[]) {
  return combatants.filter((c) => c.in_turn_order)
}

/** The combatant acting after the active one (wrapping), or null. */
export function nextUp(combatants: readonly Combatant[]) {
  const order = turnOrder(combatants)
  if (order.length === 0) return null
  const index = order.findIndex((c) => c.is_active)
  if (index < 0) return order[0] ?? null
  if (order.length === 1) return null
  return order[(index + 1) % order.length] ?? null
}

/** How many turns until `id` acts: 0 = now, null when it is not in the turn order. */
export function turnsUntil(combatants: readonly Combatant[], id: string) {
  const order = turnOrder(combatants)
  const target = order.findIndex((c) => c.id === id)
  if (target < 0) return null
  const active = order.findIndex((c) => c.is_active)
  if (active < 0) return target
  return (target - active + order.length) % order.length
}

/** Combatants that still need an initiative total (characters first for the DM checklist). */
export function missingInitiative(combatants: readonly Combatant[]) {
  return combatants.filter((c) => c.initiative === undefined && !c.hidden)
}

/** Moves a combatant up or down within its initiative tie. Returns the new full order of ids, or
 * null when the neighbour has a different total (only ties are reordered by the DM). */
export function moveWithinTie(combatants: readonly Combatant[], id: string, direction: -1 | 1) {
  const ids = combatants.map((c) => c.id)
  const index = ids.indexOf(id)
  const neighbour = combatants[index + direction]
  const self = combatants[index]
  if (!self || !neighbour) return null
  if (self.initiative === undefined || self.initiative !== neighbour.initiative) return null
  if ((self.initiative_bonus ?? 0) !== (neighbour.initiative_bonus ?? 0)) return null
  const next = [...ids]
  next[index] = neighbour.id
  next[index + direction] = self.id
  return next
}

/** Presentation-only Player POV for a DM preview: removes what the Player projection hides.
 * The server never relies on this; it authorizes every write as the DM. */
export function previewAsPlayer(state: CombatState, ownCharacterIds: ReadonlySet<string>) {
  const combatants = state.combatants
    .filter((c) => !c.hidden)
    .map((c): Combatant => {
      const own = c.kind === 'character' && !!c.character_id && ownCharacterIds.has(c.character_id)
      const pc = c.kind === 'character'
      const visibleVitals = pc && (own || c.shares_live === true)
      const revealed = c.kind === 'npc' && c.hp_revealed
      return {
        ...c,
        is_own: own,
        can_act: own,
        hidden: undefined,
        shares_live: undefined,
        hp_revealed: undefined,
        group_key: undefined,
        dm_notes: undefined,
        legendary: undefined,
        character_id: own ? c.character_id : undefined,
        initiative_bonus: own ? c.initiative_bonus : undefined,
        hp: visibleVitals || revealed ? c.hp : undefined,
        hp_status: pc && !visibleVitals ? 'unknown' : c.hp_status,
        armor_class: visibleVitals ? c.armor_class : undefined,
        conditions: pc && !visibleVitals ? undefined : c.conditions,
        concentration: pc && !visibleVitals ? undefined : c.concentration,
        death_saves: visibleVitals ? c.death_saves : undefined,
        exhaustion: visibleVitals ? c.exhaustion : undefined,
      }
    })
  const visibleIds = new Set(combatants.map((c) => c.id))
  return {
    ...state,
    viewer: { role: 'player' as const },
    combatants,
    effects: state.effects.filter((f) => f.visible && visibleIds.has(f.target_combatant)),
    events: state.events
      .filter((e) => e.visible !== false)
      .map((e) => ({ ...e, undoable: false, visible: undefined })),
  }
}
