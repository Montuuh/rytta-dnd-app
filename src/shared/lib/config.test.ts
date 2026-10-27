import { describe, expect, it } from 'vitest'
import { parseConfig } from './env-schema'

describe('app configuration', () => {
  it('runs with no credentials in explicit demo mode', () => {
    expect(
      parseConfig({ VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }).VITE_DATA_MODE,
    ).toBe('demo')
  })
  it('fails closed when Supabase mode is incomplete', () => {
    expect(() => parseConfig({ VITE_DATA_MODE: 'supabase' })).toThrow('Invalid app configuration')
  })
  it('does not disclose secret input in validation errors', () => {
    expect(() => parseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' })).toThrow(
      'Invalid app configuration',
    )
  })
  it('accepts a configured public backend', () => {
    expect(
      parseConfig({
        VITE_DATA_MODE: 'supabase',
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      }).VITE_DATA_MODE,
    ).toBe('supabase')
  })
  it('rejects legacy JWT keys instead of accidentally accepting service-role credentials', () => {
    expect(() =>
      parseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.legacy.signature' }),
    ).toThrow('Invalid app configuration')
  })
})
