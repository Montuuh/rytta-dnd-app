import { describe, expect, it, vi } from 'vitest'
import type { AppSupabaseClient } from '@/shared/api/database.types'
import { CampaignSettingsError } from '../domain/settings'
import { createCampaignSettingsRepository } from './settings-repository'

// RYT-130 / RYT-133: the adapter validates before calling, maps server errors to reasons and
// parses what comes back.
const campaign = '00000000-0000-4000-8000-000000000001'
const character = '00000000-0000-4000-8000-000000000002'
const user = '00000000-0000-4000-8000-000000000003'
const request = '00000000-0000-4000-8000-000000000004'
type Reply = { data?: unknown; error?: { message: string } | null }

function fakeClient(reply: Reply) {
  const result = () => Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null })
  const rpc = vi.fn(() => result())
  const steps: unknown[][] = []
  const builder: Record<string, unknown> = {}
  for (const step of ['select', 'eq', 'lt', 'order', 'limit', 'abortSignal'])
    builder[step] = (...args: unknown[]) => {
      steps.push([step, ...args])
      return builder
    }
  builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    result().then(resolve, reject)
  const from = vi.fn(() => builder)
  return { client: { rpc, from } as unknown as AppSupabaseClient, rpc, from, steps }
}
const roll = {
  id: request,
  campaign_id: campaign,
  character_id: character,
  roller_id: user,
  label: 'Attack',
  expression: '2d20kh1+5',
  dice: [3, 17],
  total: 22,
  kind: 'attack',
  source: 'recorded',
  visibility: 'roller_dm',
  created_at: '2026-11-17T10:00:00.000+00:00',
}

describe('campaign settings repository', () => {
  it('sets and clears the party level', async () => {
    const { client, rpc } = fakeClient({ data: 4 })
    expect(await createCampaignSettingsRepository(client).setPartyLevel(campaign, 4, request)).toBe(
      4,
    )
    expect(rpc).toHaveBeenCalledWith('set_party_level', {
      target_campaign: campaign,
      new_level: 4,
      request_id: request,
    })
    const cleared = fakeClient({ data: null })
    expect(
      await createCampaignSettingsRepository(cleared.client).setPartyLevel(campaign, null, request),
    ).toBeNull()
  })

  it('refuses invalid input before calling the server', async () => {
    const { client, rpc } = fakeClient({ data: 4 })
    const repo = createCampaignSettingsRepository(client)
    await expect(repo.setPartyLevel(campaign, 21, request)).rejects.toThrow()
    await expect(
      repo.setDiceSettings(
        campaign,
        { dice_mode: 'dice' as never, roll_visibility: 'table' },
        request,
      ),
    ).rejects.toThrow()
    await expect(
      repo.logRoll({
        campaignId: campaign,
        characterId: character,
        label: 'x',
        expression: 'd7',
        kind: 'attack',
        source: 'app',
        requestId: request,
      }),
    ).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps server errors to typed reasons', async () => {
    for (const [message, reason] of [
      ['Encounter locked', 'encounter-locked'],
      ['Above party level', 'above-party-level'],
      ['Stale revision', 'stale'],
      ['Roll limit', 'roll-limit'],
      ['Dice mode', 'dice-mode'],
      ['Forbidden', 'forbidden'],
      ['boom', 'unavailable'],
    ] as const) {
      const { client } = fakeClient({ error: { message } })
      const failure = createCampaignSettingsRepository(client).applyLevelUp({
        campaignId: campaign,
        characterId: character,
        expectedRevision: 3,
        level: 2,
        maxHp: 20,
        build: { classKey: 'fighter' },
        requestId: request,
      })
      await expect(failure).rejects.toBeInstanceOf(CampaignSettingsError)
      await expect(failure).rejects.toMatchObject({ reason })
    }
  })

  it('sends app rolls without dice and recorded rolls with them', async () => {
    const app = fakeClient({ data: { ...roll, source: 'app' } })
    await createCampaignSettingsRepository(app.client).logRoll({
      campaignId: campaign,
      characterId: character,
      label: ' Attack ',
      expression: '2d20kh1+5',
      kind: 'attack',
      source: 'app',
      requestId: request,
    })
    expect(app.rpc).toHaveBeenCalledWith(
      'log_roll',
      expect.objectContaining({ roll_label: 'Attack', recorded_dice: null, recorded_total: null }),
    )
    const recorded = fakeClient({ data: roll })
    expect(
      await createCampaignSettingsRepository(recorded.client).logRoll({
        campaignId: campaign,
        characterId: character,
        label: 'Attack',
        expression: '2d20kh1+5',
        kind: 'attack',
        source: 'recorded',
        dice: [3, 17],
        total: 22,
        requestId: request,
      }),
    ).toEqual(roll)
    expect(recorded.rpc).toHaveBeenCalledWith(
      'log_roll',
      expect.objectContaining({ recorded_dice: [3, 17], recorded_total: 22 }),
    )
  })

  it('lists rolls newest first, paged', async () => {
    const { client, from, steps } = fakeClient({ data: [roll] })
    const before = '2026-11-17T11:00:00.000Z'
    expect(
      await createCampaignSettingsRepository(client).listRolls(campaign, { before, limit: 20 }),
    ).toEqual([roll])
    expect(from).toHaveBeenCalledWith('campaign_rolls')
    expect(steps).toContainEqual(['eq', 'campaign_id', campaign])
    expect(steps).toContainEqual(['lt', 'created_at', before])
    expect(steps).toContainEqual(['order', 'created_at', { ascending: false }])
    expect(steps).toContainEqual(['limit', 20])
  })
})
