import { describe, expect, it } from 'vitest'
import { createSubmitGuard } from './submit-guard'

describe('submit guard', () => {
  const ids = () => {
    let n = 0
    return () => `id-${++n}`
  }
  it('runs a write once when two clicks land in the same tick', async () => {
    const guard = createSubmitGuard(ids())
    let calls = 0
    const task = async () => {
      calls += 1
      await Promise.resolve()
      return 'ok'
    }
    const [first, second] = await Promise.all([guard.run(task), guard.run(task)])
    expect(calls).toBe(1)
    expect([first, second]).toEqual(['ok', undefined])
    // Released afterwards, also after a failure.
    await expect(guard.run(() => Promise.reject(new Error('x')))).rejects.toThrow('x')
    expect(await guard.run(task)).toBe('ok')
  })
  it('reuses the request id of a payload until it succeeds', () => {
    const guard = createSubmitGuard(ids())
    const first = guard.idFor('draft-a')
    expect(guard.idFor('draft-a')).toBe(first)
    expect(guard.idFor('draft-b')).not.toBe(first)
    guard.done('draft-a')
    expect(guard.idFor('draft-a')).not.toBe(first)
  })
})
