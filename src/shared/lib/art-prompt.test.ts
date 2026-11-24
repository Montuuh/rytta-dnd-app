import { describe, expect, it } from 'vitest'
import { artDirection, artPrompt, type ArtKind } from './art-prompt'

const kinds: ArtKind[] = ['character', 'creature', 'item', 'shop', 'card', 'map']

describe('art prompts (RYT-154)', () => {
  it('fills the subject with the name as written and the traits on screen', () => {
    expect(
      artPrompt({ kind: 'item', name: '  Espada  del alba ', traits: ['weapon', 'very_rare'] }),
    ).toMatch(
      /^Item illustration for a tabletop role-playing game: "Espada del alba", weapon, very rare\.\n/,
    )
    expect(
      artPrompt({ kind: 'creature', name: 'Lobo', traits: ['beast', null, '', false] }),
    ).toMatch(/^Creature portrait .*: "Lobo", beast\.\n/)
  })

  it('states the size, aspect ratio and background each picker keeps', () => {
    expect(artPrompt({ kind: 'character', name: 'Brynja' })).toContain(
      'Square 1:1, 1024×1024 px, plain dark umber background (#140F0B)',
    )
    expect(artPrompt({ kind: 'creature', name: 'Wolf' })).toContain('Square 1:1, 1024×1024 px')
    expect(artPrompt({ kind: 'item', name: 'Rope' })).toContain('Square 1:1, 1024×1024 px')
    expect(artPrompt({ kind: 'shop', name: 'Forge' })).toContain('16:9, 1920×1080 px')
    expect(artPrompt({ kind: 'shop', name: 'Forge' })).toContain('3:1')
    expect(artPrompt({ kind: 'card', name: 'The letter' })).toContain('16:9, 1920×1080 px')
    expect(artPrompt({ kind: 'map', name: 'Crypt' })).toContain('top-down')
  })

  it('ends every prompt with the one art direction and keeps it free of names of works', () => {
    for (const kind of kinds) {
      const prompt = artPrompt({ kind, name: 'X' })
      expect(prompt.endsWith(artDirection)).toBe(true)
      expect(prompt.split('\n')).toHaveLength(3)
    }
    expect(artDirection).toMatch(/No text/)
    expect(artDirection).toMatch(/Not in the style of any named artist/)
  })

  it('works without a name', () => {
    expect(artPrompt({ kind: 'map', name: ' ' })).toMatch(
      /^Battle map for a tabletop role-playing game\.\n/,
    )
  })
})
