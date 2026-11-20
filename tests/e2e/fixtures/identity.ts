import type { Page } from '@playwright/test'
import { basicImportMock } from './basic-import.ts'
import {
  createDiceStore,
  type DiceMode,
  type DiceStore,
  type RollVisibility,
} from './dice-store.ts'
export const dmId = '10000000-0000-4000-8000-000000000001'
export const playerId = '10000000-0000-4000-8000-000000000002'
export const campaignId = '20000000-0000-4000-8000-000000000001'
export const otherCampaignId = '20000000-0000-4000-8000-000000000002'
export const inviteId = '30000000-0000-4000-8000-000000000001'
export const characterId = '40000000-0000-4000-8000-000000000001'
/** RYT-031 party fixture: a shared teammate (Bea) and a hidden one (Cato). */
export const peerId = '10000000-0000-4000-8000-000000000003'
export const hiddenPeerId = '10000000-0000-4000-8000-000000000004'
export const beaId = '40000000-0000-4000-8000-0000000000b1'
export const catoId = '40000000-0000-4000-8000-0000000000c1'
/** RYT-044 reserve characters of the Player (fixture option `reserve`). */
export const reserveIds = [
  '40000000-0000-4000-8000-0000000000d1',
  '40000000-0000-4000-8000-0000000000d2',
  '40000000-0000-4000-8000-0000000000d3',
]
/** RYT-044 archived characters of the Player (fixture option `archived`). */
export const archivedIds = [
  '40000000-0000-4000-8000-0000000000f1',
  '40000000-0000-4000-8000-0000000000f2',
]
/** RYT-096 free characters the DM prepared (fixture option `free`, up to four). */
export const freeIds = [
  '40000000-0000-4000-8000-000000000a01',
  '40000000-0000-4000-8000-000000000a02',
  '40000000-0000-4000-8000-000000000a03',
  '40000000-0000-4000-8000-000000000a04',
]
export const storageKey = 'sb-rytta-test-auth-token'
export function session(id = dmId) {
  const email = id === dmId ? 'dm@example.com' : 'player@example.com'
  const exp = Math.floor(Date.now() / 1000) + 3600
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, email, role: 'authenticated', exp })}.fixture`,
    refresh_token: 'fixture-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: {
      id,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      email_confirmed_at: '2026-10-27T00:00:00Z',
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { full_name: id === dmId ? 'Table DM' : 'Arin' },
      created_at: '2026-10-27T00:00:00Z',
    },
  }
}

// Public SDK HTTP contract fixture only, never selected by production app configuration.
// Authorization itself is exercised independently against PostgreSQL in tests/database.
export async function identityFixture(
  page: Page,
  options: {
    signedIn?: boolean
    empty?: boolean
    noCharacters?: boolean
    armorClassOverride?: number
    player?: boolean
    /** Keep the DM signed in but link Arin to the Player (for Player-view previews). */
    linkedPlayer?: boolean
    callbackError?: boolean
    twoDms?: boolean
    sheet?: 'draft' | 'complete'
    /** RYT-130: level of the complete sample sheets (default 5). */
    sheetLevel?: number
    /** RYT-130: the subclass of the complete sample sheets; '' leaves it to choose. */
    sheetSubclass?: string
    /** RYT-130: a wizard instead of the sample bard, and base scores to override. */
    sheetClass?: 'wizard'
    sheetAbilities?: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', number>>
    /** RYT-130: the level the DM set for the party (null: not set). */
    partyLevel?: number | null
    /** RYT-134: spells of the complete sample sheets (the bard's own list when left out), the
     * caster kind, the spent slots by level and a concentration marker already set. */
    sheetSpells?: Record<string, unknown>[]
    sheetCaster?: 'full' | 'half' | 'pact' | 'none'
    slotsUsed?: number[]
    concentration?: string | null
    /** RYT-133: the campaign's dice mode and roll visibility (physical and roller_dm by default). */
    diceMode?: DiceMode
    rollVisibility?: RollVisibility
    /** RYT-133: a dice store shared with other pages, to see one table from several accounts. */
    dice?: DiceStore
    inventory?: boolean
    modules?: string[]
    party?: boolean
    /** RYT-034: sign in as another Player of the party fixture (for example peerId). */
    as?: string
    /** RYT-008: seed one campaign homebrew house rule. */
    homebrew?: boolean
    /** RYT-044: names of extra Player characters in reserve (up to three). */
    reserve?: string[]
    /** RYT-044: names of archived Player characters (up to two). */
    archived?: string[]
    /** RYT-070: the character fights a live encounter (Players are locked). */
    inEncounter?: boolean
    /** RYT-078: the signed-in account's username; null shows the hub prompt. */
    username?: string | null
    /** RYT-079: the DM marked Arin absent (the Player is benched). */
    absent?: boolean
    /** RYT-096: names of free (unassigned) characters the DM prepared; the first has a sheet. */
    free?: string[]
    /** RYT-104/105: basic catalogue items, a template and a pending Player proposal. */
    catalogue?: boolean
    /** RYT-115: account export and deletion. blocked lists campaigns the DM must resolve first. */
    account?: {
      blocked?: boolean
      authUser?: 'deleted' | 'disabled' | 'kept' | 'shared' | 'absent'
      truncated?: string[]
      /** Server message of delete_my_account (for example 'Account deletion not prepared'). */
      deleteError?: string
      /** Server message of prepare_account_deletion (for example 'Forbidden'). */
      prepareError?: string
      /** The dialog sees no blockers, then prepare finds some (a campaign became solo meanwhile). */
      blockOnPrepare?: boolean
      /** Campaign images the preparation lists; the Storage remove endpoint clears them. */
      storageObjects?: number
    }
  } = {},
) {
  const currentId = options.as ?? (options.player ? playerId : dmId)
  const dice =
    options.dice ?? createDiceStore({ mode: options.diceMode, visibility: options.rollVisibility })
  if (options.signedIn !== false)
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
      key: storageKey,
      value: session(currentId),
    })
  let campaigns = options.empty
    ? []
    : [
        {
          id: campaignId,
          name: 'The Sunken Coast',
          description: 'A coastline that keeps its secrets.',
          created_at: '2026-10-27T00:00:00Z',
          role: options.player ? 'player' : 'dm',
          player_modules:
            options.modules ?? (options.inventory ? ['party', 'inventory'] : ['party']),
          party_level: options.partyLevel ?? null,
        },
        {
          id: otherCampaignId,
          name: 'Winter at the Keep',
          description: '',
          created_at: '2026-10-26T00:00:00Z',
          role: 'player',
          player_modules: ['party'],
          party_level: null,
        },
      ]
  let pending = [
    {
      id: inviteId,
      campaign_id: '20000000-0000-4000-8000-000000000003',
      campaign_name: 'The Amber Road',
      character_id: characterId,
      character_name: 'Amber scout',
      email: options.player ? 'player@example.com' : 'dm@example.com',
      expires_at: '2099-10-27T00:00:00Z',
    },
  ]
  let members = [
    { user_id: dmId, role: 'dm', email: 'dm@example.com', display_name: 'Table DM' },
    {
      user_id: playerId,
      role: options.twoDms ? 'dm' : 'player',
      email: 'player@example.com',
      display_name: 'Arin',
    },
    ...(options.party
      ? [
          { user_id: peerId, role: 'player', email: 'bea@example.com', display_name: 'Bea P.' },
          {
            user_id: hiddenPeerId,
            role: 'player',
            email: 'cato@example.com',
            display_name: 'Cato P.',
          },
        ]
      : []),
  ]
  type FixtureCharacter = {
    id: string
    campaign_id: string
    user_id: string | null
    name: string
    /** RYT-044: the owner's character in play; unassigned characters are always active. */
    is_active: boolean
    /** RYT-044: archived characters leave the roster and every campaign list. */
    archived_at?: string | null
    /** RYT-079: the DM marked the character absent; never active while set. */
    absent?: boolean
    created_at: string
    character_resources: {
      gold: number
      water_units: number
      rations: number
      exhaustion: number
      revision: number
    }
  }
  let characters: FixtureCharacter[] =
    options.empty || options.noCharacters
      ? []
      : [
          {
            id: characterId,
            campaign_id: campaignId,
            user_id: options.player || options.linkedPlayer ? playerId : null,
            name: 'Arin',
            is_active: true,
            created_at: '2026-10-27T00:00:00Z',
            character_resources: {
              gold: 25,
              water_units: 3,
              rations: 4,
              exhaustion: 0,
              revision: 0,
            },
          },
        ]
  if (options.party)
    for (const [id, user_id, name, gold] of [
      [beaId, peerId, 'Bea', 777],
      [catoId, hiddenPeerId, 'Cato', 555],
    ] as const)
      characters.push({
        id,
        campaign_id: campaignId,
        user_id,
        name,
        is_active: true,
        created_at: '2026-10-27T00:00:00Z',
        character_resources: { gold, water_units: 9, rations: 8, exhaustion: 0, revision: 0 },
      })
  // RYT-044: extra characters of the Player waiting in reserve (Arin stays active).
  for (const [index, name] of (options.reserve ?? []).entries())
    characters.push({
      id: reserveIds[index]!,
      campaign_id: campaignId,
      user_id: playerId,
      name,
      is_active: false,
      created_at: `2026-10-28T0${index}:00:00Z`,
      character_resources: { gold: 5, water_units: 1, rations: 1, exhaustion: 0, revision: 0 },
    })
  // RYT-044: archived characters of the Player.
  for (const [index, name] of (options.archived ?? []).entries())
    characters.push({
      id: archivedIds[index]!,
      campaign_id: campaignId,
      user_id: playerId,
      name,
      is_active: false,
      archived_at: '2026-11-01T00:00:00Z',
      created_at: `2026-10-26T0${index}:00:00Z`,
      character_resources: { gold: 1, water_units: 0, rations: 0, exhaustion: 0, revision: 0 },
    })
  // RYT-096: free characters, unassigned and in play (the DM's), oldest first.
  for (const [index, name] of (options.free ?? []).entries())
    characters.push({
      id: freeIds[index]!,
      campaign_id: campaignId,
      user_id: null,
      name,
      is_active: true,
      created_at: `2026-10-25T0${index}:00:00Z`,
      character_resources: { gold: 10, water_units: 2, rations: 2, exhaustion: 0, revision: 0 },
    })
  if (options.absent && characters[0]) {
    characters[0].absent = true
    characters[0].is_active = false
  }
  const sharesLive = new Map<string, boolean>(characters.map((c) => [c.id, c.id !== catoId]))
  type SheetRow = {
    status: string
    level: number
    max_hp: number
    armor_class: number
    build: Record<string, unknown>
    revision: number
  }
  type VitalsRow = Record<string, unknown> & { revision: number }
  const blankSheet = (): SheetRow => ({
    status: 'draft',
    level: 1,
    max_hp: 1,
    armor_class: 10,
    build: {},
    revision: 0,
  })
  const blankVitals = (): VitalsRow => ({
    current_hp: 1,
    temp_hp: 0,
    hit_dice_spent: 0,
    death_successes: 0,
    death_failures: 0,
    heroic_inspiration: false,
    conditions: [],
    slots_used: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    tracker_uses: {},
    concentration: null,
    revision: 0,
  })
  // RYT-070 history log, newest last.
  const history: {
    id: string
    at: string
    kind: string
    actor_id: string
    character: string
    changes: { field: string; before: unknown; after: unknown }[]
  }[] = []
  const record = (
    character: string,
    kind: string,
    changes: { field: string; before: unknown; after: unknown }[],
    at = new Date(Date.now() + history.length).toISOString(),
  ) =>
    history.push({
      id: crypto.randomUUID(),
      at,
      kind,
      actor_id: currentId,
      character,
      changes,
    })
  const sheets = new Map<string, SheetRow>(
    characters.map((c) => [
      c.id,
      options.sheet === 'complete'
        ? sampleSheet({
            level: options.sheetLevel,
            subclass: options.sheetSubclass,
            wizard: options.sheetClass === 'wizard',
            abilities: options.sheetAbilities,
          })
        : blankSheet(),
    ]),
  )
  if (options.sheetSpells || options.sheetCaster)
    for (const sheet of sheets.values())
      if (sheet.status === 'complete')
        sheet.build = {
          ...sheet.build,
          ...(options.sheetSpells ? { spells: options.sheetSpells } : {}),
          ...(options.sheetCaster
            ? {
                casterKind: options.sheetCaster,
                spellAbility: options.sheetCaster === 'none' ? null : 'cha',
              }
            : {}),
        }
  if (options.armorClassOverride !== undefined)
    for (const sheet of sheets.values()) {
      sheet.armor_class = options.armorClassOverride
      sheet.build = { ...sheet.build, acOverride: options.armorClassOverride }
    }
  const vitals = new Map<string, VitalsRow>(
    characters.map((c) => [
      c.id,
      options.sheet === 'complete'
        ? { ...blankVitals(), current_hp: 30, temp_hp: 5, slots_used: [1, 0, 0, 0, 0, 0, 0, 0, 0] }
        : blankVitals(),
    ]),
  )
  if (options.sheet === 'complete')
    for (const state of vitals.values()) {
      if (options.slotsUsed) state.slots_used = options.slotsUsed
      if (options.concentration !== undefined) state.concentration = options.concentration
    }
  if (options.free?.length) sheets.set(freeIds[0]!, sampleSheet())
  if (options.party) {
    sheets.set(beaId, { ...sampleSheet(), max_hp: 24, armor_class: 16 })
    vitals.set(beaId, {
      ...blankVitals(),
      current_hp: 9,
      temp_hp: 3,
      conditions: ['poisoned', 'prone'],
    })
    characters.find((c) => c.id === beaId)!.character_resources.exhaustion = 2
    sheets.set(catoId, { ...sampleSheet(), max_hp: 20 })
    vitals.set(catoId, { ...blankVitals(), current_hp: 20 })
  }
  const inventory = inventoryState(
    characters.map((c) => c.id),
    Boolean(options.inventory),
    Boolean(options.catalogue),
    // RYT-104: food and drink add to (and undo takes back from) the character's supplies.
    (id, rations, water) => {
      const target = characters.find((c) => c.id === id)
      if (!target) return null
      const res = target.character_resources
      const taken = {
        rations: Math.max(-res.rations, rations),
        water: Math.max(-res.water_units, water),
      }
      res.rations += taken.rations
      res.water_units += taken.water
      res.revision += 1
      return taken
    },
    (id) => characters.find((c) => c.id === id)?.name ?? null,
  )
  // RYT-080 group rest state (one request at a time) and the rest maths of the SQL.
  type Rest = {
    id: string
    kind: 'short' | 'long'
    status: 'open' | 'done' | 'rejected' | 'cancelled' | 'expired'
    requested_by: string
    requester_character: string | null
    created_at: string
    expires_at: string
    resolved_at: string | null
    revision: number
    outcome: Record<string, unknown>[] | null
  }
  let rest: Rest | null = null
  const restVotes = new Map<
    string,
    { vote: string; dice_spent: number; dice_roll: number | null }
  >()
  const restParty = () =>
    characters.filter((c) => c.campaign_id === campaignId && c.is_active && !c.archived_at)
  const hpOf = (id: string) => Number(vitals.get(id)!.current_hp)
  const restEffect = (id: string, kind: 'short' | 'long', spentIn: number, roll: number | null) => {
    const sheet = sheets.get(id)!
    const v = vitals.get(id)! as VitalsRow & {
      current_hp: number
      temp_hp: number
      hit_dice_spent: number
      slots_used: number[]
      tracker_uses: Record<string, number>
    }
    const b = sheet.build as {
      trackers?: { id: string; key?: string; name: string; max: number; reset: string }[]
      baseAbilities?: { con?: number }
      bonuses?: { con?: number }
      hitDie?: number
      casterKind?: string
    }
    const trackers = b.trackers ?? []
    const con = Math.floor(
      (Math.min(30, (b.baseAbilities?.con ?? 10) + (b.bonuses?.con ?? 0)) - 10) / 2,
    )
    const die = [6, 8, 10, 12].includes(b.hitDie ?? 0) ? b.hitDie! : 0
    const can = v.current_hp > 0
    const spent = kind === 'short' && can ? Math.max(0, spentIn) : 0
    const resets = (reset: string) => reset === 'short' || (kind === 'long' && reset === 'long')
    const gain = spent > 0 ? Math.max(spent, (roll ?? 0) + con * spent) : 0
    const hpAfter =
      kind === 'long'
        ? can
          ? sheet.max_hp
          : v.current_hp
        : Math.min(sheet.max_hp, v.current_hp + gain)
    const tempAfter = kind === 'long' && can ? 0 : v.temp_hp
    const diceAfter =
      kind === 'long'
        ? can
          ? 0
          : v.hit_dice_spent
        : Math.min(sheet.level, v.hit_dice_spent + spent)
    const uses = v.tracker_uses ?? {}
    const usesAfter = can
      ? Object.fromEntries(
          Object.entries(uses).filter(([key]) =>
            trackers.some((t) => t.id === key && !resets(t.reset)),
          ),
        )
      : uses
    const slotsBack =
      can && (kind === 'long' || b.casterKind === 'pact') ? v.slots_used : Array(9).fill(0)
    return {
      can_rest: can,
      max_hp: sheet.max_hp,
      hp_before: v.current_hp,
      hp_after: hpAfter,
      temp_before: v.temp_hp,
      temp_after: tempAfter,
      hit_die: die,
      con_mod: con,
      dice_left_before: Math.max(0, sheet.level - v.hit_dice_spent),
      dice_left_after: Math.max(0, sheet.level - diceAfter),
      dice_spent: spent,
      trackers: can
        ? trackers
            .filter((t) => resets(t.reset) && (uses[t.id] ?? 0) > 0 && t.max > 0)
            .map((t) => ({
              id: t.id,
              key: t.key ?? null,
              name: t.name,
              max: t.max,
              before: Math.max(0, t.max - (uses[t.id] ?? 0)),
              after: t.max,
            }))
        : [],
      slots: slotsBack,
      apply: () => {
        if (!can) return
        if (hpAfter !== v.current_hp)
          record(id, 'character_vitals:UPDATE', [
            { field: 'current_hp', before: v.current_hp, after: hpAfter },
          ])
        Object.assign(v, {
          current_hp: hpAfter,
          temp_hp: tempAfter,
          hit_dice_spent: diceAfter,
          slots_used: kind === 'long' || b.casterKind === 'pact' ? Array(9).fill(0) : v.slots_used,
          tracker_uses: usesAfter,
          revision: v.revision + 1,
          ...(kind === 'long'
            ? { death_successes: 0, death_failures: 0, concentration: null }
            : {}),
        })
      },
    }
  }
  // RYT-137: the roll store asks the rest state which rest is open and which hit dice are left.
  dice.world.openRest = () =>
    rest?.status === 'open' && Date.parse(rest.expires_at) > Date.now() ? rest.id : null
  dice.world.hitDice = (id) => {
    const sheet = sheets.get(id)
    const v = vitals.get(id)
    if (!sheet || !v) return null
    return {
      die: Number((sheet.build as { hitDie?: number }).hitDie ?? 0),
      left: Math.max(
        0,
        sheet.level - Number((v as { hit_dice_spent?: number }).hit_dice_spent ?? 0),
      ),
    }
  }
  const strip = (effect: ReturnType<typeof restEffect>) => {
    const { apply: _apply, ...rest } = effect
    return rest
  }
  const restExpire = () => {
    if (rest?.status === 'open' && Date.parse(rest.expires_at) <= Date.now())
      Object.assign(rest, {
        status: 'expired',
        resolved_at: new Date().toISOString(),
        revision: rest.revision + 1,
      })
  }
  const restFinish = () => {
    if (!rest) return
    const current = rest
    current.outcome = restParty().map((c) => {
      const vote = restVotes.get(c.id)
      const effect = restEffect(c.id, current.kind, vote?.dice_spent ?? 0, vote?.dice_roll ?? null)
      const shown = strip(effect)
      effect.apply()
      return {
        id: c.id,
        name: c.name,
        user_id: c.user_id,
        shares: c.user_id === null || (sharesLive.get(c.id) ?? true),
        vote: vote?.vote ?? null,
        rested: shown.can_rest,
        effect: shown,
      }
    })
    Object.assign(current, {
      status: 'done',
      resolved_at: new Date().toISOString(),
      revision: current.revision + 1,
    })
    // A completed rest uses up every hit-dice roll made before it.
    dice.restsCompleted += 1
  }
  const restSettle = () => {
    if (!rest || rest.status !== 'open') return
    const voters = restParty().filter((c) => hpOf(c.id) > 0)
    const votes = voters.map((c) => restVotes.get(c.id)?.vote)
    if (votes.includes('no')) {
      rest.outcome = restParty().map((c) => ({
        id: c.id,
        name: c.name,
        user_id: c.user_id,
        shares: c.user_id === null || (sharesLive.get(c.id) ?? true),
        vote: restVotes.get(c.id)?.vote ?? null,
        rested: false,
      }))
      Object.assign(rest, {
        status: 'rejected',
        resolved_at: new Date().toISOString(),
        revision: rest.revision + 1,
      })
    } else if (voters.length > 0 && votes.every((vote) => vote === 'yes')) restFinish()
  }
  const restVote = (id: string, vote: string, spent: number | null, roll: number | null) => {
    if (!rest || rest.status !== 'open') return 'Rest closed'
    if (hpOf(id) <= 0) return 'Cannot rest'
    let diceSpent = 0
    let diceRoll: number | null = null
    if (rest.kind === 'short' && vote === 'yes') {
      const sheet = sheets.get(id)!
      const die = Number((sheet.build as { hitDie?: number }).hitDie ?? 0)
      diceSpent = spent ?? 0
      const left = sheet.level - Number(vitals.get(id)!.hit_dice_spent)
      if (diceSpent < 0 || diceSpent > left) return 'Invalid dice'
      if (diceSpent > 0 && (roll === null || roll < diceSpent || roll > diceSpent * die))
        return 'Invalid dice'
      diceRoll = diceSpent > 0 ? roll : null
    }
    restVotes.set(id, { vote, dice_spent: diceSpent, dice_roll: diceRoll })
    rest.revision += 1
    restSettle()
    return null
  }
  const restStateFor = (viewer: string) => {
    if (!rest) return null
    const current = rest
    const dm = members.find((m) => m.user_id === viewer)?.role === 'dm'
    const visible = (userId: string | null, shares: boolean) =>
      dm || userId === viewer || userId === null || shares
    const participants =
      current.status === 'open'
        ? restParty()
            .map((c) => {
              const vote = restVotes.get(c.id)
              const shares = visible(c.user_id, sharesLive.get(c.id) ?? true)
              return {
                id: c.id,
                name: c.name,
                own: c.user_id === viewer,
                dm_controlled: c.user_id === null,
                controlled: c.user_id === viewer || (dm && c.user_id === null),
                vote: (vote?.vote as 'yes' | 'no' | undefined) ?? null,
                dice_spent: vote?.dice_spent ?? 0,
                dice_roll: shares ? (vote?.dice_roll ?? null) : null,
                can_rest: hpOf(c.id) > 0,
                shares,
                effect: shares
                  ? strip(
                      restEffect(
                        c.id,
                        current.kind,
                        vote?.dice_spent ?? 0,
                        vote?.dice_roll ?? null,
                      ),
                    )
                  : null,
                sort: c.user_id === viewer ? '0' : c.user_id === null ? '2' : '1',
              }
            })
            .sort((a, b) => a.sort.localeCompare(b.sort) || a.name.localeCompare(b.name))
            .map(({ sort: _sort, ...person }) => person)
        : (current.outcome ?? []).map((o) => {
            const userId = o.user_id as string | null
            const shares = visible(userId, Boolean(o.shares))
            return {
              id: o.id,
              name: o.name,
              own: userId === viewer,
              dm_controlled: userId === null,
              controlled: false,
              vote: o.vote ?? null,
              rested: Boolean(o.rested),
              shares,
              effect: shares ? (o.effect ?? null) : null,
            }
          })
    return {
      id: current.id,
      kind: current.kind,
      status: current.status,
      created_at: current.created_at,
      expires_at: current.expires_at,
      resolved_at: current.resolved_at,
      revision: current.revision,
      requester_name: characters.find((c) => c.id === current.requester_character)?.name ?? null,
      mine: current.requested_by === viewer,
      dm,
      can_cancel: current.status === 'open' && (dm || current.requested_by === viewer),
      participants,
    }
  }
  let portraitPath: string | null = null
  let nextVitalsStale = false
  // RYT-134: set_character_vitals replays a request id, and the next writes can fail on request.
  const vitalsRequests = new Map<string, { actor: string; payload: string; revision: number }>()
  const vitalsCalls: Record<string, unknown>[] = []
  let nextVitalsFailures: ('down' | 'lost')[] = []
  // The server's rule for a marker (20261203120000): Unicode spaces trimmed at both ends, 1 to 100
  // characters and no control, zero-width or bidi character.
  const markerSpaces =
    /^[\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+|[\u0020\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+$/gu
  /* eslint-disable no-control-regex */
  const markerForbidden =
    /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u
  /* eslint-enable no-control-regex */
  const cleanMarker = (value: unknown): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.replace(markerSpaces, '')
    return trimmed.length > 0 && Array.from(trimmed).length <= 100 && !markerForbidden.test(trimmed)
      ? trimmed
      : null
  }
  // RYT-130: idempotency of the party level and level-up RPCs, and one-shot failures.
  const partyRequests = new Map<string, { actor: string; payload: string; result: number | null }>()
  const levelUpRequests = new Map<string, { actor: string; payload: string; revision: number }>()
  let nextPartyLevelError: string | null = null
  let nextLevelUpError: string | null = null
  let sent: { id: string; email: string; expires_at: string }[] = []
  const characterEvents: {
    id: string
    campaign_id: string
    character_id: string
    actor_id: string
    kind: string
    before_value: Record<string, unknown> | null
    after_value: Record<string, unknown>
    created_at: string
  }[] = [
    {
      id: '60000000-0000-4000-8000-000000000002',
      campaign_id: campaignId,
      character_id: characterId,
      actor_id: dmId,
      kind: 'character_resources:UPDATE',
      before_value: { gold: 15, water_units: 3, rations: 2, exhaustion: 0, revision: 0 },
      after_value: { gold: 25, water_units: 3, rations: 4, exhaustion: 0, revision: 1 },
      created_at: '2026-10-27T00:30:00Z',
    },
    {
      id: '60000000-0000-4000-8000-000000000001',
      campaign_id: campaignId,
      character_id: characterId,
      actor_id: dmId,
      kind: 'characters:INSERT',
      before_value: null,
      after_value: { name: 'Arin' },
      created_at: '2026-10-27T00:00:00Z',
    },
  ]
  const calls: { method: string; body: Record<string, unknown> }[] = []
  // RYT-078: usernames held by accounts; 'Taken_Name' belongs to someone outside the fixture.
  const usernames = new Map<string, string>([
    ['00000000-0000-4000-8000-0000000000ff', 'Taken_Name'],
  ])
  const initialUsername = options.username === undefined ? 'Table_Hero' : options.username
  if (initialUsername) usernames.set(currentId, initialUsername)
  const usernameHeldByOther = (name: string, actor: string) =>
    [...usernames].some(([id, held]) => id !== actor && held.toLowerCase() === name.toLowerCase())
  let failList = false
  const partyLevelOf = (id: string) => campaigns.find((c) => c.id === id)?.party_level ?? null
  // RYT-115: prepare_account_deletion must run before delete_my_account; objects are Storage rows.
  let accountPrepared = false
  let accountBlockedNow = Boolean(options.account?.blocked)
  let accountObjects = Array.from({ length: options.account?.storageObjects ?? 0 }, (_, n) => ({
    bucket_id: 'character-portraits',
    object_path: `pre/${campaignId}/portrait-${n}.webp`,
    campaign_id: campaignId,
  }))
  // RYT-096: the next claim fails with this server message (a lost race takes the character).
  let nextClaimError: string | null = null
  let glossaryEntries: {
    id: string
    campaign_id: string
    category: string
    name: string
    aliases: string[]
    summary: string
    body: string
    facts: { label: string; value: string }[]
    srd_ref: string | null
    revision: number
    created_by: string | null
    updated_by: string | null
    updated_at: string
  }[] = options.homebrew
    ? [
        {
          id: '50000000-0000-4000-8000-000000000001',
          campaign_id: campaignId,
          category: 'rule',
          name: 'Descanso duro',
          aliases: ['Gritty rest'],
          summary: 'Un descanso largo dura una semana en un lugar seguro.',
          body: 'Los descansos cortos duran 8 horas.\n\nEl agotamiento solo baja con un descanso duro.',
          facts: [{ label: 'Duración', value: '7 días' }],
          srd_ref: 'rule.long-rest',
          revision: 1,
          created_by: dmId,
          updated_by: dmId,
          updated_at: '2026-11-03T12:00:00Z',
        },
      ]
    : []
  await page.route('https://rytta-test.supabase.co/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = url.pathname.split('/').at(-1)!
    let actor = currentId
    try {
      actor = JSON.parse(
        Buffer.from(request.headers().authorization!.split('.')[1]!, 'base64url').toString(),
      ).sub
    } catch {
      /* OAuth has no bearer */
    }
    let body: Record<string, unknown> = {}
    try {
      body = request.postDataJSON() ?? {}
    } catch {
      /* GET */
    }
    calls.push({ method, body })
    const respond = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (method === 'get_session_continuity')
      return respond({
        lastEncounter: null,
        privateNote: '',
        nextScene: '',
        pendingReward: '',
        sharedRecap: '',
        revision: 0,
      })
    if (method === 'get_shared_session_recap') return respond('')
    if (url.pathname.includes('/auth/v1/')) {
      if (method === 'logout') return route.fulfill({ status: 204 })
      if (method === 'user') return respond(session(currentId).user)
      if (method === 'token')
        return options.callbackError
          ? respond({ error: 'invalid_grant', error_description: 'Invalid code' }, 400)
          : respond(session(currentId))
      if (method === 'authorize')
        return route.fulfill({ contentType: 'text/html', body: '<p>OAuth provider fixture</p>' })
    }
    if (method === 'list_my_campaigns' || method === 'list_my_campaigns_with_modules')
      return failList
        ? respond({ message: 'Unavailable' }, 503)
        : respond(
            (actor !== currentId
              ? campaigns.map((c) => ({
                  ...c,
                  role:
                    c.id === campaignId
                      ? (members.find((m) => m.user_id === actor)?.role ?? 'player')
                      : 'dm',
                }))
              : campaigns
            ).map((c) => (c.id === campaignId ? { ...c, ...dice.settings() } : c)),
          )
    if (method === 'list_my_invitations') return respond(pending)
    // RYT-034 default: no trade activity. tests/e2e/fixtures/trades.ts overrides this route.
    if (method === 'get_trade_state')
      return respond({
        character: null,
        partners: [],
        items: [],
        trade: null,
        recent: null,
        history: [],
      })
    if (method === 'create_campaign') {
      const id = '20000000-0000-4000-8000-000000000004'
      campaigns = [
        ...campaigns,
        {
          id,
          name: String(body.campaign_name),
          description: String(body.campaign_description),
          created_at: '2026-10-27T00:00:00Z',
          role: 'dm',
          player_modules: ['party'],
          party_level: null,
        },
      ]
      return respond(id)
    }
    if (method === 'respond_campaign_invitation') {
      const target = pending.find((i) => i.id === body.invitation_id)!
      if (body.accept_invitation)
        campaigns.push({
          id: target.campaign_id,
          name: target.campaign_name,
          description: '',
          created_at: '2026-10-27T00:00:00Z',
          role: 'player',
          player_modules: ['party'],
          party_level: null,
        })
      pending = []
      return respond(target.campaign_id)
    }
    const eq = (name: string) => url.searchParams.get(name)?.replace('eq.', '')
    if (url.pathname.includes('/storage/v1/object/sign/'))
      return respond(
        Array.isArray(body.paths)
          ? body.paths.map((path) => ({
              path,
              signedURL: '/object/public-test/portrait.png?token=fixture',
              error: null,
            }))
          : { signedURL: '/object/public-test/portrait.png?token=fixture' },
      )
    if (url.pathname.includes('/storage/v1/object/public-test/'))
      return route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng })
    if (
      url.pathname.includes('/storage/v1/object/character-portraits/') ||
      url.pathname.includes('/storage/v1/object/item-images/')
    )
      return respond({ Key: url.pathname.split('/object/')[1] })
    if (method === 'set_character_portrait') {
      portraitPath = (body.new_path as string | null) ?? null
      return respond(null)
    }
    if (
      method === 'character_sheets' &&
      url.searchParams.get('select')?.includes('portrait_path')
    ) {
      const visible = characters.filter((c) => c.campaign_id === eq('campaign_id'))
      const select = url.searchParams.get('select')!.replaceAll(' ', '')
      if (select === 'character_id,portrait_path')
        return respond(visible.map((c) => ({ character_id: c.id, portrait_path: portraitPath })))
      if (select.startsWith('level'))
        return respond(
          visible
            .filter((c) => c.id === eq('character_id'))
            .map((c) => ({
              level: 5,
              armor_class: options.armorClassOverride,
              portrait_path: portraitPath,
              str: '14',
              dex: '16',
              str_bonus: '0',
              dex_bonus: '0',
              class_key: (sheets.get(c.id)?.build?.classKey as string | undefined) ?? null,
            })),
        )
    }
    const inventoryResult = inventory.handle(method, body, eq, actor === dmId)
    if (inventoryResult !== undefined)
      return inventoryResult instanceof Error
        ? respond({ message: inventoryResult.message }, 400)
        : respond(inventoryResult)
    if (method === 'character_sheets' || method === 'character_vitals') {
      const visible = characters.filter(
        (c) =>
          c.campaign_id === eq('campaign_id') &&
          (!eq('character_id') || c.id === eq('character_id')) &&
          (members.find((m) => m.user_id === actor)?.role === 'dm' || c.user_id === actor),
      )
      if (method === 'character_vitals')
        return respond(visible.map((c) => ({ character_id: c.id, ...vitals.get(c.id)! })))
      return respond(
        visible.map((c) => {
          const row = sheets.get(c.id)!
          return url.searchParams.get('select')?.includes('class_label')
            ? {
                character_id: c.id,
                status: row.status,
                level: row.level,
                max_hp: row.max_hp,
                armor_class: row.armor_class,
                class_key: (row.build.classKey as string | undefined) ?? null,
                class_label: (row.build.classLabel as string | undefined) ?? null,
              }
            : {
                character_id: c.id,
                campaign_id: c.campaign_id,
                ...row,
                portrait_path: portraitPath,
              }
        }),
      )
    }
    // RYT-070/072/074 RPCs: the play lock, the history, renames and visible portraits.
    if (method === 'get_character_play_lock') {
      const dm = members.find((m) => m.user_id === actor)?.role === 'dm'
      return respond({
        in_encounter: Boolean(options.inEncounter),
        locked: Boolean(options.inEncounter) && !dm,
      })
    }
    if (method === 'get_character_history') {
      // The audit rows of the party fixture, turned into field changes like the RPC does.
      const quiet = [
        'id',
        'campaign_id',
        'character_id',
        'revision',
        'user_id',
        'created_at',
        'party_level',
      ]
      const audited = characterEvents
        .filter(
          (e) =>
            e.character_id === body.target_character &&
            (e.kind.endsWith(':UPDATE') || e.kind === 'level_up'),
        )
        .map((e) => ({
          id: e.id,
          at: e.created_at,
          kind: e.kind,
          actor_id: e.actor_id ?? '',
          character: e.character_id,
          changes: Object.keys(e.after_value)
            .filter(
              (field) =>
                !quiet.includes(field) &&
                JSON.stringify(e.before_value?.[field]) !== JSON.stringify(e.after_value[field]),
            )
            .map((field) => ({
              field,
              before: e.before_value?.[field] ?? null,
              after: e.after_value[field],
            })),
        }))
      return respond(
        [...audited, ...history]
          .filter((item) => item.character === body.target_character)
          .sort((a, b) => a.at.localeCompare(b.at))
          .map(({ character: _character, ...item }) => ({
            ...item,
            actor: item.actor_id === actor ? 'self' : item.actor_id === dmId ? 'dm' : 'player',
            actor_name: null,
          }))
          .reverse(),
      )
    }
    if (method === 'rename_character') {
      const character = characters.find((c) => c.id === body.target_character)!
      const name = String(body.new_name).trim()
      record(character.id, 'characters:UPDATE', [
        { field: 'name', before: character.name, after: name },
      ])
      character.name = name
      return respond(name)
    }
    if (method === 'list_character_portraits')
      return respond(
        portraitPath
          ? characters
              .filter((c) => c.campaign_id === body.target_campaign && c.user_id !== null)
              .slice(0, 1)
              .map((c) => ({ character_id: c.id, portrait_path: portraitPath }))
          : [],
      )
    if (method === 'save_character_sheet') {
      const row = sheets.get(String(body.target_character))!
      if (row.revision !== body.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
      // RYT-130: a complete sheet changes level only by leveling up, unless the DM edits it.
      if (
        members.find((m) => m.user_id === actor)?.role !== 'dm' &&
        row.status === 'complete' &&
        Number(body.new_level) !== row.level
      )
        return respond({ message: 'Use level up' }, 400)
      const completing = row.status === 'draft' && body.mark_complete === true
      const nextBuild = body.new_build as Record<string, unknown>
      const changes = [
        ...(['level', 'max_hp'] as const)
          .filter((field) => row[field] !== Number(body[`new_${field}`]))
          .map((field) => ({ field, before: row[field], after: Number(body[`new_${field}`]) })),
        ...[...new Set([...Object.keys(row.build), ...Object.keys(nextBuild)])]
          .filter((key) => JSON.stringify(row.build[key]) !== JSON.stringify(nextBuild[key]))
          .map((key) => ({
            field: `build.${key}`,
            before: row.build[key] ?? null,
            after: nextBuild[key] ?? null,
          })),
      ]
      Object.assign(row, {
        level: Number(body.new_level),
        max_hp: Number(body.new_max_hp),
        armor_class: Number(body.new_armor_class),
        build: body.new_build as Record<string, unknown>,
        status: body.mark_complete || row.status === 'complete' ? 'complete' : 'draft',
        revision: row.revision + 1,
      })
      const state = vitals.get(String(body.target_character))!
      if (completing) state.current_hp = row.max_hp
      if (changes.length) record(String(body.target_character), 'character_sheets:UPDATE', changes)
      return respond(row.revision)
    }
    if (method === 'set_party_level') {
      const dm = members.find((m) => m.user_id === actor)?.role === 'dm'
      if (!dm) return respond({ code: '42501', message: 'Forbidden' }, 403)
      if (!body.request_id) return respond({ code: '22023', message: 'Invalid request' }, 400)
      const level = body.new_level === null ? null : Number(body.new_level)
      const payload = JSON.stringify([body.target_campaign, level])
      const prior = partyRequests.get(String(body.request_id))
      // The replay comes first, as in the SQL: the same request returns what it returned.
      if (prior)
        return prior.actor === actor && prior.payload === payload
          ? respond(prior.result)
          : respond({ code: '22023', message: 'Request mismatch' }, 400)
      if (nextPartyLevelError) {
        const message = nextPartyLevelError
        nextPartyLevelError = null
        return respond({ message }, message === 'Unavailable' ? 503 : 400)
      }
      if (level !== null && !(Number.isInteger(level) && level >= 1 && level <= 20))
        return respond({ code: '22023', message: 'Invalid level' }, 400)
      campaigns = campaigns.map((c) =>
        c.id === body.target_campaign ? { ...c, party_level: level } : c,
      )
      partyRequests.set(String(body.request_id), { actor, payload, result: level })
      return respond(level)
    }
    // RYT-133: the dice settings, the roll log and what each account may read of it.
    const diceMember = () => {
      const found = members.find((m) => m.user_id === actor)
      return found ? { role: found.role as 'dm' | 'player', active: true } : undefined
    }
    if (method === 'set_dice_settings') {
      const reply = dice.setDiceSettings(actor, diceMember(), body)
      return respond(reply.body, reply.status)
    }
    if (method === 'log_roll') {
      const reply = dice.logRoll(
        actor,
        diceMember(),
        (id) => {
          const found = characters.find(
            (c) => c.id === id && c.campaign_id === body.target_campaign,
          )
          return found
            ? {
                id: found.id,
                user_id: found.user_id,
                archived: Boolean(found.archived_at),
                absent: Boolean(found.absent),
              }
            : undefined
        },
        body,
      )
      return respond(reply.body, reply.status)
    }
    // RYT-137: the one-roll state, and the DM's reset of a hit-dice roll.
    if (method === 'get_roll_context') {
      const context = dice.context(
        actor,
        diceMember(),
        String(body.target_campaign),
        (characterId) => characters.find((c) => c.id === characterId)?.user_id,
      )
      return context ? respond(context) : respond({ code: '42501', message: 'Forbidden' }, 403)
    }
    if (method === 'reset_hit_dice_roll') {
      const reply = dice.resetHitDice(
        actor,
        diceMember(),
        (id) => {
          const found = characters.find(
            (c) => c.id === id && c.campaign_id === body.target_campaign,
          )
          return found
            ? {
                id: found.id,
                user_id: found.user_id,
                archived: Boolean(found.archived_at),
                absent: Boolean(found.absent),
              }
            : undefined
        },
        body,
        (characterId) => {
          const vote = restVotes.get(characterId)
          if (!rest || !vote || vote.dice_spent <= 0) return false
          restVotes.delete(characterId)
          rest.revision += 1
          return true
        },
      )
      return respond(reply.body, reply.status)
    }
    if (method === 'campaign_rolls') {
      const before = url.searchParams.get('created_at')?.replace('lt.', '')
      const limit = Number(url.searchParams.get('limit') ?? 50)
      return respond(
        dice
          .readable(actor, diceMember(), eq('campaign_id') ?? campaignId)
          .filter((roll) => !before || Date.parse(roll.created_at) < Date.parse(before))
          .slice(0, limit),
      )
    }
    if (method === 'apply_level_up') {
      const targetId = String(body.target_character)
      const character = characters.find((c) => c.id === targetId)
      const row = sheets.get(targetId)
      const dm = members.find((m) => m.user_id === actor)?.role === 'dm'
      if (!character || !row || (!dm && character.user_id !== actor))
        return respond({ code: '42501', message: 'Forbidden' }, 403)
      if (!body.request_id) return respond({ code: '22023', message: 'Invalid request' }, 400)
      const payload = JSON.stringify([
        targetId,
        body.expected_revision,
        body.new_level,
        body.new_max_hp,
        body.new_build,
      ])
      const prior = levelUpRequests.get(String(body.request_id))
      if (prior)
        return prior.actor === actor && prior.payload === payload
          ? respond(prior.revision)
          : respond({ code: '22023', message: 'Request mismatch' }, 400)
      if (nextLevelUpError) {
        const message = nextLevelUpError
        nextLevelUpError = null
        return respond({ message }, message === 'Unavailable' ? 503 : 400)
      }
      // A Player cannot level an archived or an absent character; the DM can.
      if (!dm && (character.archived_at || character.absent))
        return respond({ code: '42501', message: 'Character unavailable' }, 403)
      if (!dm && options.inEncounter) return respond({ message: 'Encounter locked' }, 400)
      if (row.revision !== body.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
      if (row.status !== 'complete') return respond({ message: 'Sheet incomplete' }, 400)
      const level = Number(body.new_level)
      const maxHp = Number(body.new_max_hp)
      const nextBuild = body.new_build as Record<string, unknown>
      const party = partyLevelOf(String(body.target_campaign))
      if (
        !(level > row.level && level <= 20) ||
        maxHp < row.max_hp ||
        (!dm && (level !== row.level + 1 || maxHp - row.max_hp < 1 || maxHp - row.max_hp > 64))
      )
        return respond({ code: '22023', message: 'Invalid level' }, 400)
      if (!dm && nextBuild.classKey !== row.build.classKey)
        return respond({ message: 'Class change' }, 400)
      if (!dm && (party === null || level > party))
        return respond({ message: 'Above party level' }, 400)
      const before = { level: row.level, max_hp: row.max_hp }
      const changes = [
        ...(before.level !== level ? [{ field: 'level', before: before.level, after: level }] : []),
        ...(before.max_hp !== maxHp
          ? [{ field: 'max_hp', before: before.max_hp, after: maxHp }]
          : []),
        ...[...new Set([...Object.keys(row.build), ...Object.keys(nextBuild)])]
          .filter((key) => JSON.stringify(row.build[key]) !== JSON.stringify(nextBuild[key]))
          .map((key) => ({
            field: `build.${key}`,
            before: row.build[key] ?? null,
            after: nextBuild[key] ?? null,
          })),
      ]
      Object.assign(row, { level, max_hp: maxHp, build: nextBuild, revision: row.revision + 1 })
      // One transaction: the level_up entry, the sheet row and the play-state row share their time.
      const at = new Date().toISOString()
      const state = vitals.get(targetId)! as VitalsRow & { current_hp: number }
      const hpBefore = state.current_hp
      // Play state moves only when the maximum rose, as in the SQL.
      if (maxHp > before.max_hp) {
        state.current_hp = Math.min(state.current_hp + (maxHp - before.max_hp), maxHp)
        state.revision += 1
        record(
          targetId,
          'character_vitals:UPDATE',
          [{ field: 'current_hp', before: hpBefore, after: state.current_hp }],
          at,
        )
      }
      record(targetId, 'character_sheets:UPDATE', changes, at)

      characterEvents.unshift({
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        character_id: targetId,
        actor_id: actor,
        kind: 'level_up',
        before_value: { level: before.level, max_hp: before.max_hp },
        after_value: { level, max_hp: maxHp, party_level: party },
        created_at: at,
      })
      levelUpRequests.set(String(body.request_id), { actor, payload, revision: row.revision })
      return respond(row.revision)
    }
    if (method === 'set_character_vitals') {
      const target = String(body.target_character)
      const state = vitals.get(target)!
      vitalsCalls.push(body)
      const dm = members.find((m) => m.user_id === actor)?.role === 'dm'
      const changeMarker = body.change_concentration === true
      if (!changeMarker && body.new_concentration != null)
        return respond({ message: 'Invalid request' }, 400)
      // A marker the server would refuse is refused first, as the SQL validates it before the
      // replay and the revision.
      const marker =
        changeMarker && body.new_concentration != null ? cleanMarker(body.new_concentration) : null
      if (changeMarker && body.new_concentration != null && marker === null)
        return respond({ message: 'Invalid concentration' }, 400)
      // Request ids replay (same payload) or clash (another payload).
      const payload = JSON.stringify([
        target,
        body.expected_revision,
        body.new_current_hp,
        body.new_temp_hp,
        body.new_hit_dice_spent,
        body.new_death_successes,
        body.new_death_failures,
        body.new_heroic_inspiration,
        body.new_conditions,
        body.new_slots_used,
        body.new_tracker_uses,
        ...(changeMarker ? ['concentration', body.new_concentration ?? null] : []),
      ])
      const prior = vitalsRequests.get(String(body.request_id))
      if (prior) {
        if (prior.actor !== actor || prior.payload !== payload)
          return respond({ message: 'Request mismatch' }, 400)
        return respond(prior.revision)
      }
      const failure = nextVitalsFailures.shift()
      if (failure === 'down') return respond({ message: 'Service unavailable' }, 503)
      // staleVitals(): the next write meets another device's change, whatever refetch ran since.
      if (nextVitalsStale) {
        nextVitalsStale = false
        return respond({ message: 'Stale revision' }, 400)
      }
      if (state.revision !== body.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
      if (
        options.inEncounter &&
        !dm &&
        (body.new_current_hp !== state.current_hp || body.new_temp_hp !== state.temp_hp)
      )
        return respond({ message: 'Encounter locked' }, 400)
      // The absent trigger fires when the row is updated, after the checks above.
      if (characters.find((c) => c.id === target)?.absent && !dm)
        return respond({ message: 'Character absent' }, 400)
      if (body.new_current_hp !== state.current_hp)
        record(target, 'character_vitals:UPDATE', [
          { field: 'current_hp', before: state.current_hp, after: body.new_current_hp },
        ])
      const slotChanges = (body.new_slots_used as number[]).flatMap((count, index) =>
        count !== (state.slots_used as number[])[index] ? [index] : [],
      )
      const nextMarker = changeMarker ? marker : (state.concentration ?? null)
      if (slotChanges.length || nextMarker !== (state.concentration ?? null))
        record(target, 'character_vitals:UPDATE', [
          ...(slotChanges.length
            ? [{ field: 'slots_used', before: state.slots_used, after: body.new_slots_used }]
            : []),
          ...(nextMarker !== (state.concentration ?? null)
            ? [{ field: 'concentration', before: state.concentration ?? null, after: nextMarker }]
            : []),
        ])
      Object.assign(state, {
        current_hp: body.new_current_hp,
        temp_hp: body.new_temp_hp,
        hit_dice_spent: body.new_hit_dice_spent,
        death_successes: body.new_death_successes,
        death_failures: body.new_death_failures,
        heroic_inspiration: body.new_heroic_inspiration,
        conditions: body.new_conditions,
        slots_used: body.new_slots_used,
        tracker_uses: body.new_tracker_uses,
        concentration: nextMarker,
        revision: state.revision + 1,
      })
      vitalsRequests.set(String(body.request_id), { actor, payload, revision: state.revision })
      // 'lost': the write is applied but the answer never arrives (the app retries the same id).
      if (failure === 'lost') return respond({ message: 'Service unavailable' }, 503)
      return respond(state.revision)
    }
    if (method === 'characters') {
      // PostgREST filters used by the app: user_id=eq.X or user_id=not.is.null, is_active=eq.true.
      const userFilters = url.searchParams.getAll('user_id')
      const select = url.searchParams.get('select') ?? ''
      return respond(
        characters
          .filter((c) => c.campaign_id === eq('campaign_id'))
          .filter((c) => !eq('id') || c.id === eq('id'))
          .filter((c) =>
            userFilters.every((filter) =>
              filter === 'not.is.null'
                ? c.user_id !== null
                : c.user_id === filter.replace('eq.', ''),
            ),
          )
          .filter((c) => url.searchParams.get('is_active') !== 'eq.true' || c.is_active)
          // or=(user_id.not.is.null,archived_at.not.is.null): Player or archived characters.
          .filter(
            (c) =>
              !url.searchParams.get('or')?.includes('archived_at') ||
              c.user_id !== null ||
              Boolean(c.archived_at),
          )
          .map((c) =>
            select.includes('character_resources')
              ? {
                  id: c.id,
                  campaign_id: c.campaign_id,
                  user_id: c.user_id,
                  name: c.name,
                  character_resources: [c.character_resources],
                }
              : select.includes('is_active')
                ? {
                    id: c.id,
                    campaign_id: c.campaign_id,
                    user_id: c.user_id,
                    name: c.name,
                    is_active: c.is_active,
                    archived_at: c.archived_at ?? null,
                    absent: Boolean(c.absent),
                    created_at: c.created_at,
                  }
                : { id: c.id, name: c.name, user_id: c.user_id, absent: Boolean(c.absent) },
          ),
      )
    }
    // RYT-044 archive: owner or DM; never the active Player character; restore needs a slot.
    if (method === 'archive_character' || method === 'restore_character') {
      const target = characters.find(
        (c) => c.id === body.target_character && c.campaign_id === body.target_campaign,
      )
      const isDm = members.find((m) => m.user_id === actor)?.role === 'dm'
      if (!target || !(isDm || target.user_id === actor))
        return respond({ message: 'Character unavailable' }, 403)
      if (method === 'archive_character') {
        if (target.user_id && target.is_active && !target.archived_at)
          return respond({ message: 'Active character' }, 400)
        target.is_active = false
        target.archived_at ??= '2026-11-03T12:00:00Z'
        return respond({ id: target.id, archived: true })
      }
      if (target.archived_at) {
        const inRoster = characters.filter(
          (c) =>
            target.user_id &&
            c.campaign_id === target.campaign_id &&
            c.user_id === target.user_id &&
            !c.archived_at,
        )
        if (target.user_id && inRoster.length >= 4)
          return respond({ message: 'Character limit' }, 400)
        target.archived_at = null
        target.is_active = !target.user_id || !inRoster.some((c) => c.is_active)
      }
      return respond({ id: target.id, archived: false })
    }
    // RYT-096 free characters: active Players only; same limit and active rule as assign_character.
    if (method === 'list_claimable_characters' || method === 'claim_character') {
      const player =
        body.target_campaign === campaignId &&
        members.find((m) => m.user_id === actor)?.role === 'player'
      if (!player) return respond({ code: '42501', message: 'Forbidden' }, 403)
      const free = (c: FixtureCharacter) =>
        c.campaign_id === body.target_campaign && !c.user_id && !c.archived_at && !c.absent
      if (method === 'list_claimable_characters')
        return respond(
          characters.filter(free).map((c) => {
            const sheet = sheets.get(c.id)
            return {
              id: c.id,
              name: c.name,
              sheet_status: sheet?.status ?? null,
              class_key: (sheet?.build.classKey as string | undefined) ?? null,
              class_label: (sheet?.build.classLabel as string | undefined) ?? null,
              level: sheet?.level ?? null,
              portrait_path: null,
            }
          }),
        )
      const target = characters.find(
        (c) => c.id === body.target_character && c.campaign_id === body.target_campaign,
      )
      if (nextClaimError) {
        const message = nextClaimError
        nextClaimError = null
        // Another Player won the race for this character.
        if (message === 'Character unavailable' && target && free(target)) target.user_id = peerId
        return respond({ code: 'P0001', message }, 400)
      }
      if (target && target.user_id === actor && !target.archived_at) return respond(target.id)
      if (!target || !free(target))
        return respond({ code: 'P0001', message: 'Character unavailable' }, 400)
      const owned = characters.filter(
        (c) => c.campaign_id === target.campaign_id && c.user_id === actor && !c.archived_at,
      )
      if (owned.length >= 4) return respond({ code: 'P0001', message: 'Character limit' }, 400)
      characterEvents.unshift({
        id: '60000000-0000-4000-8000-' + String(characterEvents.length + 1).padStart(12, '0'),
        campaign_id: target.campaign_id,
        character_id: target.id,
        actor_id: actor,
        kind: 'characters:UPDATE',
        before_value: { name: target.name, user_id: null },
        after_value: { name: target.name, user_id: actor },
        created_at: '2026-10-27T01:12:00Z',
      })
      target.user_id = actor
      target.is_active = !owned.some((c) => c.is_active)
      return respond(target.id)
    }
    // RYT-044 roster RPCs: limit 4 per Player, exactly one active character.
    if (method === 'create_own_character') {
      const owned = characters.filter(
        (c) => c.campaign_id === body.target_campaign && c.user_id === actor,
      )
      if (owned.filter((c) => !c.archived_at).length >= 4)
        return respond({ message: 'Character limit' }, 400)
      const id = '40000000-0000-4000-8000-0000000000e' + String(owned.length + 1)
      characters.push({
        id,
        campaign_id: String(body.target_campaign),
        user_id: actor,
        name: String(body.character_name).trim(),
        is_active: !owned.some((c) => c.is_active),
        created_at: `2026-11-03T0${owned.length}:00:00Z`,
        character_resources: { gold: 0, water_units: 0, rations: 0, exhaustion: 0, revision: 0 },
      })
      sheets.set(id, blankSheet())
      vitals.set(id, blankVitals())
      return respond(id)
    }
    if (method === 'set_active_character') {
      const target = characters.find(
        (c) => c.id === body.target_character && c.campaign_id === body.target_campaign,
      )
      const isDm = members.find((m) => m.user_id === actor)?.role === 'dm'
      if (!target || !(target.user_id === actor || (isDm && target.user_id)))
        return respond({ message: 'Character unavailable' }, 403)
      const owner = target.user_id
      const benched =
        !characters.some((c) => c.user_id === owner && c.is_active) &&
        characters.some((c) => c.user_id === owner && c.absent && !c.archived_at)
      if (target.absent || (!isDm && benched)) return respond({ message: 'Character absent' }, 400)
      for (const c of characters)
        if (c.campaign_id === target.campaign_id && c.user_id === owner)
          c.is_active = c.id === target.id
      return respond(target.id)
    }
    // RYT-079: the DM marks a character absent (out of play) or present again.
    if (method === 'set_character_absent') {
      if (members.find((m) => m.user_id === actor)?.role !== 'dm')
        return respond({ message: 'Forbidden' }, 403)
      const target = characters.find((c) => c.id === body.target_character)
      if (!target || target.archived_at) return respond({ message: 'Character unavailable' }, 400)
      if (body.make_absent && options.inEncounter && target.id === characterId)
        return respond({ message: 'Character in combat' }, 400)
      if (body.make_absent) {
        target.absent = true
        target.is_active = false
      } else if (target.absent) {
        target.absent = false
        target.is_active =
          !target.user_id ||
          !characters.some((c) => c.user_id === target.user_id && c.is_active && c.id !== target.id)
      }
      record(target.id, 'characters:UPDATE', [
        { field: 'absent', before: !body.make_absent, after: Boolean(body.make_absent) },
      ])
      return respond({ id: target.id, absent: Boolean(target.absent), is_active: target.is_active })
    }
    if (method === 'create_character') {
      const id = '40000000-0000-4000-8000-' + String(characters.length + 2).padStart(12, '0')
      const name = String(body.character_name)
      const targetCampaign = String(body.target_campaign)
      characters.push({
        id,
        campaign_id: targetCampaign,
        user_id: null,
        name,
        is_active: true,
        created_at: '2026-10-27T01:00:00Z',
        character_resources: { gold: 0, water_units: 0, rations: 0, exhaustion: 0, revision: 0 },
      })
      sheets.set(id, blankSheet())
      vitals.set(id, blankVitals())
      characterEvents.unshift({
        id: '60000000-0000-4000-8000-' + String(characterEvents.length + 1).padStart(12, '0'),
        campaign_id: targetCampaign,
        character_id: id,
        actor_id: actor,
        kind: 'characters:INSERT',
        before_value: null,
        after_value: { id, campaign_id: targetCampaign, name, user_id: null },
        created_at: '2026-10-27T01:00:00Z',
      })
      return respond(id)
    }
    if (method === 'set_character_resources') {
      const target = characters.find((c) => c.id === body.target_character)!
      if (target.character_resources.revision !== body.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
      const prev = { ...target.character_resources }
      target.character_resources = {
        gold: Number(body.new_gold),
        water_units: Number(body.new_water),
        rations: Number(body.new_rations),
        exhaustion: Number(body.new_exhaustion),
        revision: target.character_resources.revision + 1,
      }
      characterEvents.unshift({
        id: '60000000-0000-4000-8000-' + String(characterEvents.length + 1).padStart(12, '0'),
        campaign_id: target.campaign_id,
        character_id: target.id,
        actor_id: actor,
        kind: 'character_resources:UPDATE',
        before_value: prev,
        after_value: { ...target.character_resources },
        created_at: '2026-10-27T01:05:00Z',
      })
      return respond(target.character_resources.revision)
    }
    if (method === 'assign_character') {
      const target = characters.find((c) => c.id === body.target_character)
      const playsOne = characters.some((c) => c.user_id === body.target_user && c.is_active)
      characters = characters.map((c) =>
        c.id === body.target_character
          ? { ...c, user_id: String(body.target_user), is_active: !playsOne }
          : c,
      )
      if (target) {
        characterEvents.unshift({
          id: '60000000-0000-4000-8000-' + String(characterEvents.length + 1).padStart(12, '0'),
          campaign_id: target.campaign_id,
          character_id: target.id,
          actor_id: actor,
          kind: 'characters:UPDATE',
          before_value: { name: target.name, user_id: target.user_id },
          after_value: { name: target.name, user_id: String(body.target_user) },
          created_at: '2026-10-27T01:10:00Z',
        })
      }
      return respond(null)
    }
    if (method === 'unassign_character') {
      const target = characters.find((c) => c.id === body.target_character)
      characters = characters.map((c) =>
        c.id === body.target_character ? { ...c, user_id: null, is_active: true } : c,
      )
      if (target) {
        characterEvents.unshift({
          id: '60000000-0000-4000-8000-' + String(characterEvents.length + 1).padStart(12, '0'),
          campaign_id: target.campaign_id,
          character_id: target.id,
          actor_id: actor,
          kind: 'characters:UPDATE',
          before_value: { name: target.name, user_id: target.user_id },
          after_value: { name: target.name, user_id: null },
          created_at: '2026-10-27T01:15:00Z',
        })
      }
      return respond(null)
    }
    if (method === 'get_party_overview') {
      const dm = members.find((m) => m.user_id === actor)?.role === 'dm'
      // RYT-097: Players get every assigned character; for teammates the DM does not share,
      // every live field is null. Unassigned characters never reach Players.
      return respond(
        characters
          .filter((c) => c.campaign_id === body.target_campaign && c.is_active)
          .filter((c) => dm || c.user_id !== null)
          .map((c) => {
            const sheet = sheets.get(c.id)
            const state = vitals.get(c.id)
            const shares = sharesLive.get(c.id) !== false
            const live = dm || c.user_id === actor || shares
            return {
              id: c.id,
              name: c.name,
              is_own: c.user_id === actor,
              is_assigned: c.user_id !== null,
              shares_live: shares,
              sheet_status: sheet?.status ?? null,
              class_key: (sheet?.build.classKey as string | undefined) ?? null,
              class_label: (sheet?.build.classLabel as string | undefined) ?? null,
              level: sheet?.level ?? null,
              current_hp: live ? ((state?.current_hp as number | undefined) ?? null) : null,
              max_hp: live ? (sheet?.max_hp ?? null) : null,
              temp_hp: live ? ((state?.temp_hp as number | undefined) ?? null) : null,
              armor_class: live ? (sheet?.armor_class ?? null) : null,
              exhaustion: live ? c.character_resources.exhaustion : null,
              conditions: live ? ((state?.conditions as string[] | undefined) ?? []) : null,
              concentration: live
                ? ((state?.concentration as string | null | undefined) ?? null)
                : null,
              below_party_level:
                sheet?.status === 'complete' &&
                partyLevelOf(String(body.target_campaign)) !== null &&
                sheet.level < partyLevelOf(String(body.target_campaign))!,
            }
          }),
      )
    }
    if (method === 'set_character_live_sharing') {
      if (members.find((m) => m.user_id === actor)?.role !== 'dm')
        return respond({ message: 'Forbidden' }, 403)
      const target = characters.find((c) => c.id === body.target_character)!
      const before = sharesLive.get(target.id) !== false
      sharesLive.set(target.id, Boolean(body.enabled))
      if (before !== Boolean(body.enabled))
        characterEvents.unshift({
          id: '60000000-0000-4000-8000-' + String(characterEvents.length + 1).padStart(12, '0'),
          campaign_id: target.campaign_id,
          character_id: target.id,
          actor_id: actor,
          kind: 'characters:UPDATE',
          before_value: { name: target.name, user_id: target.user_id, shares_live: before },
          after_value: {
            name: target.name,
            user_id: target.user_id,
            shares_live: Boolean(body.enabled),
          },
          created_at: '2026-10-27T01:20:00Z',
        })
      return respond(Boolean(body.enabled))
    }
    // RYT-115 account RPCs: the server's shapes (migration 20261125120000), in memory.
    if (method === 'export_my_data')
      return respond({
        format: 'rytta-account-export',
        version: 1,
        environment: 'pre',
        generated_at: '2026-11-17T10:00:00Z',
        limits: { rows_per_section: 500 },
        truncated: options.account?.truncated ?? [],
        profile: { user_id: actor, username: usernames.get(actor) ?? null },
        memberships: [{ campaign: 'The Sunken Coast', role: 'dm' }],
      })
    const accountBlockers = [
      { campaign_id: campaignId, campaign_name: 'The Sunken Coast', other_members: 3 },
      { campaign_id: otherCampaignId, campaign_name: 'Winter at the Keep', other_members: 1 },
    ]
    if (method === 'account_deletion_blockers')
      return respond(accountBlockedNow ? accountBlockers : [])
    if (method === 'account_storage_paths') return respond(accountObjects)
    if (
      request.method() === 'DELETE' &&
      url.pathname.endsWith('/storage/v1/object/character-portraits')
    ) {
      const gone = new Set(Array.isArray(body.prefixes) ? body.prefixes.map(String) : [])
      accountObjects = accountObjects.filter((row) => !gone.has(row.object_path))
      return respond([...gone].map((name) => ({ name })))
    }
    if (method === 'prepare_account_deletion') {
      if (options.account?.prepareError)
        return respond({ message: options.account.prepareError }, 400)
      const blocked = accountBlockedNow || Boolean(options.account?.blockOnPrepare)
      accountBlockedNow = blocked
      accountPrepared = !blocked
      return respond({
        blockers: blocked ? accountBlockers : [],
        campaigns: blocked ? [] : [campaignId],
        storage_paths: blocked ? [] : accountObjects,
        revoked_invitations: 0,
      })
    }
    if (method === 'delete_my_account') {
      if (options.account?.deleteError)
        return respond({ message: options.account.deleteError }, 400)
      if (body.confirmation !== 'DELETE') return respond({ message: 'Confirmation required' }, 400)
      if (!accountPrepared) return respond({ message: 'Account deletion not prepared' }, 400)
      if (accountObjects.length > 0)
        return respond({ message: 'Account deletion not prepared' }, 400)
      const authUser = options.account?.authUser ?? 'deleted'
      return respond({
        deleted: authUser === 'deleted' || authUser === 'absent' || authUser === 'shared',
        data_deleted: true,
        environment: 'pre',
        auth_user: authUser,
        campaigns_deleted: [],
        campaigns_left: [campaignId],
      })
    }
    if (method === 'get_my_username') return respond(usernames.get(actor) ?? null)
    if (method === 'username_available') {
      const name = String(body.candidate).trim()
      return respond(/^[A-Za-z0-9_]{3,24}$/.test(name) && !usernameHeldByOther(name, actor))
    }
    if (method === 'set_my_username') {
      const name = String(body.new_username).trim()
      if (!/^[A-Za-z0-9_]{3,24}$/.test(name)) return respond({ message: 'Invalid username' }, 400)
      if (usernameHeldByOther(name, actor)) return respond({ message: 'Username taken' }, 400)
      usernames.set(actor, name)
      members = members.map((m) => (m.user_id === actor ? { ...m, display_name: name } : m))
      return respond(name)
    }
    if (method === 'list_campaign_members') return respond(members)
    if (method === 'campaign_invitations') return respond(sent)
    if (method === 'invite_character_player' || method === 'invite_campaign_member') {
      sent.push({
        id: inviteId,
        email: String(body.invite_email),
        expires_at: '2099-10-27T00:00:00Z',
      })
      return respond(inviteId)
    }
    if (method === 'revoke_campaign_invitation') {
      sent = []
      return respond(null)
    }
    if (method === 'set_campaign_modules') {
      const nextModules = Array.isArray(body.modules) ? body.modules.map(String) : ['party']
      campaigns = campaigns.map((c) =>
        c.id === body.target_campaign ? { ...c, player_modules: nextModules } : c,
      )
      return respond(nextModules)
    }
    if (method === 'character_events') {
      const targetCampaign = url.searchParams.get('campaign_id')?.replace('eq.', '')
      const targetCharacter = url.searchParams.get('character_id')?.replace('eq.', '')
      return respond(
        characterEvents.filter(
          (e) =>
            e.campaign_id === targetCampaign &&
            (!targetCharacter || e.character_id === targetCharacter),
        ),
      )
    }
    if (method === 'change_campaign_member') {
      // The member list belongs to the main campaign; in the others the account is a Player.
      const own = body.target_campaign === campaignId
      // RYT-095: a member may leave (role null); a campaign always keeps one DM.
      const dms = members.filter((m) => m.role === 'dm')
      if (
        own &&
        body.new_role !== 'dm' &&
        dms.length <= 1 &&
        dms.some((m) => m.user_id === body.target_user)
      )
        return respond({ code: 'P0001', message: 'Keep at least one DM' }, 400)
      if (!body.new_role) {
        characters = characters.map((c) =>
          c.user_id === body.target_user && c.campaign_id === body.target_campaign
            ? { ...c, user_id: null, is_active: true }
            : c,
        )
      }
      if (own)
        members = body.new_role
          ? members.map((m) =>
              m.user_id === body.target_user ? { ...m, role: String(body.new_role) } : m,
            )
          : members.filter((m) => m.user_id !== body.target_user)
      if (body.target_user === currentId)
        campaigns = body.new_role
          ? campaigns.map((c) =>
              c.id === body.target_campaign ? { ...c, role: String(body.new_role) } : c,
            )
          : campaigns.filter((c) => c.id !== body.target_campaign)
      return respond(null)
    }
    // RYT-008 homebrew glossary: RLS lets the DM, or a Player with the module on, read and write.
    const glossaryAllowed = () => {
      const campaign = campaigns.find((c) => c.id === campaignId)
      return Boolean(
        campaign && (campaign.role === 'dm' || campaign.player_modules.includes('glossary')),
      )
    }
    if (method === 'glossary_entries')
      return respond(
        glossaryAllowed() ? glossaryEntries.filter((e) => e.campaign_id === eq('campaign_id')) : [],
      )
    if (method === 'save_glossary_entry') {
      if (!glossaryAllowed()) return respond({ message: 'Forbidden' }, 403)
      const payload = body.payload as Record<string, unknown>
      const existing = glossaryEntries.find((e) => e.id === body.entry_id)
      if (
        glossaryEntries.some(
          (e) =>
            e.id !== body.entry_id &&
            String(e.name).toLowerCase() === String(payload.name).toLowerCase(),
        )
      )
        return respond({ message: 'Duplicate name' }, 400)
      if (existing && existing.revision !== body.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
      // The real RPC refuses to update an entry that was deleted meanwhile.
      if (!existing && body.expected_revision !== null)
        return respond({ message: 'Stale revision' }, 400)
      const saved = {
        id: String(body.entry_id),
        campaign_id: String(body.target_campaign),
        category: String(payload.category),
        name: String(payload.name),
        aliases: (payload.aliases as string[]) ?? [],
        summary: String(payload.summary ?? ''),
        body: String(payload.body ?? ''),
        facts: (payload.facts as { label: string; value: string }[]) ?? [],
        srd_ref: (payload.srd_ref as string | null) ?? null,
        revision: existing ? existing.revision + 1 : 1,
        created_by: existing?.created_by ?? actor,
        updated_by: actor,
        updated_at: '2026-11-03T12:00:00Z',
      }
      glossaryEntries = [...glossaryEntries.filter((e) => e.id !== saved.id), saved]
      return respond(saved)
    }
    if (method === 'delete_glossary_entry') {
      if (!glossaryAllowed()) return respond({ message: 'Forbidden' }, 403)
      const existing = glossaryEntries.find((e) => e.id === body.entry_id)
      if (existing && existing.revision !== body.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
      glossaryEntries = glossaryEntries.filter((e) => e.id !== body.entry_id)
      return respond({ id: body.entry_id, deleted: true })
    }
    // RYT-080 group rest: the SQL rules (supabase/migrations/20261114120000) in memory.
    if (method === 'get_rest_state') {
      restExpire()
      const recent =
        rest &&
        (rest.status === 'open' ||
          Date.now() - Date.parse(rest.resolved_at ?? rest.created_at) < 10 * 60_000)
      return respond(recent ? restStateFor(actor) : null)
    }
    if (method === 'request_rest') {
      const isDm = members.find((m) => m.user_id === actor)?.role === 'dm'
      if (rest && rest.id === body.request_id) {
        if (rest.requested_by !== actor || rest.kind !== body.rest_kind)
          return respond({ message: 'Request mismatch' }, 400)
        return respond(restStateFor(actor))
      }
      const mine = characters.find((c) => c.user_id === actor && c.is_active && !c.archived_at)
      if (!isDm && !mine) return respond({ message: 'Character unavailable' }, 400)
      if (!isDm && options.inEncounter) return respond({ message: 'Character in combat' }, 400)
      restExpire()
      if (rest?.status === 'open') return respond({ message: 'Rest open' }, 400)
      const now = Date.now()
      rest = {
        id: String(body.request_id),
        kind: body.rest_kind as 'short' | 'long',
        status: 'open',
        requested_by: actor,
        requester_character: mine?.id ?? null,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + 10 * 60_000).toISOString(),
        resolved_at: null,
        revision: 0,
        outcome: null,
      }
      restVotes.clear()
      if (mine && rest.kind === 'long' && Number(vitals.get(mine.id)!.current_hp) > 0) {
        restVotes.set(mine.id, { vote: 'yes', dice_spent: 0, dice_roll: null })
        restSettle()
      }
      return respond(restStateFor(actor))
    }
    if (method === 'vote_rest') {
      restExpire()
      if (!rest || rest.id !== body.target_request)
        return respond({ message: 'Rest unavailable' }, 400)
      if (rest.status !== 'open') return respond({ message: 'Rest closed' }, 400)
      const isDm = members.find((m) => m.user_id === actor)?.role === 'dm'
      const target = restParty().find((c) => c.id === body.target_character)
      if (!target) return respond({ message: 'Character unavailable' }, 400)
      if (!(target.user_id === actor || (isDm && target.user_id === null)))
        return respond({ message: 'Forbidden' }, 403)
      // RYT-137: with dice in the app, a short-rest "yes" that spends hit dice has to match the
      // character's own hit-dice roll in force (its dice, summed, without the CON bonus).
      if (
        !isDm &&
        dice.dice_mode === 'app' &&
        rest.kind === 'short' &&
        body.vote_value === 'yes' &&
        Number(body.spent ?? 0) > 0
      ) {
        const made = dice.rolls.find(
          (roll) =>
            roll.character_id === target.id &&
            roll.kind === 'hit_die' &&
            dice.inForce(roll) &&
            roll.dice.length === Number(body.spent) &&
            roll.dice.reduce((sum, face) => sum + face, 0) === Number(body.roll),
        )
        if (!made) return respond({ code: 'P0001', message: 'Roll required' }, 400)
      }
      const error = restVote(
        target.id,
        String(body.vote_value),
        body.spent as number | null,
        body.roll as number | null,
      )
      if (error) return respond({ message: error }, 400)
      return respond(restStateFor(actor))
    }
    if (method === 'resolve_rest_now' || method === 'cancel_rest') {
      restExpire()
      const isDm = members.find((m) => m.user_id === actor)?.role === 'dm'
      if (!rest || rest.id !== body.target_request)
        return respond({ message: 'Rest unavailable' }, 400)
      if (!(isDm || (method === 'cancel_rest' && rest.requested_by === actor)))
        return respond({ message: 'Forbidden' }, 403)
      if (rest.status !== 'open') return respond({ message: 'Rest closed' }, 400)
      if (method === 'resolve_rest_now') restFinish()
      else
        Object.assign(rest, {
          status: 'cancelled',
          resolved_at: new Date().toISOString(),
          revision: rest.revision + 1,
        })
      return respond(restStateFor(actor))
    }
    // RYT-093: the account menu asks whether the account edits the content library.
    if (method === 'get_content_library') return respond({ editor: false, packs: [] })
    return respond({ message: 'Unhandled test route' }, 500)
  })
  return {
    calls,
    /** RYT-080: a teammate (or the DM for an unassigned character) votes on the open rest. */
    restVote: (
      character: string,
      vote: 'yes' | 'no',
      spent: number | null = null,
      roll: number | null = null,
    ) => restVote(character, vote, spent, roll),
    /** RYT-080: someone else (the DM, or a Player's character) asks for a rest. */
    openRest: (kind: 'short' | 'long', requester: { user: string; character: string | null }) => {
      const now = Date.now()
      rest = {
        id: crypto.randomUUID(),
        kind,
        status: 'open',
        requested_by: requester.user,
        requester_character: requester.character,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + 10 * 60_000).toISOString(),
        resolved_at: null,
        revision: 0,
        outcome: null,
      }
      restVotes.clear()
      if (requester.character && kind === 'long')
        restVotes.set(requester.character, { vote: 'yes', dice_spent: 0, dice_roll: null })
    },
    /** RYT-080: the open rest request runs out of time. */
    expireRest: () => {
      if (rest?.status === 'open') rest.expires_at = new Date(Date.now() - 1000).toISOString()
    },
    vitalsOf: (character: string) => vitals.get(character),
    maxResources: () => {
      characters[0]!.character_resources = {
        // RYT-104: gold is numeric(12,2), so its maximum is 9,999,999,999.99 gp.
        gold: 9_999_999_999.99,
        water_units: 2147483647,
        rations: 2147483647,
        exhaustion: 2147483647,
        revision: 0,
      }
    },
    inventory,
    /** Another member saved the homebrew entry: its revision moves on. */
    changeHomebrew: (id: string, patch: { summary?: string; body?: string }) => {
      glossaryEntries = glossaryEntries.map((e) =>
        e.id === id ? { ...e, ...patch, revision: e.revision + 1 } : e,
      )
    },
    /** Another member deleted the homebrew entry. */
    removeHomebrew: (id: string) => {
      glossaryEntries = glossaryEntries.filter((e) => e.id !== id)
    },
    staleItem: (index = 0) => {
      inventory.stacks[index]!.revision += 1
    },
    /** RYT-134: the next play-state writes fail ('down': refused, 'lost': applied, answer lost). */
    failVitals: (...kinds: ('down' | 'lost')[]) => {
      nextVitalsFailures = kinds
    },
    /** RYT-134: the DM benches the character while the Player's sheet is already open. */
    benchCharacter: () => {
      characters[0]!.absent = true
    },
    /** RYT-134: every set_character_vitals body received, in order. */
    vitalsCalls,
    staleVitals: () => {
      vitals.get(characterId)!.revision += 1
      nextVitalsStale = true
    },
    staleResources: () => {
      characters[0]!.character_resources.revision += 1
      characters[0]!.character_resources.gold = 70
    },
    /** RYT-096: the next claim fails with this server message ('Character unavailable' also
     * hands the character to another Player, as a lost race would). */
    failNextClaim: (
      message: 'Character unavailable' | 'Character limit' | 'Forbidden' = 'Character unavailable',
    ) => {
      nextClaimError = message
    },
    failCampaigns: () => {
      failList = true
    },
    /** RYT-130: the next set_party_level fails (nothing applied) with this server message. */
    failNextPartyLevel: (message = 'Unavailable') => {
      nextPartyLevelError = message
    },
    /** RYT-130: the next apply_level_up fails (nothing applied) with this server message. */
    failNextLevelUp: (message = 'Unavailable') => {
      nextLevelUpError = message
    },
    /** RYT-130: the DM changes the party level from elsewhere. */
    setPartyLevel: (level: number | null) => {
      campaigns = campaigns.map((c) => (c.id === campaignId ? { ...c, party_level: level } : c))
    },
    /** RYT-130: another device saved the sheet, so the revision a level-up started from is stale. */
    staleSheet: (id = characterId) => {
      sheets.get(id)!.revision += 1
    },
    /** RYT-142: the sheet's Dexterity changed on another device (the next read returns it). */
    setSheetDex: (dex: number, id = characterId) => {
      const sheet = sheets.get(id)!
      const build = sheet.build as { baseAbilities?: Record<string, number> }
      sheet.build = { ...sheet.build, baseAbilities: { ...build.baseAbilities, dex } }
      sheet.revision += 1
    },
    revokeAccess: () => {
      campaigns = []
    },
    /** RYT-133: the table's dice store: settings, rolls, failures and the roll signal. */
    dice,
  }
}

/** A complete level 5 bard used to render the sheet without walking the wizard. */
export function sampleSheet({
  level = 5,
  subclass,
  wizard = false,
  abilities,
}: {
  level?: number
  subclass?: string
  wizard?: boolean
  abilities?: Record<string, number>
} = {}) {
  const base = sampleSheetBase(level, subclass)
  if (!wizard && !abilities) return base
  return {
    ...base,
    build: {
      ...base.build,
      ...(wizard
        ? {
            classKey: 'wizard',
            classLabel: 'Mago',
            subclassKey: 'evoker',
            hitDie: 6,
            spellAbility: 'int',
            saves: ['int', 'wis'],
          }
        : {}),
      baseAbilities: { ...base.build.baseAbilities, ...abilities },
    },
  }
}

function sampleSheetBase(level: number, subclass?: string) {
  return {
    status: 'complete',
    level,
    max_hp: 38,
    armor_class: 14,
    revision: 3,
    build: {
      classKey: 'bard',
      classLabel: 'Bardo',
      subclass: subclass ?? 'Colegio del Saber',
      speciesKey: 'elf',
      speciesLabel: 'Elfo',
      backgroundKey: 'sage',
      backgroundLabel: 'Sabio',
      alignment: 'Neutral bueno',
      abilityMethod: 'standard',
      baseAbilities: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
      bonuses: { str: 0, dex: 0, con: 1, int: 0, wis: 0, cha: 0 },
      saves: ['dex', 'cha'],
      skills: {
        arcana: 'proficient',
        history: 'proficient',
        performance: 'expertise',
        persuasion: 'proficient',
        perception: 'proficient',
      },
      hitDie: 8,
      speed: 30,
      acOverride: 14,
      casterKind: 'full',
      spellAbility: 'cha',
      languages: 'Común, élfico, dracónico',
      proficiencies: 'Armadura ligera, laúd',
      appearance: '',
      notes: 'Busca el faro sumergido.',
      features: [
        {
          id: 'species-darkvision',
          name: 'Visión en la oscuridad',
          source: 'species',
          description: '',
        },
        {
          id: 'class-1',
          name: 'Inspiración bárdica',
          source: 'class',
          description: 'Un dado de inspiración para un aliado.',
        },
      ],
      trackers: [{ id: 'tracker-1', name: 'Inspiración bárdica', max: 3, reset: 'short' }],
      spells: [
        {
          id: 'spell-1',
          name: 'Mano de mago',
          level: 0,
          concentration: false,
          ritual: false,
          prepared: true,
          notes: '',
        },
        {
          id: 'spell-2',
          name: 'Palabra sanadora',
          level: 1,
          concentration: false,
          ritual: false,
          prepared: true,
          notes: 'Acción adicional, 18 m.',
        },
      ],
    },
  }
}

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGM8UaHBgA0wYRUdtBIAHicBeAYWg8oAAAAASUVORK5CYII=',
  'base64',
)
type Definition = Record<string, unknown> & {
  id: string
  revision: number
  category: string
  slot_kind: string
}
type Stack = {
  id: string
  campaign_id: string
  character_id: string
  definition_id: string
  quantity: number
  equipped_slot: string | null
  source: string
  notes: string
  revision: number
}
type Event = {
  id: string
  character_id: string
  item_id: string
  actor_id: string
  kind: string
  quantity_delta: number
  after_value: Record<string, unknown>
  undo_of: string | null
  undone_by: string | null
  created_at: string
}
/** In-memory inventory contract mirroring the RYT-004 RPCs closely enough for the UI. */
function inventoryState(
  characterIds: string[],
  seeded: boolean,
  catalogue = false,
  supplies: (
    characterId: string,
    rations: number,
    water: number,
  ) => { rations: number; water: number } | null = () => null,
  characterName: (characterId: string) => string | null = () => null,
) {
  let counter = 0
  const id = (prefix: string) => `${prefix}-0000-4000-8000-${String(++counter).padStart(12, '0')}`
  const definition = (partial: Partial<Definition>): Definition => ({
    id: id('80000000'),
    campaign_id: campaignId,
    name: 'Item',
    category: 'gear',
    icon: 'package',
    rarity: 'common',
    weight_tenths: 10,
    value_gp: null,
    description: '',
    slot_kind: 'none',
    properties: {},
    origin: 'dm',
    archived: false,
    created_by: dmId,
    revision: 0,
    translations: null,
    basic_key: null,
    is_template: false,
    image_path: null,
    ...partial,
    // RYT-104: weight_lb is the source of truth; weight_tenths follows it.
    weight_lb: Number(partial.weight_lb ?? Number(partial.weight_tenths ?? 10) / 10),
  })
  const definitions: Definition[] = seeded
    ? [
        definition({
          name: 'Poción de curación',
          category: 'consumable',
          icon: 'flask-conical',
          rarity: 'uncommon',
          weight_tenths: 5,
          value_gp: 50,
          description: 'Recupera 2d4 + 2 PG.',
        }),
        definition({
          name: 'Espada larga',
          category: 'weapon',
          icon: 'sword',
          slot_kind: 'one_hand',
          weight_tenths: 30,
          value_gp: 15,
          properties: { dice: '1d8', versatileDice: '1d10', damageType: 'slashing' },
        }),
        definition({
          name: 'Armadura de cuero',
          category: 'armor',
          icon: 'shirt',
          slot_kind: 'body',
          weight_tenths: 100,
          properties: { base: 11, dexCap: null },
        }),
        definition({
          name: 'Escudo',
          category: 'shield',
          icon: 'shield',
          slot_kind: 'shield',
          weight_tenths: 60,
          properties: { acBonus: 2 },
        }),
        definition({ name: 'Flecha', category: 'ammo', icon: 'feather', weight_tenths: 1 }),
        definition({
          name: 'Anillo de la marea',
          category: 'treasure',
          icon: 'gem',
          slot_kind: 'ring',
          rarity: 'rare',
          weight_tenths: 0,
        }),
      ]
    : []
  // RYT-104/105: basic catalogue items, a template and one pending Player proposal.
  if (catalogue) {
    const sword = definitions.find((d) => d.name === 'Espada larga')
    if (sword) sword.is_template = true
    definitions.push(
      definition({
        name: 'Raciones',
        category: 'consumable',
        icon: 'drumstick',
        weight_lb: 2,
        weight_tenths: 20,
        value_gp: 0.5,
        origin: 'srd',
        basic_key: 'rations',
        description: 'Comida seca para un día de viaje.',
        translations: {
          en: { name: 'Rations', description: 'Dry food for a day on the road.' },
          es: { name: 'Raciones', description: 'Comida seca para un día de viaje.' },
        },
        properties: { rations: 1 },
      }),
      definition({
        name: 'Mochila reforzada',
        icon: 'backpack',
        weight_lb: 6,
        weight_tenths: 60,
        value_gp: 12.5,
        origin: 'dm',
        basic_key: 'reinforcedBackpack',
        description: 'Correas acolchadas que reparten el peso.',
        translations: {
          en: { name: 'Reinforced backpack', description: 'Padded straps spread the weight.' },
          es: {
            name: 'Mochila reforzada',
            description: 'Correas acolchadas que reparten el peso.',
          },
        },
        properties: { container: { capacityLb: 40, loadReductionPercent: 10 } },
      }),
      definition({
        name: 'Cuerda de cáñamo',
        icon: 'link',
        weight_lb: 10,
        weight_tenths: 100,
        value_gp: 1,
        origin: 'srd',
        basic_key: 'rope',
        description: '15 metros de cuerda.',
      }),
    )
  }
  type Proposal = {
    id: string
    character_id: string
    proposed_by: string
    draft: Record<string, unknown>
    quantity: number
    status: string
    dm_note: string
    resolved_definition_id: string | null
    revision: number
    created_at: string
    updated_at: string
    resolved_at: string | null
  }
  const proposals: Proposal[] = []
  if (catalogue && characterIds[0])
    proposals.push({
      id: id('b0000000'),
      character_id: characterIds[0],
      proposed_by: playerId,
      draft: {
        name: 'Amuleto de la abuela',
        description: 'Un colgante de hueso que siempre está tibio.',
        category: 'treasure',
        icon: 'medal',
        rarity: 'uncommon',
        slot_kind: 'neck',
        properties: {},
        weight_lb: 0.25,
        suggested_value_gp: 25,
      },
      quantity: 1,
      status: 'pending',
      dm_note: '',
      resolved_definition_id: null,
      revision: 0,
      created_at: '2026-11-15T10:00:00Z',
      updated_at: '2026-11-15T10:00:00Z',
      resolved_at: null,
    })
  const proposalJson = (p: Proposal, dm: boolean) => ({
    id: p.id,
    character_id: p.character_id,
    character_name: characterName(p.character_id),
    proposed_by_you: p.proposed_by === (dm ? dmId : playerId),
    proposer_name: dm ? 'Arin' : null,
    draft: p.draft,
    quantity: p.quantity,
    status: p.status,
    dm_note: p.dm_note,
    resolved_definition_id: p.resolved_definition_id,
    revision: p.revision,
    created_at: p.created_at,
    updated_at: p.updated_at,
    resolved_at: p.resolved_at,
  })
  const stacks: Stack[] = []
  const events: Event[] = []
  const stack = (
    characterId: string,
    definitionId: string,
    quantity: number,
    slot: string | null = null,
  ) => {
    const row: Stack = {
      id: id('90000000'),
      campaign_id: campaignId,
      character_id: characterId,
      definition_id: definitionId,
      quantity,
      equipped_slot: slot,
      source: 'dm',
      notes: '',
      revision: 0,
    }
    stacks.push(row)
    return row
  }
  if (seeded && characterIds[0]) {
    const [potion, sword, leather, shield, arrow, ring] = definitions
    stack(characterIds[0], potion!.id, 3)
    stack(characterIds[0], sword!.id, 1)
    stack(characterIds[0], leather!.id, 1, 'body')
    stack(characterIds[0], shield!.id, 1)
    stack(characterIds[0], arrow!.id, 20)
    stack(characterIds[0], ring!.id, 1)
  }
  const record = (
    row: Stack,
    actor: string,
    kind: string,
    delta: number,
    undoOf: string | null = null,
  ) => {
    const event: Event = {
      id: id('a0000000'),
      character_id: row.character_id,
      item_id: row.id,
      actor_id: actor,
      kind,
      quantity_delta: delta,
      after_value: {
        quantity: row.quantity,
        revision: row.revision,
        definition_id: row.definition_id,
      },
      undo_of: undoOf,
      undone_by: null,
      created_at: new Date().toISOString(),
    }
    events.unshift(event)
    return { item_id: row.id, event_id: event.id, revision: row.revision }
  }
  type LootLine = {
    character_id: string
    definition_id: string
    quantity: number
    revision: number
  }
  const lootBatches: { id: string; name: string; allocations: LootLine[] }[] = []
  const lootReceipts = new Map<string, { allocations: LootLine[]; batch_id: string | null }>()
  // One import mock (and one replay memory) for every fixture that serves import_basic_items.
  const importBasic = basicImportMock({
    definitions,
    create: (entry, key) => {
      const row = definition({
        ...entry,
        key: undefined,
        weight_tenths: Math.round(Number(entry.weight_lb ?? 0) * 10),
        origin: 'srd',
        basic_key: key,
      })
      delete row.key
      return row
    },
  })
  return {
    stacks,
    definitions,
    events,
    importBasic,
    handle(
      method: string,
      body: Record<string, unknown>,
      eq: (name: string) => string | undefined,
      dm: boolean,
    ) {
      const actor = dm ? dmId : playerId
      if (method === 'item_definitions') {
        const image = eq('image_path')
        return image ? definitions.filter((d) => d.image_path === image) : definitions
      }
      if (method === 'inventory_items')
        return stacks.filter((row) => row.character_id === eq('character_id') && row.quantity > 0)
      if (method === 'inventory_events')
        return events.filter((event) => event.character_id === eq('character_id'))
      if (method === 'set_item_image') {
        const item = definitions.find((d) => d.id === body.target_definition)
        if (!dm || !item) return new Error('Forbidden')
        if (item.revision !== body.expected_revision) return new Error('Stale revision')
        item.image_path = body.new_path
        item.revision += 1
        return { id: item.id, revision: item.revision }
      }
      if (method === 'save_item_definition') {
        const item = body.item as Record<string, unknown>
        // RYT-105 release: only the DM creates or edits definitions.
        if (!dm) return new Error('Forbidden')
        const existing = definitions.find((d) => d.id === body.target_definition)
        if (existing) {
          Object.assign(existing, item, {
            revision: existing.revision + 1,
            weight_tenths: Math.round(Number(item.weight_lb ?? existing.weight_lb ?? 0) * 10),
          })
          return { id: existing.id, revision: existing.revision }
        }
        const created = definition({
          ...item,
          origin: dm ? (item.origin === 'srd' ? 'srd' : 'dm') : 'player',
          created_by: actor,
        })
        definitions.push(created)
        return { id: created.id }
      }
      // RYT-032 lifecycle without shops; shopsFixture layers listings on top.
      if (method === 'item_definition_impact') {
        if (!dm) return new Error('Forbidden')
        const held = stacks.filter((s) => s.definition_id === body.target_definition)
        return {
          listings: [],
          holders: new Set(held.filter((s) => s.quantity > 0).map((s) => s.character_id)).size,
          units: held.reduce((n, s) => n + s.quantity, 0),
          open_orders: 0,
          open_trades: 0,
        }
      }
      // RYT-104/105 catalogue RPCs (the shops fixture layers its own import on top).
      if (method === 'search_campaign_items') {
        const needle = String(body.search_query ?? '')
          .trim()
          .toLowerCase()
        const carried = new Set(stacks.filter((s) => s.quantity > 0).map((s) => s.definition_id))
        return definitions
          .filter((d) => !d.archived)
          .filter((d) => dm || d.basic_key || d.created_by === playerId || carried.has(d.id))
          .filter((d) => {
            const names = [
              d.name,
              ...Object.values((d.translations ?? {}) as object).map(
                (t) => (t as { name: string }).name,
              ),
            ]
            return !needle || names.some((n) => String(n).toLowerCase().includes(needle))
          })
          .sort((a, b) => String(a.name).localeCompare(String(b.name)))
          .slice(0, Number(body.max_results ?? 50))
          .map((d) => ({
            id: d.id,
            name: d.name,
            description: d.description,
            translations: d.translations ?? null,
            category: d.category,
            icon: d.icon,
            image_path: d.image_path ?? null,
            rarity: d.rarity,
            weight_lb: d.weight_lb,
            weight_tenths: d.weight_tenths,
            slot_kind: d.slot_kind,
            properties: d.properties,
            origin: d.origin,
            basic_key: d.basic_key ?? null,
            is_template: Boolean(d.is_template),
            value_gp: dm || d.basic_key ? (d.value_gp ?? null) : null,
            revision: d.revision,
            created_by_you: d.created_by === (dm ? dmId : playerId),
          }))
      }
      if (method === 'set_item_template') {
        const item = definitions.find((d) => d.id === body.target_definition)
        if (!dm || !item) return new Error('Forbidden')
        if (item.revision !== body.expected_revision) return new Error('Stale revision')
        if (Boolean(item.is_template) !== body.make_template) {
          item.is_template = Boolean(body.make_template)
          item.revision += 1
        }
        return { id: item.id, is_template: item.is_template, revision: item.revision }
      }
      if (method === 'import_basic_items') {
        if (!dm) return new Error('Forbidden')
        const reply = importBasic(body)
        return 'error' in reply ? new Error(reply.error) : reply.data
      }
      if (method === 'list_item_proposals') {
        const own = (p: Proposal) => dm || p.character_id === characterIds[0]
        return proposals
          .filter(own)
          .filter((p) => !body.target_character || p.character_id === body.target_character)
          .filter((p) => body.include_closed !== false || p.status === 'pending')
          .map((p) => proposalJson(p, dm))
      }
      if (method === 'propose_item') {
        const draft = body.draft as Record<string, unknown>
        if (['value_gp', 'is_template', 'basic_key', 'origin'].some((k) => k in draft))
          return new Error('Forbidden')
        const open = proposals.filter(
          (p) => p.character_id === body.target_character && p.status === 'pending',
        )
        if (open.length >= 20) return new Error('Too many proposals')
        const now = new Date().toISOString()
        const row: Proposal = {
          id: id('b0000000'),
          character_id: String(body.target_character),
          proposed_by: actor,
          draft,
          quantity: Number(body.quantity),
          status: 'pending',
          dm_note: '',
          resolved_definition_id: null,
          revision: 0,
          created_at: now,
          updated_at: now,
          resolved_at: null,
        }
        proposals.unshift(row)
        return { id: row.id, status: row.status, revision: row.revision }
      }
      if (method === 'cancel_item_proposal') {
        const row = proposals.find((p) => p.id === body.target_proposal)
        if (!row || row.proposed_by !== actor) return new Error('Forbidden')
        if (row.status !== 'pending') return new Error('Proposal closed')
        if (row.revision !== body.expected_revision) return new Error('Stale revision')
        row.status = 'cancelled'
        row.revision += 1
        return { id: row.id, status: row.status, revision: row.revision }
      }
      if (method === 'resolve_item_proposal') {
        const row = proposals.find((p) => p.id === body.target_proposal)
        if (!dm) return new Error('Forbidden')
        if (!row) return new Error('Proposal unavailable')
        if (row.status !== 'pending') return new Error('Proposal closed')
        if (row.revision !== body.expected_revision) return new Error('Stale revision')
        let target: Definition | undefined
        if (body.resolution === 'accept') {
          const draft = (body.draft ?? row.draft) as Record<string, unknown>
          target = definition({
            ...draft,
            weight_tenths: Math.round(Number(draft.weight_lb ?? 0) * 10),
            origin: 'player',
            created_by: dmId,
          })
          definitions.push(target)
        } else if (body.resolution === 'merge') {
          target = definitions.find((d) => d.id === body.target_definition && !d.archived)
          if (!target) return new Error('Item unavailable')
        }
        let granted: { item_id: string; event_id: string } | undefined
        if (target) {
          const stack0 = stack(row.character_id, target.id, Number(body.quantity))
          granted = record(stack0, actor, 'grant', Number(body.quantity))
        }
        row.status =
          body.resolution === 'accept'
            ? 'accepted'
            : body.resolution === 'merge'
              ? 'merged'
              : 'rejected'
        row.dm_note = String(body.note ?? '')
        row.resolved_definition_id = target?.id ?? null
        row.revision += 1
        row.resolved_at = new Date().toISOString()
        return {
          id: row.id,
          status: row.status,
          revision: row.revision,
          definition_id: target?.id ?? null,
          item_id: granted?.item_id ?? null,
          event_id: granted?.event_id ?? null,
          quantity: target ? Number(body.quantity) : null,
        }
      }
      if (method === 'merge_item_definitions') {
        if (!dm) return new Error('Forbidden')
        const source = definitions.find((d) => d.id === body.source_definition)
        const target = definitions.find((d) => d.id === body.target_definition)
        if (!source || !target || source.archived || target.archived)
          return new Error('Item unavailable')
        if (source.revision !== body.source_revision || target.revision !== body.target_revision)
          return new Error('Stale revision')
        const moved = stacks.filter((s) => s.definition_id === source.id && s.quantity > 0)
        for (const row of moved) {
          row.definition_id = target.id
          row.revision += 1
        }
        source.archived = true
        source.revision += 1
        return {
          source_id: source.id,
          target_id: target.id,
          source_revision: source.revision,
          target_revision: target.revision,
          moved_stacks: moved.length,
          merged_stacks: 0,
          unequipped_stacks: 0,
          moved_units: moved.reduce((n, s) => n + s.quantity, 0),
          characters: new Set(moved.map((s) => s.character_id)).size,
          repointed_listings: 0,
          archived_listings: 0,
          repointed_order_lines: 0,
        }
      }
      if (method === 'archive_item_definition') {
        const item = definitions.find((d) => d.id === body.target_definition)
        if (!dm || !item) return new Error('Forbidden')
        if (item.revision !== body.expected_revision) return new Error('Stale revision')
        item.archived = true
        item.revision += 1
        return { id: item.id, revision: item.revision, archived_listings: 0 }
      }
      if (method === 'list_loot_batches') return dm ? lootBatches : new Error('Forbidden')
      if (method === 'delete_loot_batch') {
        if (!dm) return new Error('Forbidden')
        const index = lootBatches.findIndex((batch) => batch.id === body.target_batch)
        if (index < 0) return new Error('Batch unavailable')
        const [removed] = lootBatches.splice(index, 1)
        return { id: removed!.id }
      }
      if (method === 'distribute_loot') {
        if (!dm) return new Error('Forbidden')
        const key = String(body.request_id)
        if (lootReceipts.has(key)) return lootReceipts.get(key)
        const allocations = body.allocations as LootLine[]
        if (
          allocations.some(
            (a) =>
              !characterIds.includes(a.character_id) ||
              !definitions.some(
                (d) => d.id === a.definition_id && d.revision === a.revision && !d.archived,
              ),
          )
        )
          return new Error('Stale revision')
        const batch = body.batch_name
          ? { id: crypto.randomUUID(), name: String(body.batch_name), allocations }
          : null
        if (batch && lootBatches.some((b) => b.name === batch.name))
          return new Error('Batch name in use')
        if (batch) lootBatches.push(batch)
        for (const line of allocations) {
          const existing = stacks.find(
            (row) =>
              row.character_id === line.character_id &&
              row.definition_id === line.definition_id &&
              row.source === 'dm' &&
              !row.equipped_slot,
          )
          const row = existing ?? stack(line.character_id, line.definition_id, line.quantity)
          if (existing) {
            row.quantity += line.quantity
            row.revision += 1
          }
          row.source = 'dm'
          record(row, actor, 'grant', line.quantity)
        }
        const result = { allocations, batch_id: batch?.id ?? null }
        lootReceipts.set(key, result)
        return result
      }
      if (method === 'grant_item') {
        const source = dm ? 'dm' : 'player'
        // RYT-105 release: Players add only basic catalogue items to themselves.
        const granted = definitions.find((d) => d.id === body.target_definition)
        if (!dm && !granted?.basic_key) return new Error('Forbidden')
        let row = stacks.find(
          (s) =>
            s.character_id === body.target_character &&
            s.definition_id === body.target_definition &&
            s.source === source &&
            !s.equipped_slot,
        )
        if (row) {
          row.quantity += Number(body.amount)
          row.revision += 1
        } else {
          row = stack(
            String(body.target_character),
            String(body.target_definition),
            Number(body.amount),
          )
          row.source = source
        }
        return record(row, actor, 'grant', Number(body.amount))
      }
      const row = stacks.find((s) => s.id === body.target_item)
      if (method === 'use_item' || method === 'remove_item') {
        if (!row || row.revision !== body.expected_revision) return new Error('Stale revision')
        if (row.quantity < Number(body.amount)) return new Error('Insufficient quantity')
        row.quantity -= Number(body.amount)
        if (row.quantity === 0) row.equipped_slot = null
        row.revision += 1
        const result = record(
          row,
          actor,
          method === 'use_item' ? 'use' : 'remove',
          -Number(body.amount),
        )
        // RYT-104: consumables from the DM or a shop add rations and water once per use.
        const used = definitions.find((d) => d.id === row.definition_id)
        const props = (used?.properties ?? {}) as { rations?: number; water?: number }
        if (
          method === 'use_item' &&
          used?.category === 'consumable' &&
          row.source !== 'player' &&
          (props.rations || props.water)
        ) {
          const added = supplies(
            row.character_id,
            Math.floor(Number(body.amount) * (props.rations ?? 0)),
            Math.floor(Number(body.amount) * (props.water ?? 0)),
          )
          if (added) {
            events[0]!.after_value.supplies = added
            return { ...result, supplies: added }
          }
        }
        return result
      }
      if (method === 'equip_item') {
        if (!row || row.revision !== body.expected_revision) return new Error('Stale revision')
        if (
          stacks.some(
            (s) => s.character_id === row.character_id && s.equipped_slot === body.target_slot,
          )
        )
          return new Error('Slot occupied')
        let target = row
        if (row.quantity > 1) {
          row.quantity -= 1
          row.revision += 1
          target = stack(row.character_id, row.definition_id, 1)
        }
        target.equipped_slot = String(body.target_slot)
        target.revision += 1
        return record(target, actor, 'equip', 0)
      }
      if (method === 'unequip_item') {
        if (!row || row.revision !== body.expected_revision) return new Error('Stale revision')
        row.equipped_slot = null
        row.revision += 1
        return record(row, actor, 'unequip', 0)
      }
      if (method === 'undo_inventory_event') {
        const original = events.find((e) => e.id === body.target_event)
        const target = original && stacks.find((s) => s.id === original.item_id)
        if (!original || !target || original.undone_by) return new Error('Not undoable')
        if (target.revision !== original.after_value.revision) return new Error('Undo conflict')
        target.quantity -= original.quantity_delta
        target.revision += 1
        const result = record(target, actor, 'undo', -original.quantity_delta, original.id)
        original.undone_by = result.event_id
        const given = original.after_value.supplies as
          { rations: number; water: number } | undefined
        if (given) {
          const taken = supplies(target.character_id, -given.rations, -given.water)
          if (taken) return { ...result, supplies: taken }
        }
        return result
      }
      return undefined
    },
  }
}
