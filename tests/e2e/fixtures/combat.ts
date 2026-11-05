import type { Page } from '@playwright/test'
import { beaId, catoId, characterId, dmId, peerId, playerId, hiddenPeerId } from './identity.ts'

// RYT-007 SDK contract fixture: one in-memory combat state shared by several browser contexts.
// It mirrors the RPC results and the role projection the UI relies on; authorization, atomicity
// and the real projection are verified against PostgreSQL in tests/database/combat.test.ts.
type Row = {
  id: string
  kind: 'character' | 'npc' | 'lair'
  character_id?: string
  /** RYT-043: the bestiary template an NPC came from (its image follows the template). */
  template_id?: string
  side: 'party' | 'ally' | 'enemy'
  name: string
  initiative?: number
  initiative_bonus: number
  order_key: number
  group_key?: string
  max_hp: number
  current_hp: number
  temp_hp: number
  armor_class: number
  hidden: boolean
  hp_revealed: boolean
  conditions: string[]
  defeated: boolean
  concentration?: string
  ds: number
  df: number
  dm_notes: string
  created: number
  /** ADR 028: table alias, SRD origin and DM-only trackers. */
  public_name?: string
  srd_id?: string
  trackers?: Record<string, unknown>[]
}
type Event = {
  id: string
  kind: string
  round: number
  actor: string
  source?: string
  target?: string
  target_name?: string
  amount?: number
  detail: Record<string, unknown>
  before?: Snapshot
  after?: Snapshot
  visible: boolean
  undone_by?: string
  created: number
}
type Snapshot = Pick<Row, 'current_hp' | 'temp_hp' | 'conditions' | 'defeated' | 'ds' | 'df'> & {
  concentration?: string
}
/** A timed effect (public.encounter_effects). Turn ticking and expiry are not simulated. */
type Fx = {
  id: string
  target: string
  source: string | null
  label: string
  condition: string | null
  remaining_rounds: number | null
  ticks_on: 'start' | 'end'
  visible: boolean
}
type Encounter = {
  id: string
  name: string
  status: 'draft' | 'initiative' | 'active' | 'ended'
  round: number
  active?: string
  revision: number
  combatants: Row[]
  events: Event[]
  effects: Fx[]
  summary: Record<string, unknown> | null
  updated: number
}
const srdConditions = [
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
]

const owners: Record<string, string> = {
  [characterId]: playerId,
  [beaId]: peerId,
  [catoId]: hiddenPeerId,
}
const pcs: Record<string, { name: string; hp: number; ac: number; shares: boolean }> = {
  [characterId]: { name: 'Arin', hp: 24, ac: 16, shares: true },
  [beaId]: { name: 'Bea', hp: 18, ac: 14, shares: true },
  [catoId]: { name: 'Cato', hp: 30, ac: 18, shares: false },
}
let counter = 0
const uuid = (prefix: string) => `${prefix}-0000-4000-8000-${String(++counter).padStart(12, '0')}`

export function combatServer() {
  const encounters: Encounter[] = []
  const templates: Record<string, unknown>[] = []
  /** RYT-043: current portrait path per character (character_sheets.portrait_path). */
  const portraits: Record<string, string> = {}
  const requests = new Map<string, unknown>()
  const find = (id: unknown) => encounters.find((e) => e.id === id)
  const owning = (id: unknown) => encounters.find((e) => e.combatants.some((c) => c.id === id))
  const order = (e: Encounter, turnsOnly: boolean) =>
    [...e.combatants]
      .filter((c) => !turnsOnly || (!c.hidden && !c.defeated))
      .sort(
        (a, b) =>
          (b.initiative ?? -999) - (a.initiative ?? -999) ||
          b.initiative_bonus - a.initiative_bonus ||
          a.order_key - b.order_key ||
          a.created - b.created ||
          a.name.localeCompare(b.name),
      )
  const snap = (c: Row): Snapshot => ({
    current_hp: c.current_hp,
    temp_hp: c.temp_hp,
    conditions: [...c.conditions],
    defeated: c.defeated,
    ds: c.ds,
    df: c.df,
    concentration: c.concentration,
  })
  const log = (
    e: Encounter,
    actor: string,
    kind: string,
    target?: Row,
    extra: Partial<Event> = {},
  ) => {
    const event: Event = {
      id: uuid('e0000000'),
      kind,
      round: e.round,
      actor,
      source: e.active,
      target: target?.id,
      target_name: target?.name,
      detail: {},
      visible: !target?.hidden,
      created: Date.now() + counter,
      ...extra,
    }
    e.events.unshift(event)
    return event
  }
  const bump = (e: Encounter) => {
    e.revision += 1
    e.updated = Date.now()
  }
  const canAct = (actor: string, c: Row) =>
    actor === dmId || (c.kind === 'character' && owners[c.character_id!] === actor)
  const status = (c: Row) =>
    c.current_hp <= 0 || (c.defeated && c.kind !== 'character')
      ? 'down'
      : c.current_hp >= c.max_hp
        ? 'unhurt'
        : c.current_hp * 2 > c.max_hp
          ? 'wounded'
          : 'bloodied'
  // RYT-043 (20261107120000_combat_media.sql): five named bands.
  const band = (c: Row) =>
    c.current_hp <= 0 || (c.defeated && c.kind !== 'character')
      ? 'down'
      : c.current_hp >= c.max_hp
        ? 'unhurt'
        : c.current_hp * 2 > c.max_hp
          ? 'wounded'
          : c.current_hp * 4 > c.max_hp
            ? 'bloodied'
            : 'critical'
  const imageOf = (c: Row) =>
    c.kind === 'character'
      ? portraits[c.character_id!]
      : c.kind === 'npc'
        ? ((templates.find((t) => t.id === c.template_id)?.image_path as string | null) ??
          undefined)
        : undefined

  const project = (e: Encounter, actor: string, table: boolean) => {
    const full = actor === dmId && !table
    const turns = order(e, true).map((c) => c.id)
    const activeHidden = e.combatants.find((c) => c.id === e.active)?.hidden
    const combatants = order(e, false)
      .filter((c) => full || !c.hidden)
      .map((c) => {
        const own = c.kind === 'character' && !table && owners[c.character_id!] === actor
        const shared = c.kind === 'character' && pcs[c.character_id!]!.shares
        const vitals = full || own || shared
        const row: Record<string, unknown> = {
          id: c.id,
          kind: c.kind,
          side: c.side,
          name: full ? c.name : (c.public_name ?? c.name),
          public_name: full ? c.public_name : undefined,
          srd_id: full ? c.srd_id : undefined,
          template_id: full ? c.template_id : undefined,
          trackers: full && c.trackers?.length ? c.trackers : undefined,
          initiative: c.initiative,
          initiative_bonus: full || own ? c.initiative_bonus : undefined,
          in_turn_order: turns.includes(c.id),
          is_active: c.id === e.active,
          is_own: own,
          can_act: own || full,
          defeated: c.defeated,
          character_id: full || own ? c.character_id : undefined,
          hidden: full ? c.hidden : undefined,
          shares_live: full && c.kind === 'character' ? shared : undefined,
          hp_revealed: full ? c.hp_revealed : undefined,
          dm_notes: full ? c.dm_notes : undefined,
        }
        row.image_path = !full && c.public_name ? undefined : imageOf(c)
        if (c.kind !== 'lair') {
          row.hp_status = c.kind === 'character' && !vitals ? 'unknown' : status(c)
          row.hp_band = c.kind === 'character' && !vitals ? 'unknown' : band(c)
          if (vitals || (c.kind === 'npc' && c.hp_revealed))
            row.hp = { current: c.current_hp, max: c.max_hp, temp: c.temp_hp }
          if (vitals) row.armor_class = c.armor_class
          if (c.kind !== 'character' || vitals) {
            row.conditions = c.conditions
            row.concentration = c.concentration
          }
          if (c.kind === 'character' && vitals) {
            row.death_saves = { successes: c.ds, failures: c.df }
            row.exhaustion = 0
          }
          // RYT-045 (20261108120000_combat_player_death_saves.sql): outcomes for everyone.
          if (c.kind === 'character' && !c.defeated) {
            const last = e.events.find(
              (x) =>
                x.kind === 'death_save' && x.target === c.id && x.round === e.round && !x.undone_by,
            )
            if (c.current_hp <= 0 && c.ds >= 3) row.death_state = 'stable'
            else if (c.current_hp > 0 && e.status === 'active' && last?.detail.result === 'up')
              row.death_state = 'revived'
          }
        }
        return JSON.parse(JSON.stringify(row))
      })
    return {
      viewer: { role: full ? 'dm' : table ? 'table' : 'player' },
      encounter: {
        id: e.id,
        name: e.name,
        status: e.status,
        round: e.round,
        active_combatant: full || !activeHidden ? (e.active ?? null) : null,
        revision: e.revision,
        started_at: null,
        ended_at: null,
        updated_at: new Date(e.updated).toISOString(),
        // Same as get_combat_state: Players and the table never see hidden combatants in the
        // summary either (20261104130000_combat_state_booleans.sql).
        summary:
          full || !e.summary
            ? e.summary
            : {
                ...e.summary,
                combatants: (e.summary.combatants as { combatant_id: string }[]).filter(
                  (row) => !e.combatants.find((c) => c.id === row.combatant_id)?.hidden,
                ),
              },
      },
      combatants,
      // Same projection as public.get_combat_state: the DM sees every effect, others only
      // visible effects on visible targets; Players remove effects on their own character.
      effects: e.effects
        .filter((f) => full || (f.visible && !e.combatants.find((c) => c.id === f.target)?.hidden))
        .map((f) => {
          const target = e.combatants.find((c) => c.id === f.target)
          const source = e.combatants.find((c) => c.id === f.source)
          return {
            id: f.id,
            target_combatant: f.target,
            source_combatant: full || !source?.hidden ? f.source : null,
            label: f.label,
            condition: f.condition,
            remaining_rounds: f.remaining_rounds,
            ticks_on: f.ticks_on,
            visible: f.visible,
            can_remove:
              full ||
              (!table && target?.kind === 'character' && owners[target.character_id!] === actor),
          }
        }),
      events: e.events
        .filter((x) => full || x.visible)
        .slice(0, 60)
        .map((x) =>
          JSON.parse(
            JSON.stringify({
              id: x.id,
              kind: x.kind,
              round: x.round,
              target_combatant: x.target,
              target_name: full
                ? x.target_name
                : (e.combatants.find((c) => c.id === x.target)?.public_name ?? x.target_name),
              amount: x.amount,
              source_name: e.combatants.find((c) => c.id === x.source && (full || !c.hidden))?.name,
              detail: x.detail,
              undone: Boolean(x.undone_by),
              visible: full ? x.visible : undefined,
              mine: x.actor === actor,
              undoable:
                Boolean(x.before) &&
                !x.undone_by &&
                ['initiative', 'active'].includes(e.status) &&
                !table &&
                (full ||
                  (x.actor === actor &&
                    owners[e.combatants.find((c) => c.id === x.target)?.character_id ?? ''] ===
                      actor)),
              created_at: new Date(x.created).toISOString(),
            }),
          ),
        ),
    }
  }

  const result = (e: Encounter, extra: Record<string, unknown> = {}) => ({
    encounter_id: e.id,
    status: e.status,
    round: e.round,
    active_combatant: e.active ?? null,
    revision: e.revision,
    ...extra,
  })

  function handle(actor: string, method: string, body: Record<string, unknown>): unknown {
    const dm = actor === dmId
    const fail = (message: string) => ({ error: message })
    if (method === 'list_encounters')
      return encounters
        .filter((e) => dm || e.status !== 'draft')
        .map((e) => ({
          id: e.id,
          name: e.name,
          status: e.status,
          round: e.round,
          updated_at: new Date(e.updated).toISOString(),
          started_at: null,
          ended_at: null,
          combatants: e.combatants.filter((c) => dm || !c.hidden).length,
          needs_initiative:
            ['initiative', 'active'].includes(e.status) &&
            e.combatants.some(
              (c) => c.initiative === undefined && owners[c.character_id ?? ''] === actor,
            ),
        }))
    if (method === 'get_combat_state') {
      const table = body.as_table === true
      const e = body.target_encounter
        ? find(body.target_encounter)
        : (encounters.find((x) => ['initiative', 'active'].includes(x.status)) ??
          encounters.filter((x) => x.status === 'ended').at(-1))
      if (!e) return body.target_encounter ? fail('Encounter unavailable') : { encounter: null }
      if (e.status === 'draft' && (!dm || table)) return fail('Encounter unavailable')
      return project(e, actor, table)
    }
    if (method === 'list_combatant_templates') return dm ? templates : fail('Forbidden')
    if (method === 'list_creature_srd_images')
      return dm
        ? [...srdImages].map(([srd_id, image_path]) => ({
            srd_id,
            image_path,
            updated_at: '2026-11-05',
          }))
        : fail('Forbidden')
    // Mutations: retried request ids replay.
    const key = String(body.request_id ?? '')
    if (key && requests.has(key)) return requests.get(key)
    const out = mutate(actor, dm, method, body)
    if (key && !(typeof out === 'object' && out && 'error' in out)) requests.set(key, out)
    return out
  }

  function mutate(actor: string, dm: boolean, method: string, body: Record<string, unknown>) {
    const fail = (message: string) => ({ error: message })
    const dmOnly = new Set([
      'create_encounter',
      'rename_encounter',
      'delete_encounter',
      'set_encounter_status',
      'add_combatants',
      'update_combatant',
      'remove_combatant',
      'roll_npc_initiative',
      'set_turn_order',
      'set_active_turn',
      'save_combatant_template',
      'delete_combatant_template',
      'set_combatant_template_image',
      'set_combatant_tracker',
      'set_creature_srd_image',
    ])
    if (dmOnly.has(method) && !dm) return fail('Forbidden')
    if (method === 'create_encounter') {
      const e: Encounter = {
        id: uuid('e1000000'),
        name: String(body.encounter_name),
        status: 'draft',
        round: 0,
        revision: 0,
        combatants: [],
        events: [],
        effects: [],
        summary: null,
        updated: Date.now(),
      }
      encounters.push(e)
      return result(e)
    }
    if (method === 'save_combatant_template') {
      const data = Object.fromEntries(
        Object.entries(body.data as Record<string, unknown>).filter(([, v]) => v !== null),
      )
      const updated_at = new Date(Date.now() + counter++).toISOString()
      if (body.target_template) {
        const row = templates.find((t) => t.id === body.target_template)
        if (!row) return fail('Template unavailable')
        if (row.revision !== body.expected_revision) return fail('Stale revision')
        Object.assign(row, data, { revision: Number(row.revision) + 1, updated_at })
        return { id: row.id, revision: row.revision }
      }
      const row = { id: uuid('e2000000'), revision: 0, image_path: null, updated_at, ...data }
      templates.push(row)
      return { id: row.id, revision: 0 }
    }
    if (method === 'delete_combatant_template') {
      const at = templates.findIndex((t) => t.id === body.target_template)
      if (at >= 0) templates.splice(at, 1)
      return { deleted: at >= 0 }
    }
    if (method === 'set_combatant_template_image') {
      const row = templates.find((t) => t.id === body.target_template)
      if (!row) return fail('Template unavailable')
      if (row.revision !== body.expected_revision) return fail('Stale revision')
      if (body.new_path !== null && !uploads.has(String(body.new_path)))
        return fail('Image unavailable')
      row.image_path = body.new_path
      row.revision = Number(row.revision) + 1
      for (const e of encounters) if (e.combatants.some((c) => c.template_id === row.id)) bump(e)
      return { id: row.id, revision: row.revision, image_path: row.image_path }
    }
    if (method === 'set_creature_srd_image') {
      const srd = String(body.target_srd)
      if (body.new_path === null) srdImages.delete(srd)
      else {
        if (!uploads.has(String(body.new_path)) || !String(body.new_path).includes(`/srd-${srd}/`))
          return fail('Image unavailable')
        srdImages.set(srd, String(body.new_path))
      }
      return { srd_id: srd, image_path: body.new_path }
    }
    const e =
      find(body.target_encounter) ??
      owning(body.target_combatant) ??
      encounters.find((x) => x.events.some((ev) => ev.id === body.target_event)) ??
      encounters.find((x) => x.effects.some((f) => f.id === body.target_effect))
    if (!e) return fail('Encounter unavailable')
    const target = e.combatants.find((c) => c.id === body.target_combatant)
    switch (method) {
      case 'rename_encounter':
        e.name = String(body.encounter_name)
        break
      case 'delete_encounter':
        encounters.splice(encounters.indexOf(e), 1)
        return { deleted: true }
      case 'set_encounter_status': {
        const next = body.new_status as Encounter['status']
        if (next === 'active') {
          const first = order(e, true)[0]
          if (!first) return fail('No combatants')
          e.round = 1
          e.active = first.id
        }
        if (next === 'ended') {
          e.active = undefined
          e.summary = {
            rounds: e.round,
            combatants: e.combatants.map((c) => ({
              combatant_id: c.id,
              name: c.name,
              kind: c.kind,
              side: c.side,
              defeated: c.defeated,
              damage_taken: e.events
                .filter((x) => x.kind === 'damage' && x.target === c.id && !x.undone_by)
                .reduce((sum, x) => sum + (x.amount ?? 0), 0),
              damage_dealt: e.events
                .filter(
                  (x) =>
                    x.kind === 'damage' && x.source === c.id && x.target !== c.id && !x.undone_by,
                )
                .reduce((sum, x) => sum + (x.amount ?? 0), 0),
              healing: 0,
              downed: false,
            })),
          }
        }
        e.status = next
        log(e, actor, 'status', undefined, { detail: { status: next } })
        break
      }
      case 'add_combatants':
        for (const entry of body.entries as Record<string, unknown>[]) {
          if (entry.kind === 'character') {
            const id = String(entry.character_id)
            if (e.combatants.some((c) => c.character_id === id)) continue
            const pc = pcs[id]!
            const row: Row = {
              id: uuid('e3000000'),
              kind: 'character',
              character_id: id,
              side: 'party',
              name: pc.name,
              // RYT-041: a character joining a running fight brings its initiative total.
              initiative: typeof entry.initiative === 'number' ? entry.initiative : undefined,
              initiative_bonus: 0,
              order_key: 0,
              max_hp: pc.hp,
              current_hp: pc.hp,
              temp_hp: 0,
              armor_class: pc.ac,
              hidden: false,
              hp_revealed: false,
              conditions: [],
              defeated: false,
              ds: 0,
              df: 0,
              dm_notes: '',
              created: Date.now() + counter,
            }
            e.combatants.push(row)
            log(e, actor, 'join', row, { amount: row.initiative })
          } else {
            const count = Number(entry.count ?? 1)
            const base = String(entry.name ?? 'Lair')
            const group = count > 1 && entry.share_initiative ? `${base}:${uuid('g')}` : undefined
            const alias = typeof entry.public_name === 'string' ? entry.public_name : undefined
            const trackers = ((entry.trackers as Record<string, unknown>[] | undefined) ?? []).map(
              (t) => (t.kind === 'recharge' ? { ...t, spent: false } : { ...t, used: 0 }),
            )
            for (let i = 1; i <= count; i++) {
              const row: Row = {
                id: uuid('e3000000'),
                kind: entry.kind === 'lair' ? 'lair' : 'npc',
                template_id: typeof entry.template_id === 'string' ? entry.template_id : undefined,
                side: (entry.side as Row['side']) ?? 'enemy',
                name: count > 1 ? `${base} ${i}` : base,
                initiative: entry.kind === 'lair' ? 20 : undefined,
                initiative_bonus: Number(
                  entry.initiative_bonus ?? (entry.kind === 'lair' ? -20 : 0),
                ),
                order_key: entry.kind === 'lair' ? 1000 : 0,
                group_key: group,
                max_hp: Number(entry.max_hp ?? 1),
                current_hp: Number(entry.max_hp ?? 1),
                temp_hp: 0,
                armor_class: Number(entry.armor_class ?? 10),
                hidden: entry.hidden === true,
                hp_revealed: false,
                conditions: [],
                defeated: false,
                ds: 0,
                df: 0,
                dm_notes: String(entry.dm_notes ?? ''),
                created: Date.now() + counter,
                public_name: alias ? (count > 1 ? `${alias} ${i}` : alias) : undefined,
                srd_id: typeof entry.srd_id === 'string' ? entry.srd_id : undefined,
                trackers: trackers.map((t) => ({ ...t })),
              }
              e.combatants.push(row)
              log(e, actor, 'join', row)
            }
          }
        }
        break
      case 'update_combatant': {
        if (!target) return fail('Combatant unavailable')
        const patch = body.patch as Record<string, unknown>
        const wasHidden = target.hidden
        const alias = target.public_name
        Object.assign(target, patch)
        if (patch.public_name === null || patch.public_name === '') delete target.public_name
        if (wasHidden && !target.hidden) log(e, actor, 'reveal', target)
        if (alias && !target.public_name) log(e, actor, 'reveal', target, { detail: { alias } })
        break
      }
      case 'set_combatant_tracker': {
        const tracker = target?.trackers?.find((t) => t.key === body.tracker_key)
        if (!target || !tracker) return fail('Invalid request')
        if (tracker.kind === 'recharge') tracker.spent = body.tracker_value === 1
        else tracker.used = Number(body.tracker_value)
        break
      }
      case 'remove_combatant': {
        // Mirrors public.remove_combatant (RYT-041): the active combatant passes the turn forward
        // from its slot (wrapping into the next round) and effects on it end.
        if (!target) return fail('Combatant unavailable')
        const wasActive = e.status === 'active' && e.active === target.id
        const all = order(e, false).map((c) => c.id)
        const turns = order(e, true).filter((c) => c.id !== target.id)
        let next = wasActive
          ? turns.find((c) => all.indexOf(c.id) > all.indexOf(target.id))
          : undefined
        let wrapped = false
        if (wasActive && !next && turns.length > 0) {
          next = turns[0]
          wrapped = true
        }
        for (const effect of e.effects.filter((f) => f.target === target.id)) {
          e.effects.splice(e.effects.indexOf(effect), 1)
          log(e, actor, 'effect_off', target, { detail: { label: effect.label } })
        }
        log(e, actor, 'leave', target)
        e.combatants.splice(e.combatants.indexOf(target), 1)
        if (wasActive) {
          if (wrapped) e.round += 1
          e.active = next?.id
          if (next) log(e, actor, wrapped ? 'round' : 'turn', next)
        }
        break
      }
      case 'set_initiative':
        if (!target) return fail('Combatant unavailable')
        if (!canAct(actor, target)) return fail('Forbidden')
        // RYT-042 (20261106120000): Players only while initiative is collected, or later only a
        // missing total.
        if (!dm && (e.status === 'ended' || e.status === 'draft')) return fail('Encounter closed')
        if (!dm && e.status === 'active' && target.initiative !== undefined)
          return fail('Initiative closed')
        for (const c of e.combatants)
          if (c.id === target.id || (target.group_key && c.group_key === target.group_key)) {
            c.initiative = Number(body.initiative_total)
            if (body.tiebreak_bonus !== null) c.initiative_bonus = Number(body.tiebreak_bonus)
          }
        log(e, actor, 'initiative', target, { amount: Number(body.initiative_total) })
        break
      case 'roll_npc_initiative': {
        const rolled = new Set<string>()
        for (const c of e.combatants.filter(
          (x) => x.kind !== 'character' && x.initiative === undefined,
        )) {
          if (c.group_key && rolled.has(c.group_key)) continue
          // Deterministic "roll" so screenshots and turn order are stable.
          const value = 12 + c.initiative_bonus
          for (const x of e.combatants)
            if (x.id === c.id || (c.group_key && x.group_key === c.group_key)) x.initiative = value
          if (c.group_key) rolled.add(c.group_key)
          log(e, actor, 'initiative', c, { amount: value, detail: { rolled: true } })
        }
        break
      }
      case 'set_turn_order':
        ;(body.ordered_ids as string[]).forEach((id, index) => {
          const c = e.combatants.find((x) => x.id === id)
          if (c && c.kind !== 'lair') c.order_key = index
        })
        break
      case 'advance_turn': {
        if (e.status !== 'active') return fail('Encounter closed')
        const current = e.combatants.find((c) => c.id === e.active)
        if (!dm && !(current && canAct(actor, current) && body.direction === 1))
          return fail('Forbidden')
        if ((body.expected_active ?? null) !== (e.active ?? null)) return fail('Stale turn')
        const all = order(e, false).map((c) => c.id)
        const turns = order(e, true)
        const pos = all.indexOf(e.active ?? '')
        const direction = Number(body.direction)
        let next =
          direction === 1
            ? turns.find((c) => all.indexOf(c.id) > pos)
            : [...turns].reverse().find((c) => all.indexOf(c.id) < pos)
        let kind = 'turn'
        if (!next) {
          if (direction === 1) {
            next = turns[0]
            e.round += 1
            kind = 'round'
          } else {
            if (e.round <= 1) return fail('First turn')
            next = turns.at(-1)
            e.round -= 1
          }
        }
        e.active = next!.id
        log(e, actor, kind, next)
        break
      }
      case 'set_active_turn':
        if (!target) return fail('Combatant unavailable')
        e.active = target.id
        log(e, actor, 'turn', target)
        break
      case 'apply_combat_hp': {
        if (!['initiative', 'active'].includes(e.status)) return fail('Encounter closed')
        const hits: Record<string, unknown>[] = []
        for (const hit of body.hits as { combatant_id: string; amount: number }[]) {
          const c = e.combatants.find((x) => x.id === hit.combatant_id)
          if (!c || (c.hidden && !dm)) return fail('Combatant unavailable')
          if (!canAct(actor, c)) return fail('Forbidden')
          const before = snap(c)
          const detail: Record<string, unknown> = {}
          const amount = hit.amount
          if (body.hp_mode === 'damage') {
            if (c.concentration && amount > 0) {
              detail.concentration_dc = Math.min(30, Math.max(10, Math.floor(amount / 2)))
              detail.concentration = c.concentration
            }
            const absorbed = Math.min(c.temp_hp, amount)
            c.temp_hp -= absorbed
            if (c.current_hp > 0 && amount - absorbed >= c.current_hp) {
              if (c.kind === 'character') c.conditions.push('unconscious')
              else c.defeated = true
              detail.result = c.kind === 'character' ? 'down' : 'defeated'
            }
            c.current_hp = Math.max(0, c.current_hp - (amount - absorbed))
          } else if (body.hp_mode === 'heal') {
            if (c.current_hp === 0 && amount > 0) {
              c.conditions = c.conditions.filter((x) => x !== 'unconscious')
              c.defeated = false
              c.ds = 0
              c.df = 0
            }
            c.current_hp = Math.min(c.max_hp, c.current_hp + amount)
          } else c.temp_hp = Math.max(c.temp_hp, amount)
          log(e, actor, String(body.hp_mode), c, { amount, detail, before, after: snap(c) })
          if (c.defeated && !before.defeated) log(e, actor, 'defeated', c)
          hits.push({ combatant_id: c.id, name: c.name, ...detail })
        }
        bump(e)
        return result(e, { hits })
      }
      case 'set_combat_condition': {
        if (!target) return fail('Combatant unavailable')
        if (!canAct(actor, target)) return fail('Forbidden')
        const before = snap(target)
        const key = String(body.condition_key)
        target.conditions = body.enabled
          ? [...new Set([...target.conditions, key])]
          : target.conditions.filter((x) => x !== key)
        log(e, actor, body.enabled ? 'condition_on' : 'condition_off', target, {
          detail: { condition: key },
          before,
          after: snap(target),
        })
        break
      }
      case 'set_concentration':
        if (!target) return fail('Combatant unavailable')
        if (!canAct(actor, target)) return fail('Forbidden')
        target.concentration = (body.spell as string | null) ?? undefined
        log(e, actor, 'concentration', target, { detail: { spell: body.spell } })
        break
      case 'add_combat_effect': {
        // Mirrors public.add_combat_effect: the target's condition is applied with the effect.
        const fx = (body.effect ?? {}) as Record<string, unknown>
        const c = e.combatants.find((x) => x.id === fx.target_combatant)
        if (!c) return fail('Combatant unavailable')
        if (!canAct(actor, c)) return fail('Forbidden')
        const label = String(fx.label ?? '').trim()
        const condition = (fx.condition as string | null | undefined) ?? null
        if (c.kind === 'lair' || !label || label.length > 60) return fail('Invalid request')
        if (condition !== null && !srdConditions.includes(condition)) return fail('Invalid request')
        const effect: Fx = {
          id: uuid('e3000000'),
          target: c.id,
          source: (fx.source_combatant as string | null | undefined) ?? null,
          label,
          condition,
          remaining_rounds: (fx.rounds as number | null | undefined) ?? null,
          ticks_on: fx.ticks_on === 'start' ? 'start' : 'end',
          visible: !dm || fx.visible !== false,
        }
        e.effects.push(effect)
        if (condition) c.conditions = [...new Set([...c.conditions, condition])]
        log(e, actor, 'effect_on', c, {
          amount: effect.remaining_rounds ?? undefined,
          detail: { label, condition },
          visible: effect.visible,
        })
        bump(e)
        return result(e, { effect_id: effect.id })
      }
      case 'remove_combat_effect': {
        // Mirrors private.combat_drop_effect: the condition stays while another effect grants it.
        const effect = e.effects.find((f) => f.id === body.target_effect)
        const c = e.combatants.find((x) => x.id === effect?.target)
        if (!effect || !c) return fail('Effect unavailable')
        if (!canAct(actor, c) || (!effect.visible && !dm)) return fail('Effect unavailable')
        e.effects.splice(e.effects.indexOf(effect), 1)
        if (
          effect.condition &&
          !e.effects.some((f) => f.target === c.id && f.condition === effect.condition)
        )
          c.conditions = c.conditions.filter((x) => x !== effect.condition)
        log(e, actor, 'effect_off', c, {
          detail: { label: effect.label, condition: effect.condition },
          visible: effect.visible,
        })
        break
      }
      // RYT-045: a Player rolls the own death save on the own turn, once per round.
      case 'record_death_save': {
        if (!['initiative', 'active'].includes(e.status)) return fail('Encounter closed')
        if (!target || (target.hidden && !dm)) return fail('Combatant unavailable')
        if (!canAct(actor, target)) return fail('Forbidden')
        const outcome = String(body.outcome)
        if (
          target.kind !== 'character' ||
          !['success', 'failure', 'nat1', 'nat20'].includes(outcome)
        )
          return fail('Invalid request')
        if (target.current_hp !== 0 || target.defeated || (!dm && target.ds >= 3))
          return fail('Not dying')
        if (!dm) {
          if (e.status !== 'active' || e.active !== target.id) return fail('Not your turn')
          if (
            e.events.some(
              (x) =>
                x.kind === 'death_save' &&
                x.target === target.id &&
                x.round === e.round &&
                !x.undone_by,
            )
          )
            return fail('Already rolled')
        }
        const before = snap(target)
        let outcomeResult: string | null = null
        if (outcome === 'nat20') {
          target.current_hp = 1
          target.ds = 0
          target.df = 0
          target.conditions = target.conditions.filter((x) => x !== 'unconscious')
          outcomeResult = 'up'
        } else if (outcome === 'success') {
          target.ds = Math.min(3, target.ds + 1)
          if (target.ds >= 3) outcomeResult = 'stable'
        } else {
          target.df = Math.min(3, target.df + (outcome === 'nat1' ? 2 : 1))
          if (target.df >= 3) {
            outcomeResult = 'dead'
            target.defeated = true
          }
        }
        log(e, actor, 'death_save', target, {
          detail: { outcome, result: outcomeResult },
          before,
          after: snap(target),
        })
        if (outcomeResult === 'dead') log(e, actor, 'defeated', target)
        bump(e)
        return result(e, { result: outcomeResult })
      }
      case 'undo_combat_event': {
        const event = e.events.find((x) => x.id === body.target_event)
        if (!event?.before || !event.after) return fail('Not undoable')
        if (event.undone_by) return fail('Already undone')
        const c = e.combatants.find((x) => x.id === event.target)!
        if (!dm && event.actor !== actor) return fail('Forbidden')
        if (JSON.stringify(snap(c)) !== JSON.stringify(event.after)) return fail('Undo conflict')
        Object.assign(c, event.before)
        event.undone_by = log(e, actor, 'undo', c, { amount: event.amount }).id
        break
      }
      default:
        return fail(`Unhandled combat route ${method}`)
    }
    bump(e)
    return result(e)
  }

  /** Objects uploaded to the creature-images bucket (RYT-043). */
  const uploads = new Set<string>()
  /** RYT-053: the DM's own image per SRD creature (srd id -> path). */
  const srdImages = new Map<string, string>()
  /** Every bucket/path a page asked to sign (RYT-043 privacy checks). */
  const signed: string[] = []
  /** Which illustration a stored path shows: a part of the path (an id) to an artwork name. */
  const art: Record<string, keyof typeof artwork> = {}

  return {
    encounters,
    templates,
    portraits,
    uploads,
    srdImages,
    /** Runs one RPC as `actor` (defaults to the DM), as the browser would. */
    act(method: string, body: Record<string, unknown>, actor = dmId) {
      return handle(actor, method, body)
    },
    /** RYT-042: Arin, Bea and two goblins while the DM collects initiative (no totals yet). */
    seedInitiative() {
      const e = mutate(dmId, true, 'create_encounter', { encounter_name: 'Bridge ambush' }) as {
        encounter_id: string
      }
      mutate(dmId, true, 'add_combatants', {
        target_encounter: e.encounter_id,
        entries: [
          { kind: 'character', character_id: characterId },
          { kind: 'character', character_id: beaId },
          { kind: 'npc', name: 'Goblin', count: 2, max_hp: 7, armor_class: 15 },
        ],
      })
      mutate(dmId, true, 'set_encounter_status', {
        target_encounter: e.encounter_id,
        new_status: 'initiative',
      })
      return e.encounter_id
    },
    /** An active encounter with Arin acting first and two visible goblins. */
    seedActive() {
      const e = mutate(dmId, true, 'create_encounter', { encounter_name: 'Bridge ambush' }) as {
        encounter_id: string
      }
      const id = e.encounter_id
      mutate(dmId, true, 'add_combatants', {
        target_encounter: id,
        entries: [
          { kind: 'character', character_id: characterId },
          { kind: 'character', character_id: beaId },
          { kind: 'npc', name: 'Goblin', count: 2, max_hp: 7, armor_class: 15 },
        ],
      })
      const encounter = find(id)!
      encounter.combatants.forEach((c, index) => (c.initiative = 20 - index))
      mutate(dmId, true, 'set_encounter_status', { target_encounter: id, new_status: 'active' })
    },
    /** RYT-043: signed URLs and image bytes for private combat images, plus creature uploads.
     * Each stored path gets its own signed URL, so tests can tell which images a page asked for. */
    signed,
    art,
    async install(page: Page) {
      await page.route(
        /\/storage\/v1\/object\/sign\/(character-portraits|creature-images)\/(.+)$/,
        async (route) => {
          const path = decodeURIComponent(
            new URL(route.request().url()).pathname.split('/sign/')[1]!,
          )
          signed.push(path)
          const name = Object.entries(art).find(([part]) => path.includes(part))?.[1] ?? 'default'
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              signedURL: `/object/public-test/art/${name}.svg?token=fixture`,
            }),
          })
        },
      )
      await page.route(/\/storage\/v1\/object\/public-test\/art\/\w+\.svg/, (route) => {
        const key = /art\/(\w+)\.svg/.exec(route.request().url())![1]!
        return route.fulfill({
          status: 200,
          contentType: 'image/svg+xml',
          body: (artwork as Record<string, string>)[key] ?? artwork.default,
        })
      })
      await page.route(/\/storage\/v1\/object\/creature-images\/(.+)$/, async (route) => {
        const path = decodeURIComponent(
          new URL(route.request().url()).pathname.split('/creature-images/')[1]!,
        )
        uploads.add(path)
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ Key: `creature-images/${path}` }),
        })
      })
      await page.routeWebSocket(/realtime\/v1\/websocket/, () => {
        /* Realtime unavailable: the combat screens fall back to polling. */
      })
      await page.route(
        /\/rest\/v1\/rpc\/(list_encounters|get_combat_state|list_combatant_templates|create_encounter|rename_encounter|delete_encounter|set_encounter_status|add_combatants|update_combatant|remove_combatant|set_initiative|roll_npc_initiative|set_turn_order|advance_turn|set_active_turn|apply_combat_hp|set_combat_condition|set_concentration|record_death_save|add_combat_effect|remove_combat_effect|undo_combat_event|save_combatant_template|delete_combatant_template|set_combatant_template_image|set_combatant_tracker|list_creature_srd_images|set_creature_srd_image)$/,
        async (route) => {
          const request = route.request()
          const method = new URL(request.url()).pathname.split('/').at(-1)!
          let actor = dmId
          try {
            actor = JSON.parse(
              Buffer.from(request.headers().authorization!.split('.')[1]!, 'base64url').toString(),
            ).sub
          } catch {
            /* unsigned */
          }
          let body: Record<string, unknown> = {}
          try {
            body = request.postDataJSON() ?? {}
          } catch {
            /* empty */
          }
          const out = handle(actor, method, body)
          if (out && typeof out === 'object' && 'error' in out && Object.keys(out).length === 1)
            return route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({ code: 'P0001', message: (out as { error: string }).error }),
            })
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(out),
          })
        },
      )
    },
  }
}

// Fixture-only illustrations (drawn for these tests, no external art) served as "stored" images.
const frame = (body: string, from: string, to: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><radialGradient id="g" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></radialGradient></defs><rect width="120" height="120" fill="url(#g)"/>${body}</svg>`
const artwork = {
  default: frame(
    '<circle cx="60" cy="48" r="20" fill="#cbb699"/><path d="M22 120c4-30 20-44 38-44s34 14 38 44z" fill="#cbb699"/>',
    '#5b4a3a',
    '#1e1610',
  ),
  ranger: frame(
    '<path d="M60 18c-22 0-34 18-34 40 0 8 2 14 4 18h60c2-4 4-10 4-18 0-22-12-40-34-40z" fill="#1f4f5c"/><ellipse cx="60" cy="58" rx="17" ry="20" fill="#e2b48c"/><path d="M43 52c4-14 30-14 34 0-6-6-28-6-34 0z" fill="#1f4f5c"/><circle cx="53" cy="60" r="2.4" fill="#2a1c11"/><circle cx="67" cy="60" r="2.4" fill="#2a1c11"/><path d="M20 120c4-28 20-40 40-40s36 12 40 40z" fill="#2c6b7a"/><path d="M60 80l-8 40h16z" fill="#c9a24a"/>',
    '#7ec8e8',
    '#163440',
  ),
  cleric: frame(
    '<circle cx="60" cy="56" r="19" fill="#d9a77c"/><path d="M38 54c0-20 44-20 44 0-4-12-40-12-44 0z" fill="#7a4b06"/><circle cx="53" cy="58" r="2.3" fill="#2a1c11"/><circle cx="67" cy="58" r="2.3" fill="#2a1c11"/><path d="M18 120c4-28 22-42 42-42s38 14 42 42z" fill="#f6c478"/><circle cx="60" cy="96" r="8" fill="none" stroke="#7a4b06" stroke-width="3"/>',
    '#f6e2b0',
    '#7a4b06',
  ),
  goblin: frame(
    '<path d="M16 46l30 10-6 14zM104 46l-30 10 6 14z" fill="#5e8c3a"/><ellipse cx="60" cy="62" rx="24" ry="22" fill="#6f9e45"/><ellipse cx="50" cy="58" rx="5" ry="4" fill="#f6c478"/><ellipse cx="70" cy="58" rx="5" ry="4" fill="#f6c478"/><circle cx="50" cy="58" r="1.8" fill="#140f0b"/><circle cx="70" cy="58" r="1.8" fill="#140f0b"/><path d="M48 74q12 8 24 0" stroke="#140f0b" stroke-width="3" fill="none"/><path d="M53 75l2 5 2-4M63 75l2 5 2-5" fill="#f5ebd6"/><path d="M22 120c4-22 18-32 38-32s34 10 38 32z" fill="#4a3a26"/>',
    '#9bbf6a',
    '#1f2a12',
  ),
  ogre: frame(
    '<ellipse cx="60" cy="60" rx="32" ry="30" fill="#8a6a4a"/><path d="M34 48q26-12 52 0" stroke="#4a3220" stroke-width="5" fill="none"/><circle cx="48" cy="58" r="3" fill="#140f0b"/><circle cx="72" cy="58" r="3" fill="#140f0b"/><path d="M44 78q16 6 32 0" stroke="#3a2516" stroke-width="4" fill="none"/><path d="M46 78l-2-10 6 8zM74 78l2-10-6 8z" fill="#f5ebd6"/><path d="M8 120c6-24 26-32 52-32s46 8 52 32z" fill="#5a4030"/>',
    '#c08a5a',
    '#2a1608',
  ),
}
