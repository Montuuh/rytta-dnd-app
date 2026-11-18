/**
 * RYT-133 fixture backend: the SQL of migration 20261130120000 in memory (set_dice_settings,
 * log_roll, the campaign_rolls read policy and the roll signal), so the browser contract tests see
 * the same refusals, error strings, idempotency and per-roll visibility as the database. One store
 * can be shared by several signed-in pages (`identityFixture(page, { dice: store })`) to see the
 * same table from a DM and from other Players. Authorization itself is tested against PostgreSQL
 * in tests/database.
 *
 * RYT-137 (20261204120000): app rolls of initiative and hit dice are linked to the live fight or
 * the open rest, one per character is in force at a time (`Already rolled`), the DM resets them,
 * and `get_roll_context` reports the one-roll state. The fixture does not own fights or rests: the
 * page fixtures wire them in through `store.world`.
 */
export type DiceMode = 'physical' | 'app' | 'player'
export type RollVisibility = 'table' | 'roller' | 'roller_dm'
export type StoredRoll = {
  id: string
  campaign_id: string
  character_id: string | null
  roller_id: string
  label: string
  expression: string
  dice: number[]
  total: number
  kind: string
  source: 'app' | 'recorded'
  visibility: RollVisibility
  created_at: string
  encounter_id?: string | null
  rest_id?: string | null
  superseded_at?: string | null
}
/** What the server knows outside the roll log: the live fight, the open rest, the hit dice. */
export type DiceWorld = {
  /** The live encounter and the characters in it that are not hidden; null without one. */
  fight: (campaignId: string) => { id: string; characters: string[] } | null
  /** The open, unexpired rest request; null without one. */
  openRest: () => string | null
  /** The sheet's hit die and the hit dice a character has left; null when it has no sheet. */
  hitDice: (characterId: string) => { die: number; left: number } | null
}
export type DiceReply = { status: number; body: unknown }
type Failure = { code: string; message: string }
const refuse = (code: string, message: string): DiceReply => ({
  status: code === '42501' ? 403 : 400,
  body: { code, message } satisfies Failure,
})

export type DiceMember = { role: 'dm' | 'player'; active: boolean }
export type DiceCharacter = {
  id: string
  user_id: string | null
  archived: boolean
  absent: boolean
}

const rank: Record<RollVisibility, number> = { roller: 0, roller_dm: 1, table: 2 }
const kinds = [
  'ability',
  'skill',
  'save',
  'attack',
  'damage',
  'initiative',
  'death_save',
  'hit_die',
  'custom',
]
const expressionPattern =
  /^([1-9][0-9]?)?d(2|3|4|6|8|10|12|20|100)(k[hl]1)?([+-](([1-9][0-9]?)?d(2|3|4|6|8|10|12|20|100)(k[hl]1)?|[0-9]{1,3}))*$/

/** private.roll_eval: null given rolls on the server, otherwise checks the dice against the
 * expression. Returns null when invalid. */
export function rollEval(
  expression: string,
  given: number[] | null,
  random: () => number = Math.random,
): { dice: number[]; total: number } | null {
  if (expression.length < 2 || expression.length > 40 || !expressionPattern.test(expression))
    return null
  if (given && (given.length > 20 || given.some((value) => !Number.isInteger(value)))) return null
  let position = 0
  let total = 0
  const rolled: number[] = []
  for (const match of expression.matchAll(
    /([+-]?)(?:([0-9]{0,2})d([0-9]{1,3})(k[hl]1)?|([0-9]{1,3}))/g,
  )) {
    const sign = match[1] === '-' ? -1 : 1
    if (match[3] === undefined) {
      total += sign * Number(match[5])
      continue
    }
    const count = Number(match[2] || 1)
    const faces = Number(match[3])
    if (match[4] && count < 2) return null
    const part: number[] = []
    for (let n = 0; n < count; n += 1) {
      position += 1
      if (position > 20) return null
      let value: number
      if (!given) value = 1 + Math.floor(random() * faces)
      else {
        if (position > given.length) return null
        value = given[position - 1]!
        if (value < 1 || value > faces) return null
      }
      part.push(value)
      rolled.push(value)
    }
    total +=
      sign *
      (match[4] === 'kh1'
        ? Math.max(...part)
        : match[4] === 'kl1'
          ? Math.min(...part)
          : part.reduce((sum, value) => sum + value, 0))
  }
  if (position === 0 || (given && position !== given.length)) return null
  return { dice: rolled, total }
}

export function createDiceStore(
  initial: { mode?: DiceMode; visibility?: RollVisibility; rolls?: StoredRoll[] } = {},
) {
  const store = {
    dice_mode: initial.mode ?? ('physical' as DiceMode),
    roll_visibility: initial.visibility ?? ('roller_dm' as RollVisibility),
    rolls: [...(initial.rolls ?? [])],
    /** campaign_roll_signals.revision: moves on every roll and on a visibility change. */
    revision: 0,
    settingsRequests: new Map<string, { actor: string; payload: string; result: unknown }>(),
    /** The next set_dice_settings or log_roll fails with this server message (nothing applied). */
    failNext: null as {
      rpc: 'set_dice_settings' | 'log_roll' | 'reset_hit_dice_roll' | 'reset_initiative_roll'
      message: string
    } | null,
    /** The next log_roll is stored but its reply is lost (503): a retry with the same request id
     * must return the stored roll. */
    loseReplyNext: false,
    /** Deterministic server dice for source 'app' (consumed in order, else random). */
    serverDice: [] as number[],
    clock: () => Date.now(),
    /** RYT-137: wired by the page fixtures (rest and combat); nothing is live by default. */
    world: {
      fight: () => null,
      openRest: () => null,
      hitDice: () => null,
    } as DiceWorld,
    /** Rests completed so far: a hit-dice roll lasts until one completes after it. */
    restsCompleted: 0,
    /** The rests completed when each roll was made. */
    epochs: new Map<string, number>(),
    resetRequests: new Map<string, { actor: string; payload: string; result: unknown }>(),
    /** private.roll_in_force: a linked app roll, not superseded, that still counts. */
    inForce(roll: StoredRoll) {
      if (roll.source !== 'app' || roll.superseded_at) return false
      if (roll.kind === 'initiative')
        return (
          Boolean(roll.encounter_id) &&
          roll.encounter_id === store.world.fight(roll.campaign_id)?.id
        )
      if (roll.kind === 'hit_die')
        return Boolean(roll.rest_id) && store.epochs.get(roll.id) === store.restsCompleted
      return false
    },
    /** The server's roll of an expression (the faces given to the store first, else random). */
    evaluate(expression: string) {
      const probe = rollEval(expression, null)
      if (!probe) return null
      const forced =
        store.serverDice.length >= probe.dice.length
          ? rollEval(expression, store.serverDice.slice(0, probe.dice.length))
          : null
      if (forced) store.serverDice = store.serverDice.slice(probe.dice.length)
      return forced ?? probe
    },
    /** Sets a character's roll of a kind aside (the DM's reset); returns the roll set aside. */
    supersede(campaignId: string, characterId: string, kind: 'initiative' | 'hit_die') {
      const found = store.rolls
        .filter(
          (roll) =>
            roll.campaign_id === campaignId &&
            roll.character_id === characterId &&
            roll.kind === kind &&
            store.inForce(roll),
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
      for (const roll of found) roll.superseded_at = new Date(store.clock()).toISOString()
      if (found.length) store.revision += 1
      return found[0]?.id ?? null
    },
    /** get_roll_context for one viewer. `owner` says who plays a character. */
    context(
      viewer: string,
      member: DiceMember | undefined,
      campaignId: string,
      owner: (characterId: string) => string | null | undefined,
    ) {
      if (!member?.active) return null
      const dm = member.role === 'dm'
      const current = store.rolls
        .filter(
          (roll) =>
            roll.campaign_id === campaignId &&
            (roll.kind === 'initiative' || roll.kind === 'hit_die') &&
            store.inForce(roll),
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      const readable = new Set(store.readable(viewer, member, campaignId).map((roll) => roll.id))
      return {
        encounter_id: store.world.fight(campaignId)?.id ?? null,
        rest_id: store.world.openRest(),
        spent: current
          .filter((roll) => dm || owner(roll.character_id ?? '') === viewer)
          .map((roll) => ({ character_id: roll.character_id, kind: roll.kind })),
        rolls: current.filter((roll) => readable.has(roll.id)),
      }
    },
    settings() {
      return { dice_mode: store.dice_mode, roll_visibility: store.roll_visibility }
    },
    /** campaign_rolls_read: own rolls of an active member, and the rolls whose stored visibility,
     * narrowed by the current one, the viewer's role reaches. */
    readable(viewer: string, member: DiceMember | undefined, campaignId: string) {
      if (!member?.active) return [] as StoredRoll[]
      const need = member.role === 'dm' ? 1 : 2
      return store.rolls
        .filter((roll) => {
          if (roll.campaign_id !== campaignId) return false
          if (roll.roller_id === viewer) return true
          return Math.min(rank[roll.visibility], rank[store.roll_visibility]) >= need
        })
        .sort(
          (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id),
        )
    },
    setDiceSettings(
      actor: string,
      member: DiceMember | undefined,
      body: Record<string, unknown>,
    ): DiceReply {
      if (!member?.active || member.role !== 'dm') return refuse('42501', 'Forbidden')
      if (!body.request_id) return refuse('22023', 'Invalid request')
      const payload = JSON.stringify([
        body.target_campaign,
        body.new_dice_mode,
        body.new_roll_visibility,
      ])
      const prior = store.settingsRequests.get(String(body.request_id))
      if (prior)
        return prior.actor === actor && prior.payload === payload
          ? { status: 200, body: prior.result }
          : refuse('22023', 'Request mismatch')
      if (store.failNext?.rpc === 'set_dice_settings') {
        const { message } = store.failNext
        store.failNext = null
        return { status: message === 'Unavailable' ? 503 : 400, body: { message } }
      }
      const mode = String(body.new_dice_mode)
      const visibility = String(body.new_roll_visibility)
      if (!['physical', 'app', 'player'].includes(mode) || !Object.hasOwn(rank, visibility))
        return refuse('22023', 'Invalid settings')
      const result = { dice_mode: mode, roll_visibility: visibility }
      if (visibility !== store.roll_visibility) store.revision += 1
      store.dice_mode = mode as DiceMode
      store.roll_visibility = visibility as RollVisibility
      store.settingsRequests.set(String(body.request_id), { actor, payload, result })
      return { status: 200, body: result }
    },
    logRoll(
      actor: string,
      member: DiceMember | undefined,
      character: (id: string) => DiceCharacter | undefined,
      body: Record<string, unknown>,
    ): DiceReply {
      if (!member?.active) return refuse('42501', 'Forbidden')
      if (!body.request_id) return refuse('22023', 'Invalid request')
      const dm = member.role === 'dm'
      const label = String(body.roll_label ?? '').trim()
      const id = String(body.request_id)
      const prior = store.rolls.find((roll) => roll.id === id)
      if (prior) {
        const recorded = body.roll_source === 'recorded'
        const sameDice =
          JSON.stringify(prior.dice) === JSON.stringify((body.recorded_dice as number[]) ?? [])
        if (
          prior.roller_id !== actor ||
          prior.campaign_id !== body.target_campaign ||
          prior.character_id !== (body.target_character ?? null) ||
          prior.label !== label ||
          prior.expression !== body.roll_expression ||
          prior.kind !== body.roll_kind ||
          prior.source !== body.roll_source ||
          (recorded && (!sameDice || prior.total !== body.recorded_total)) ||
          (!recorded && (body.recorded_dice != null || body.recorded_total != null))
        )
          return refuse('22023', 'Request mismatch')
        return { status: 200, body: prior }
      }
      if (store.failNext?.rpc === 'log_roll') {
        const { message } = store.failNext
        store.failNext = null
        return { status: message === 'Unavailable' ? 503 : 400, body: { message } }
      }
      if (
        !kinds.includes(String(body.roll_kind)) ||
        !['app', 'recorded'].includes(String(body.roll_source)) ||
        label.length > 80 ||
        // eslint-disable-next-line no-control-regex
        /[\u0000-\u001f\u007f]/.test(label)
      )
        return refuse('22023', 'Invalid roll')
      const target = (body.target_character as string | null) ?? null
      if (target === null) {
        if (!dm) return refuse('42501', 'Character unavailable')
      } else {
        const found = character(target)
        if (!found || (!dm && (found.user_id !== actor || found.archived || found.absent)))
          return refuse('42501', 'Character unavailable')
      }
      const expression = String(body.roll_expression)
      const given = (body.recorded_dice as number[] | null) ?? null
      let dice: number[] = []
      let total: number | null = null
      if (body.roll_source === 'app') {
        if (!dm && store.dice_mode === 'physical') return refuse('P0001', 'Dice mode')
        if (given !== null || body.recorded_total != null) return refuse('22023', 'Invalid roll')
        // What a server roll for a character may be: initiative is a d20 with a modifier from
        // -20 to 30, hit dice are N dice of the sheet's die with N up to the dice left.
        if (target !== null && body.roll_kind === 'initiative') {
          const match = /^1?d20(?:([+-])(\d{1,2}))?$/.exec(expression)
          const modifier = match?.[2] ? Number(match[2]) * (match[1] === '-' ? -1 : 1) : 0
          if (!match || modifier < -20 || modifier > 30) return refuse('22023', 'Invalid roll')
        }
        if (target !== null && body.roll_kind === 'hit_die') {
          const sheet = store.world.hitDice(target)
          const match = /^(\d{0,2})d(\d{1,3})(?:[+-]\d{1,3})?$/.exec(expression)
          const count = match ? Number(match[1] || 1) : 0
          if (
            !sheet ||
            !match ||
            ![6, 8, 10, 12].includes(sheet.die) ||
            Number(match[2]) !== sheet.die ||
            count < 1 ||
            count > sheet.left
          )
            return refuse('22023', 'Invalid roll')
        }
        const evaluated = store.evaluate(expression)
        if (evaluated) {
          dice = evaluated.dice
          total = evaluated.total
        }
      } else if (given === null || given.length === 0) {
        const valid = rollEval(expression, null)
        if (valid) {
          dice = []
          total = (body.recorded_total as number | null) ?? null
        }
      } else {
        const evaluated = rollEval(expression, given)
        if (evaluated && evaluated.total === body.recorded_total) {
          dice = evaluated.dice
          total = evaluated.total
        }
      }
      if (total === null || total < -999 || total > 9999) return refuse('22023', 'Invalid roll')
      const now = store.clock()
      if (
        store.rolls.filter(
          (roll) => roll.roller_id === actor && Date.parse(roll.created_at) > now - 60_000,
        ).length >= 30
      )
        return refuse('P0001', 'Roll limit')
      // The fight or rest of a server roll for a character is derived here, never sent.
      let encounterId: string | null = null
      let restId: string | null = null
      if (body.roll_source === 'app' && target !== null) {
        const fight = store.world.fight(String(body.target_campaign))
        if (body.roll_kind === 'initiative')
          encounterId = fight?.characters.includes(target) ? fight.id : null
        if (body.roll_kind === 'hit_die') restId = store.world.openRest()
        if (
          (encounterId || restId) &&
          store.rolls.some(
            (roll) =>
              roll.campaign_id === body.target_campaign &&
              roll.character_id === target &&
              roll.kind === body.roll_kind &&
              store.inForce(roll),
          )
        )
          return refuse('P0001', 'Already rolled')
      }
      const saved: StoredRoll = {
        id,
        campaign_id: String(body.target_campaign),
        character_id: target,
        roller_id: actor,
        label,
        expression,
        dice,
        total,
        kind: String(body.roll_kind),
        source: body.roll_source as 'app' | 'recorded',
        visibility: store.roll_visibility,
        created_at: new Date(now).toISOString(),
        encounter_id: encounterId,
        rest_id: restId,
        superseded_at: null,
      }
      store.epochs.set(id, store.restsCompleted)
      store.rolls.push(saved)
      store.rolls = store.rolls
        .sort(
          (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id),
        )
        .slice(0, 200)
      store.revision += 1
      if (store.loseReplyNext) {
        store.loseReplyNext = false
        return { status: 503, body: { message: 'Unavailable' } }
      }
      return { status: 200, body: saved }
    },
    /** reset_hit_dice_roll: the DM sets a character's hit-dice roll aside; the vote made with it
     * goes too (`removeVote` says whether there was one). Idempotent on the request id. */
    resetHitDice(
      actor: string,
      member: DiceMember | undefined,
      character: (id: string) => DiceCharacter | undefined,
      body: Record<string, unknown>,
      removeVote: (characterId: string) => boolean,
    ): DiceReply {
      if (!member?.active || member.role !== 'dm') return refuse('42501', 'Forbidden')
      if (!body.request_id) return refuse('22023', 'Invalid request')
      const payload = JSON.stringify([body.target_campaign, body.target_character])
      const prior = store.resetRequests.get(String(body.request_id))
      if (prior)
        return prior.actor === actor && prior.payload === payload
          ? { status: 200, body: prior.result }
          : refuse('22023', 'Request mismatch')
      if (store.failNext?.rpc === 'reset_hit_dice_roll') {
        const { message } = store.failNext
        store.failNext = null
        return { status: message === 'Unavailable' ? 503 : 400, body: { message } }
      }
      const target = String(body.target_character)
      if (!character(target)) return refuse('42501', 'Character unavailable')
      const old = store.supersede(String(body.target_campaign), target, 'hit_die')
      const cleared = old !== null && store.world.openRest() !== null ? removeVote(target) : false
      const result = { superseded_roll: old, vote_cleared: cleared }
      store.resetRequests.set(String(body.request_id), { actor, payload, result })
      return { status: 200, body: result }
    },
  }
  return store
}
export type DiceStore = ReturnType<typeof createDiceStore>
