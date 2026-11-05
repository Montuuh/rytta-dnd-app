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
/** RYT-043: five named bands (plus unknown) that describe health without numbers. */
export const hpBands = ['unhurt', 'wounded', 'bloodied', 'critical', 'down', 'unknown'] as const
export type HpBand = (typeof hpBands)[number]
export type Side = 'party' | 'ally' | 'enemy'
export type HpMode = 'damage' | 'heal' | 'temp'
export type DeathSaveOutcome = 'success' | 'failure' | 'nat1' | 'nat20'

export const trackerSchema = z.discriminatedUnion('kind', [
  z.object({
    key: z.string().max(120),
    kind: z.literal('recharge'),
    label: z.string().max(120),
    min: z.number().int().min(2).max(6),
    spent: z.boolean(),
  }),
  z.object({
    key: z.string().max(120),
    kind: z.literal('uses'),
    label: z.string().max(120),
    max: z.number().int().min(1).max(9),
    used: z.number().int().min(0).max(9),
  }),
])
export type Tracker = z.infer<typeof trackerSchema>

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
  hp_band: z.enum(hpBands).optional(),
  /** Private storage path of the portrait (characters) or bestiary image (creatures). */
  image_path: z.string().max(300).optional(),
  armor_class: z.number().int().optional(),
  conditions: z.array(z.enum(combatConditions)).optional(),
  concentration: z.string().max(80).optional(),
  death_saves: z
    .object({ successes: z.number().int().min(0), failures: z.number().int().min(0) })
    .optional(),
  exhaustion: z.number().int().min(0).optional(),
  /** RYT-045: a death save outcome the whole table knows, even without shared vitals. */
  death_state: z.enum(['stable', 'revived']).optional(),
  /** ADR 028 (DM only): the table alias, the SRD origin, the template and the trackers. */
  public_name: z.string().max(80).optional(),
  srd_id: z.string().max(80).optional(),
  template_id: z.uuid().optional(),
  trackers: z.array(trackerSchema).max(24).optional(),
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
  'recharge',
  'tracker',
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
  image_path: z.string().max(300).nullable().optional(),
  /** ADR 028: the full stat block (validated by the bestiary's schema where it is read). */
  stat_block: z.record(z.string(), z.unknown()).optional(),
  srd_id: z.string().max(80).optional(),
  hp_formula: z.string().max(20).optional(),
  challenge: z.string().max(4).optional(),
  creature_type: z.string().max(20).optional(),
  updated_at: z.string().optional(),
  revision: z.number().int(),
})
export type CombatantTemplate = z.infer<typeof templateSchema>
export const templateListSchema = z.array(templateSchema)

/** RYT-053: the DM's own image for an SRD creature in this campaign (replaces the bundled art). */
export const srdImageListSchema = z.array(
  z.object({
    srd_id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    image_path: z.string().min(1),
    updated_at: z.string(),
  }),
)
export type SrdImage = z.infer<typeof srdImageListSchema>[number]

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
  public_name?: string
  srd_id?: string
  hp_mode?: 'average' | 'roll'
  hp_formula?: string
  trackers?: TrackerInput[]
}
export type TrackerInput =
  | { key: string; kind: 'recharge'; label: string; min: number }
  | { key: string; kind: 'uses'; label: string; max: number }
export type CombatantEntry =
  | { kind: 'character'; character_id: string; initiative?: number }
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
  public_name: string | null
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
  stat_block?: Record<string, unknown> | null
  srd_id?: string | null
  hp_formula?: string | null
  challenge?: string | null
  creature_type?: string | null
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
  | { kind: 'templateImage'; templateId: string; revision: number; path: string | null }
  | { kind: 'srdImage'; srdId: string; path: string | null }
  | { kind: 'tracker'; combatantId: string; key: string; value: number }

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
  'initiativeClosed',
  'notYourTurn',
  'alreadyRolled',
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
    [/Initiative closed/, 'initiativeClosed'],
    [/Not your turn/, 'notYourTurn'],
    [/Already rolled/, 'alreadyRolled'],
    [/(Encounter|Combatant|Effect|Event|Template|Character) unavailable/, 'gone'],
    [/Invalid request|Request mismatch/, 'invalid'],
    [/Forbidden/, 'forbidden'],
  ]
  return table.find(([pattern]) => pattern.test(message))?.[1] ?? 'unavailable'
}
export const isCombatErrorCode = (value: string): value is CombatErrorCode =>
  (combatErrorCodes as readonly string[]).includes(value)

/**
 * The band to show for a combatant (RYT-043). Exact hit points, when visible, decide it locally so the
 * band always agrees with the numbers; otherwise the server's band (or its older four-value status).
 */
export function healthBand(combatant: Combatant): HpBand | null {
  if (combatant.kind === 'lair') return null
  if (combatant.defeated && combatant.kind !== 'character') return 'down'
  const hp = combatant.hp
  if (hp) {
    if (hp.current <= 0) return 'down'
    if (hp.current >= hp.max) return 'unhurt'
    if (hp.current * 2 > hp.max) return 'wounded'
    if (hp.current * 4 > hp.max) return 'bloodied'
    return 'critical'
  }
  return combatant.hp_band ?? combatant.hp_status ?? 'unknown'
}

/** Up to two initials for a monogram: "Goblin 3" gives "G3", "Arin Vale" gives "AV". */
export function monogram(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]!.toLocaleUpperCase())
    .join('')
}

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

/**
 * Where a character joining with `total` lands in the order (it has no tiebreak bonus, so it goes
 * after equal totals with a bonus of 0 or more). `thisRound` tells whether it still acts in the
 * current round: turns follow the order by position, so a slot above the active one waits for the
 * next round. A preview only; the server orders the encounter.
 */
export function joinPlacement(combatants: readonly Combatant[], total: number) {
  let index = combatants.findIndex(
    (c) =>
      c.initiative === undefined ||
      c.initiative < total ||
      (c.initiative === total && (c.initiative_bonus ?? 0) < 0),
  )
  if (index < 0) index = combatants.length
  const active = combatants.findIndex((c) => c.is_active)
  return {
    before: combatants[index - 1] ?? null,
    after: combatants[index] ?? null,
    thisRound: active >= 0 && index > active,
  }
}

/** Initiative totals the server accepts (set_initiative and add_combatants). */
export const isInitiativeTotal = (value: number) =>
  Number.isInteger(value) && value >= -20 && value <= 99

/**
 * Whether the viewer may enter this combatant's initiative from the table view (RYT-042): only the
 * own character, while initiative is collected, or later only while its total is still missing.
 * Presentation only; set_initiative enforces the same rule on the server.
 */
export function canEnterInitiative(status: EncounterStatus, combatant: Combatant) {
  if (!combatant.is_own || !combatant.can_act || combatant.kind !== 'character') return false
  return status === 'initiative' || (status === 'active' && combatant.initiative === undefined)
}

/** Where a character stands between life and death (RYT-045). Dead is the defeated flag; stable and
 * revived come from the server for everyone; dying needs the character's own visible vitals. */
export type DeathState = 'dying' | 'stable' | 'revived' | 'dead'
export function deathState(combatant: Combatant): DeathState | null {
  if (combatant.kind !== 'character') return null
  if (combatant.defeated) return 'dead'
  if (combatant.death_state) return combatant.death_state
  if (combatant.hp?.current !== 0) return null
  return (combatant.death_saves?.successes ?? 0) >= 3 ? 'stable' : 'dying'
}

/** The death save this combatant rolled in the current round and that was not undone, if any. */
export function deathSaveThisRound(state: CombatState, combatantId: string) {
  const round = state.encounter?.round
  return (
    state.events.find(
      (e) =>
        e.kind === 'death_save' &&
        e.target_combatant === combatantId &&
        e.round === round &&
        !e.undone,
    ) ?? null
  )
}

/**
 * Whether the viewer rolls this combatant's death save from the table view (RYT-045): the own
 * character, dying, on its own turn, once per round. Presentation only; record_death_save
 * enforces the same rules on the server.
 */
export function canRollDeathSave(state: CombatState, combatant: Combatant) {
  return (
    combatant.is_own &&
    combatant.can_act &&
    combatant.is_active &&
    state.encounter?.status === 'active' &&
    deathState(combatant) === 'dying' &&
    deathSaveThisRound(state, combatant.id) === null
  )
}

/** Whether the viewer ends the active turn from the table view: only the own active character. */
export const canEndTurn = (status: EncounterStatus, active: Combatant | null) =>
  status === 'active' &&
  active !== null &&
  active.is_own &&
  active.can_act &&
  active.kind === 'character'

/** How many combatants on screen already have an initiative total. */
export function initiativeProgress(combatants: readonly Combatant[]) {
  return {
    ready: combatants.filter((c) => c.initiative !== undefined).length,
    total: combatants.length,
  }
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
        // ADR 028: the alias replaces the name, and hides the image, for Players.
        name: c.public_name ?? c.name,
        image_path: c.public_name ? undefined : c.image_path,
        public_name: undefined,
        srd_id: undefined,
        template_id: undefined,
        trackers: undefined,
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
  const aliases = new Map(
    state.combatants.filter((c) => c.public_name).map((c) => [c.id, c.public_name!]),
  )
  return {
    ...state,
    viewer: { role: 'player' as const },
    encounter: state.encounter?.summary
      ? {
          ...state.encounter,
          summary: {
            ...state.encounter.summary,
            combatants: state.encounter.summary.combatants
              .filter((row) => visibleIds.has(row.combatant_id))
              .map((row) => ({ ...row, name: aliases.get(row.combatant_id) ?? row.name })),
          },
        }
      : state.encounter,
    combatants,
    effects: state.effects.filter((f) => f.visible && visibleIds.has(f.target_combatant)),
    events: state.events
      .filter((e) => e.visible !== false)
      .map((e) => ({
        ...e,
        target_name: (e.target_combatant && aliases.get(e.target_combatant)) || e.target_name,
        undoable: false,
        visible: undefined,
      })),
  }
}
