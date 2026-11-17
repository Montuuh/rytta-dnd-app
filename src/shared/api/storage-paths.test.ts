import { describe, expect, it } from 'vitest'
import { ownsStoragePath } from './storage-paths'

const campaign = '11111111-1111-4111-8111-111111111111'
const entity = '22222222-2222-4222-8222-222222222222'

describe('ownsStoragePath', () => {
  it('accepts a path in the active environment, campaign and entity', () => {
    expect(ownsStoragePath(`pre/${campaign}/${entity}/a.webp`, 'pre', campaign, entity)).toBe(true)
    expect(ownsStoragePath(`public/${campaign}/${entity}/a.webp`, 'public', campaign, entity)).toBe(
      true,
    )
  })

  it('refuses a production path while running in PRE, and the reverse', () => {
    expect(ownsStoragePath(`public/${campaign}/${entity}/a.webp`, 'pre', campaign, entity)).toBe(
      false,
    )
    expect(ownsStoragePath(`pre/${campaign}/${entity}/a.webp`, 'public', campaign, entity)).toBe(
      false,
    )
  })

  it('refuses another campaign, another entity and prefix look-alikes', () => {
    expect(ownsStoragePath(`pre/${entity}/${entity}/a.webp`, 'pre', campaign, entity)).toBe(false)
    expect(ownsStoragePath(`pre/${campaign}/${campaign}/a.webp`, 'pre', campaign, entity)).toBe(
      false,
    )
    expect(ownsStoragePath(`pre/${campaign}/${entity}x/a.webp`, 'pre', campaign, entity)).toBe(
      false,
    )
    expect(ownsStoragePath(`prefix/${campaign}/${entity}/a.webp`, 'pre', campaign, entity)).toBe(
      false,
    )
  })

  it('refuses when the scope is incomplete', () => {
    expect(ownsStoragePath(`pre/${campaign}/a.webp`, 'pre')).toBe(false)
    expect(ownsStoragePath(`pre/${campaign}/a.webp`, '', campaign)).toBe(false)
    expect(ownsStoragePath(`pre//a.webp`, 'pre', '')).toBe(false)
  })
})
