import type { Page } from '@playwright/test'
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
  } = {},
) {
  const currentId = options.as ?? (options.player ? playerId : dmId)
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
        },
        {
          id: otherCampaignId,
          name: 'Winter at the Keep',
          description: '',
          created_at: '2026-10-26T00:00:00Z',
          role: 'player',
          player_modules: ['party'],
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
  ) =>
    history.push({
      id: crypto.randomUUID(),
      at: new Date(Date.now() + history.length).toISOString(),
      kind,
      actor_id: currentId,
      character,
      changes,
    })
  const sheets = new Map<string, SheetRow>(
    characters.map((c) => [c.id, options.sheet === 'complete' ? sampleSheet() : blankSheet()]),
  )
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
          ...(kind === 'long' ? { death_successes: 0, death_failures: 0 } : {}),
        })
      },
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
            actor !== currentId
              ? campaigns.map((c) => ({
                  ...c,
                  role:
                    c.id === campaignId
                      ? (members.find((m) => m.user_id === actor)?.role ?? 'player')
                      : 'dm',
                }))
              : campaigns,
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
        })
      pending = []
      return respond(target.campaign_id)
    }
    const eq = (name: string) => url.searchParams.get(name)?.replace('eq.', '')
    if (url.pathname.includes('/storage/v1/object/sign/'))
      return respond({ signedURL: '/object/public-test/portrait.png?token=fixture' })
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
            .map(() => ({
              level: 5,
              armor_class: options.armorClassOverride,
              portrait_path: portraitPath,
              str: '14',
              dex: '16',
              str_bonus: '0',
              dex_bonus: '0',
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
      const quiet = ['id', 'campaign_id', 'character_id', 'revision', 'user_id', 'created_at']
      const audited = characterEvents
        .filter((e) => e.character_id === body.target_character && e.kind.endsWith(':UPDATE'))
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
    if (method === 'set_character_vitals') {
      const state = vitals.get(String(body.target_character))!
      // staleVitals(): the next write meets another device's change, whatever refetch ran since.
      if (nextVitalsStale) {
        nextVitalsStale = false
        return respond({ message: 'Stale revision' }, 400)
      }
      if (state.revision !== body.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
      const dm = members.find((m) => m.user_id === actor)?.role === 'dm'
      if (
        options.inEncounter &&
        !dm &&
        (body.new_current_hp !== state.current_hp || body.new_temp_hp !== state.temp_hp)
      )
        return respond({ message: 'Encounter locked' }, 400)
      if (body.new_current_hp !== state.current_hp)
        record(String(body.target_character), 'character_vitals:UPDATE', [
          { field: 'current_hp', before: state.current_hp, after: body.new_current_hp },
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
        revision: state.revision + 1,
      })
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
      return respond(
        characters
          .filter((c) => c.campaign_id === body.target_campaign && c.is_active)
          .filter(
            (c) =>
              dm || c.user_id === actor || (c.user_id !== null && sharesLive.get(c.id) !== false),
          )
          .map((c) => {
            const sheet = sheets.get(c.id)
            const state = vitals.get(c.id)
            return {
              id: c.id,
              name: c.name,
              is_own: c.user_id === actor,
              is_assigned: c.user_id !== null,
              shares_live: sharesLive.get(c.id) !== false,
              sheet_status: sheet?.status ?? null,
              class_key: (sheet?.build.classKey as string | undefined) ?? null,
              class_label: (sheet?.build.classLabel as string | undefined) ?? null,
              level: sheet?.level ?? null,
              current_hp: (state?.current_hp as number | undefined) ?? null,
              max_hp: sheet?.max_hp ?? null,
              temp_hp: (state?.temp_hp as number | undefined) ?? null,
              armor_class: sheet?.armor_class ?? null,
              exhaustion: c.character_resources.exhaustion,
              conditions: (state?.conditions as string[] | undefined) ?? [],
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
      if (!body.new_role) {
        characters = characters.map((c) =>
          c.user_id === body.target_user ? { ...c, user_id: null, is_active: true } : c,
        )
      }
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
        gold: Number.MAX_SAFE_INTEGER,
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
    staleVitals: () => {
      vitals.get(characterId)!.revision += 1
      nextVitalsStale = true
    },
    staleResources: () => {
      characters[0]!.character_resources.revision += 1
      characters[0]!.character_resources.gold = 70
    },
    failCampaigns: () => {
      failList = true
    },
    revokeAccess: () => {
      campaigns = []
    },
  }
}

/** A complete level 5 bard used to render the sheet without walking the wizard. */
export function sampleSheet() {
  return {
    status: 'complete',
    level: 5,
    max_hp: 38,
    armor_class: 14,
    revision: 3,
    build: {
      classKey: 'bard',
      classLabel: 'Bardo',
      subclass: 'Colegio del Saber',
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
function inventoryState(characterIds: string[], seeded: boolean) {
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
    ...partial,
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
  return {
    stacks,
    definitions,
    events,
    handle(
      method: string,
      body: Record<string, unknown>,
      eq: (name: string) => string | undefined,
      dm: boolean,
    ) {
      const actor = dm ? dmId : playerId
      if (method === 'item_definitions') return definitions
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
        if (!dm && item.value_gp !== null && item.value_gp !== undefined)
          return new Error('Forbidden')
        const existing = definitions.find((d) => d.id === body.target_definition)
        if (existing) {
          Object.assign(existing, item, { revision: existing.revision + 1 })
          return { id: existing.id }
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
      if (method === 'grant_item') {
        const source = dm ? 'dm' : 'player'
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
        return record(row, actor, method === 'use_item' ? 'use' : 'remove', -Number(body.amount))
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
        return result
      }
      return undefined
    },
  }
}
