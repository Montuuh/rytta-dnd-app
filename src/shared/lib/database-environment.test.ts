import { describe, expect, it } from 'vitest'
import { databaseSchema } from './database-environment'
describe('database environment isolation', () => {
  it('pins development and loopback preview to PRE', () => {
    for (const hostname of ['localhost', 'LOCALHOST', '127.0.0.1', '::1', '[::1]'])
      expect(databaseSchema({ development: false, hostname })).toBe('pre')
    expect(databaseSchema({ development: true, hostname: '192.168.1.5' })).toBe('pre')
  })
  it('keeps production hosts on public without suffix or prefix matching', () => {
    for (const hostname of [
      'montuuh.github.io',
      'rytta.example.com',
      'localhost.example.com',
      'notlocalhost',
    ])
      expect(databaseSchema({ development: false, hostname })).toBe('public')
  })
})
