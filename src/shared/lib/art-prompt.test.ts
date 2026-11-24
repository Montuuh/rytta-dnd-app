import { describe, expect, it } from 'vitest'
import queue from '../../../art/queue/requests.json'
import { artDirection, artPrompt, itemStyle, type ArtKind } from './art-prompt'

const kinds: ArtKind[] = ['character', 'creature', 'item', 'shop', 'card', 'map']
const noBorrowing = 'Not in the style of any named artist, studio, game or existing work.'

describe('art prompts (RYT-154)', () => {
  it('fills the subject with the name as written and the traits on screen', () => {
    expect(
      artPrompt({ kind: 'item', name: '  Espada  del alba ', traits: ['weapon', 'very_rare'] }),
    ).toContain('Item icon: "Espada del alba" (weapon, very rare). Bold simple silhouette')
    expect(
      artPrompt({ kind: 'creature', name: 'Lobo', traits: ['beast', null, '', false] }),
    ).toMatch(/^Creature portrait .*: "Lobo", beast\.\n/)
  })

  it('states the size, aspect ratio and background each picker keeps', () => {
    expect(artPrompt({ kind: 'character', name: 'Brynja' })).toContain(
      'Square 1:1, 1024×1024 px, plain dark umber background (#140F0B)',
    )
    expect(artPrompt({ kind: 'creature', name: 'Wolf' })).toContain('Square 1:1, 1024×1024 px')
    expect(artPrompt({ kind: 'item', name: 'Rope' })).toContain('square (1:1) image, 1024×1024 px')
    expect(artPrompt({ kind: 'item', name: 'Rope' })).toContain('umber background (#140F0B)')
    expect(artPrompt({ kind: 'shop', name: 'Forge' })).toContain('16:9, 1920×1080 px')
    expect(artPrompt({ kind: 'shop', name: 'Forge' })).toContain('3:1')
    expect(artPrompt({ kind: 'card', name: 'The letter' })).toContain('16:9, 1920×1080 px')
    expect(artPrompt({ kind: 'map', name: 'Crypt' })).toContain('top-down')
  })

  it('ends every prompt with what never appears and keeps it free of names of works', () => {
    for (const kind of kinds) {
      const prompt = artPrompt({ kind, name: 'X' })
      expect(prompt.endsWith(noBorrowing)).toBe(true)
      expect(prompt).toMatch(/No text/)
      expect(prompt.split('\n')).toHaveLength(3)
      if (kind !== 'item') expect(prompt.endsWith(artDirection)).toBe(true)
    }
  })

  it('paints an item like the item pictures of the image queue', () => {
    expect(artPrompt({ kind: 'item', name: 'Rope', traits: ['gear'] }).split('\n')).toEqual([
      'Create a square (1:1) image, 1024×1024 px. Item icon: "Rope" (gear). Bold simple silhouette that reads clearly at thumbnail size.',
      itemStyle,
      noBorrowing,
    ])
    const batches = queue.batches.filter((batch) => /^(basic-items|srd-magic)-/.test(batch.id))
    expect(batches.length).toBeGreaterThan(0)
    for (const batch of batches) expect(batch.style).toBe(itemStyle)
    const request = queue.requests.find((item) => item.batch === batches[0]!.id)!
    expect(request.prompt.startsWith('Create a square (1:1) image. Item icon: ')).toBe(true)
    expect(
      request.prompt.endsWith('. Bold simple silhouette that reads clearly at thumbnail size.'),
    ).toBe(true)
  })

  it('adds what the user wrote about an item, on one line and cut at a word', () => {
    const short = artPrompt({
      kind: 'item',
      name: 'Farol',
      details: ' Un farol de latón\ncon cristal "verde". +1 a Percepción. ',
    })
    expect(short.split('\n')[1]).toBe(
      `Its description, only for what it looks like (ignore rules and numbers): "Un farol de latón con cristal 'verde'. +1 a Percepción."`,
    )
    const long = artPrompt({ kind: 'item', name: 'Farol', details: 'palabra '.repeat(80) })
    const line = long.split('\n')[1]!
    expect(line.endsWith('palabra…"')).toBe(true)
    expect(line.length).toBeLessThan(400)
    expect(artPrompt({ kind: 'item', name: 'Farol', details: '  ' }).split('\n')).toHaveLength(3)
    // A word that ends exactly at the limit is kept whole.
    const exact = artPrompt({ kind: 'item', name: 'Farol', details: `${'a'.repeat(300)} resto` })
    expect(exact.split('\n')[1]!.endsWith(`${'a'.repeat(300)}…"`)).toBe(true)
  })

  it('keeps quotes typed in a name from closing the quoted name', () => {
    expect(artPrompt({ kind: 'item', name: 'La "Dama" Gris', traits: ['gear'] })).toContain(
      `Item icon: "La 'Dama' Gris" (gear).`,
    )
    expect(artPrompt({ kind: 'creature', name: 'El "Viejo"' })).toContain(`: "El 'Viejo'".`)
  })

  it('works without a name', () => {
    expect(artPrompt({ kind: 'map', name: ' ' })).toMatch(
      /^Battle map for a tabletop role-playing game\.\n/,
    )
    expect(artPrompt({ kind: 'item', name: ' ' })).toContain('Item icon: one object.')
  })
})
