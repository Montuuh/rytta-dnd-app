import { describe, expect, it } from 'vitest'
import {
  checkDue,
  checkIntervalMs,
  fetchPublishedBuild,
  isNewerBuild,
  parseVersion,
  versionUrl,
} from './app-version'

const reply = (body: unknown, ok = true) =>
  (() => Promise.resolve({ ok, json: () => Promise.resolve(body) })) as unknown as typeof fetch

describe('app version', () => {
  it('builds a cache-busting URL under the deployed subpath', () => {
    expect(versionUrl('/rytta-dnd-app/', 5)).toBe('/rytta-dnd-app/version.json?t=5')
    expect(versionUrl('/rytta-dnd-app', 5)).toBe('/rytta-dnd-app/version.json?t=5')
  })
  it('accepts only a short string id', () => {
    expect(parseVersion({ id: 'abc', builtAt: 'x' })).toBe('abc')
    for (const body of [null, 'abc', {}, { id: 3 }, { id: '' }, { id: 'x'.repeat(65) }])
      expect(parseVersion(body)).toBeNull()
  })
  it('flags a different published id and stays quiet for an unknown one', () => {
    expect(isNewerBuild('a', 'b')).toBe(true)
    expect(isNewerBuild('a', 'a')).toBe(false)
    expect(isNewerBuild('a', null)).toBe(false)
  })
  it('checks at most every 15 minutes', () => {
    expect(checkDue(null, 1)).toBe(true)
    expect(checkDue(1000, 1000 + checkIntervalMs - 1)).toBe(false)
    expect(checkDue(1000, 1000 + checkIntervalMs)).toBe(true)
    expect(checkDue(5000, 1000)).toBe(true)
  })
  it('reads the published id and treats failures as unknown', async () => {
    expect(await fetchPublishedBuild('/', 1, reply({ id: 'n1' }))).toBe('n1')
    expect(await fetchPublishedBuild('/', 1, reply({ id: 'n1' }, false))).toBeNull()
    const failing = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    expect(await fetchPublishedBuild('/', 1, failing)).toBeNull()
  })
})
