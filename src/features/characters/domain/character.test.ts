import { describe, expect, it } from 'vitest'
import { characterSchema } from './character'
const resource = { gold: 50, water_units: 2, rations: 3, exhaustion: 12, revision: 1 }
const row = {
  id: '10000000-0000-4000-8000-000000000001',
  campaign_id: '20000000-0000-4000-8000-000000000001',
  user_id: null,
  name: 'Arin',
  character_resources: [resource],
}
describe('PostgREST character boundary', () => {
  it('normalizes the composite-FK array relation into one resource record', () => {
    expect(characterSchema.parse(row).character_resources).toEqual(resource)
  })
  it('fails closed on missing, duplicate or incorrectly shaped resource relations', () => {
    for (const relation of [[], [resource, resource], resource, null])
      expect(characterSchema.safeParse({ ...row, character_resources: relation }).success).toBe(
        false,
      )
  })
  it('rejects unsafe external balances and retains manual homebrew exhaustion above six', () => {
    expect(characterSchema.parse(row).character_resources.exhaustion).toBe(12)
    for (const gold of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(
        characterSchema.safeParse({ ...row, character_resources: [{ ...resource, gold }] }).success,
      ).toBe(false)
  })
})
