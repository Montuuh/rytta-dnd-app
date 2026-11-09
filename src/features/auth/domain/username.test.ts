import { describe, expect, it } from 'vitest'
import { suggestUsername, usernameProblem } from './username'

describe('RYT-078 username rules', () => {
  it('accepts 3–24 letters, digits and underscore, and refuses reserved names', () => {
    expect(usernameProblem('Pia_the_Bold')).toBeNull()
    expect(usernameProblem(' Arin ')).toBeNull()
    expect(usernameProblem('ab')).toBe('length')
    expect(usernameProblem('a'.repeat(25))).toBe('length')
    expect(usernameProblem('with space')).toBe('characters')
    expect(usernameProblem('Peña')).toBe('characters')
    expect(usernameProblem('DM')).toBe('length')
    expect(usernameProblem('Admin')).toBe('reserved')
  })
  it('suggests a valid name from the email', () => {
    expect(suggestUsername('maria.peña@example.com')).toBe('maria_pena')
    expect(suggestUsername('jo@example.com')).toBe('jo_player')
    expect(suggestUsername('admin@example.com')).toBe('admin_1')
    expect(usernameProblem(suggestUsername('a.very.long.email.local.part.here@x.io'))).toBeNull()
  })
})
