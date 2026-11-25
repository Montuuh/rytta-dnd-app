import { describe, expect, it } from 'vitest'
import { draftIssue } from './item'

describe('draftIssue', () => {
  it('passes a named draft', () => {
    expect(draftIssue({ name: 'Anillo', properties: {} })).toBeNull()
    expect(draftIssue({ name: 'Espada', properties: { dice: '1d8' } })).toBeNull()
  })

  it('names what stops a draft: no name, or damage dice that are not NdM', () => {
    expect(draftIssue({ name: '', properties: {} })).toBe('name')
    expect(draftIssue({ name: '   ', properties: {} })).toBe('name')
    expect(draftIssue({ name: 'Espada', properties: { dice: '1d' } })).toBe('dice')
    expect(draftIssue({ name: 'Espada', properties: { dice: 'd8' } })).toBe('dice')
  })
})
