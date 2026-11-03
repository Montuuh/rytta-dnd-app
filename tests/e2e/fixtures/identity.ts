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
  let characters =
    options.empty || options.noCharacters
      ? []
      : [
          {
            id: characterId,
            campaign_id: campaignId,
            user_id: options.player || options.linkedPlayer ? playerId : (null as string | null),
            name: 'Arin',
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
        character_resources: { gold, water_units: 9, rations: 8, exhaustion: 0, revision: 0 },
      })
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
  let portraitPath: string | null = null
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
            : { character_id: c.id, campaign_id: c.campaign_id, ...row }
        }),
      )
    }
    if (method === 'save_character_sheet') {
      const row = sheets.get(String(body.target_character))!
      if (row.revision !== body.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
      const completing = row.status === 'draft' && body.mark_complete === true
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
      return respond(row.revision)
    }
    if (method === 'set_character_vitals') {
      const state = vitals.get(String(body.target_character))!
      if (state.revision !== body.expected_revision)
        return respond({ message: 'Stale revision' }, 400)
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
    if (method === 'characters')
      return respond(
        characters
          .filter((c) => c.campaign_id === eq('campaign_id'))
          .filter((c) => !eq('id') || c.id === eq('id'))
          .filter(
            (c) =>
              !url.searchParams.get('user_id') ||
              c.user_id === url.searchParams.get('user_id')?.replace('eq.', ''),
          )
          .map((c) =>
            url.searchParams.get('select')?.includes('character_resources')
              ? { ...c, character_resources: [c.character_resources] }
              : { id: c.id, name: c.name, user_id: c.user_id },
          ),
      )
    if (method === 'create_character') {
      const id = '40000000-0000-4000-8000-' + String(characters.length + 2).padStart(12, '0')
      const name = String(body.character_name)
      const targetCampaign = String(body.target_campaign)
      characters.push({
        id,
        campaign_id: targetCampaign,
        user_id: null,
        name,
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
      characters = characters.map((c) =>
        c.id === body.target_character ? { ...c, user_id: String(body.target_user) } : c,
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
        c.id === body.target_character ? { ...c, user_id: null } : c,
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
          .filter((c) => c.campaign_id === body.target_campaign)
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
          c.user_id === body.target_user ? { ...c, user_id: null } : c,
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
    return respond({ message: 'Unhandled test route' }, 500)
  })
  return {
    calls,
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
