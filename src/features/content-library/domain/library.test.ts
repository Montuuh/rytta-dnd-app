import { describe, expect, it } from 'vitest'
import glossaryEn from '../../../../tests/fixtures/srd/glossary/en.json'
import glossaryEs from '../../../../tests/fixtures/srd/glossary/es.json'
import { batches, contentFile, parseContentFile } from './import-file'
import {
  contentCounts,
  coverInput,
  entryName,
  entryProblem,
  formFamily,
  keyFromName,
  libraryErrorCode,
} from './library'
import { blocksToText, textToBlocks } from './text'

// RYT-167: the SRD lives in the library; its glossary bodies are test fixtures here.
describe('RYT-093 content library domain', () => {
  it('checks entries like the server does', () => {
    const ok = { kind: 'spell', key: 'fireball', name_en: 'Fireball', name_es: '', data: {} }
    expect(entryProblem(ok)).toBeNull()
    expect(entryProblem({ ...ok, kind: 'Spell' })).toBe('kind')
    expect(entryProblem({ ...ok, key: 'Fire ball' })).toBe('key')
    expect(entryProblem({ ...ok, name_en: ' ' })).toBe('name')
    expect(entryProblem({ ...ok, data: [] as unknown as Record<string, unknown> })).toBe('data')
    expect(entryProblem({ ...ok, data: { text: 'x'.repeat(140000) } })).toBe('size')
    expect(entryProblem({ ...ok, data: { index: 'level 3' } })).toBe('index')
    expect(entryProblem({ ...ok, data: { index: { notes: 'x'.repeat(5000) } } })).toBe('index')
  })

  it('names keys, entries and errors', () => {
    expect(keyFromName('Círculo de la Luna')).toBe('circulo-de-la-luna')
    expect(keyFromName('  Battle Master!! ')).toBe('battle-master')
    expect(entryName({ name_en: 'Wolf', name_es: '' }, 'es')).toBe('Wolf')
    expect(entryName({ name_en: 'Wolf', name_es: 'Lobo' }, 'es')).toBe('Lobo')
    expect(formFamily('creature')).toBe('creature')
    expect(formFamily('spell')).toBe('glossary')
    expect(formFamily('subclass')).toBe('common')
    expect(libraryErrorCode('Stale revision')).toBe('stale')
    // A code thrown by the data adapter reaches the interface unchanged.
    expect(libraryErrorCode('keyTaken')).toBe('keyTaken')
    expect(libraryErrorCode('slugTaken')).toBe('slugTaken')
    expect(libraryErrorCode('permission denied for function')).toBe('forbidden')
    expect(libraryErrorCode('Failed to fetch')).toBe('network')
  })

  it('reads Rytta content files and reports every refused entry', () => {
    expect(parseContentFile('{')).toBe('notJson')
    expect(parseContentFile('{"entries": []}')).toBe('notContent')
    const file = parseContentFile(
      JSON.stringify({
        format: 'rytta-content',
        version: 1,
        kind: 'spell',
        entries: [
          { key: 'frost-lance', name_es: 'Lanza de escarcha', data: {} },
          { key: 'frost-lance', name_es: 'Otra', data: {} },
          { kind: 'subclass', key: 'moon', name_es: 'Luna', data: { index: { class: 'druid' } } },
          { key: 'Bad', name_en: 'Bad', data: {} },
          'text',
        ],
      }),
    )
    if (typeof file === 'string') throw new Error(file)
    expect(file.total).toBe(5)
    expect(file.groups.map((g) => [g.kind, g.entries.map((e) => e.key)])).toEqual([
      ['spell', ['frost-lance']],
      ['subclass', ['moon']],
    ])
    expect(file.problems.map((p) => [p.position, p.reason])).toEqual([
      [2, 'duplicate'],
      [4, 'key'],
      [5, 'data'],
    ])
    const exported = contentFile('spell', file.groups[0]!.entries)
    const again = parseContentFile(JSON.stringify(exported))
    expect(typeof again === 'string' ? again : again.groups[0]!.entries).toEqual(
      file.groups[0]!.entries,
    )
  })

  it('splits imports into batches the server accepts', () => {
    const many = Array.from({ length: 450 }, (_, i) => ({ key: `k${i}` }))
    expect(batches(many).map((b) => b.length)).toEqual([200, 200, 50])
    const heavy = Array.from({ length: 5 }, () => ({ text: 'x'.repeat(600_000) }))
    expect(batches(heavy).map((b) => b.length)).toEqual([2, 2, 1])
  })

  it('edits glossary text without losing a block of the SRD', () => {
    const bodies = { ...glossaryEn, ...glossaryEs } as Record<string, { blocks: unknown[] }>
    for (const [language, all] of [
      ['en', glossaryEn],
      ['es', glossaryEs],
    ] as const)
      for (const [id, body] of Object.entries(all as Record<string, { blocks: unknown[] }>))
        expect(textToBlocks(blocksToText(body.blocks), body.blocks), `${language} ${id}`).toEqual(
          body.blocks,
        )
    expect(Object.keys(bodies).length).toBeGreaterThan(700)
    const original = [
      { t: 'p', x: 'Intro.' },
      { t: 'table', rows: [['a', 'b']] },
    ]
    expect(
      textToBlocks(
        'Intro.\n\n**Speed 0.** Your Speed is 0.\n\n- one\n- two\n\n[[table:1]]\n\n[[table:9]]',
        original,
      ),
    ).toEqual([
      { t: 'p', x: 'Intro.' },
      { t: 'p', lead: 'Speed 0.', x: 'Your Speed is 0.' },
      { t: 'ul', items: ['one', 'two'] },
      { t: 'table', rows: [['a', 'b']] },
    ])
  })
})

describe('items as library entries (RYT-166)', () => {
  it('refuses an item without its mechanics', () => {
    const entry = {
      kind: 'item',
      key: 'longsword',
      name_en: 'Longsword',
      name_es: 'Espada larga',
      data: { index: { category: 'weapon', slot_kind: 'one_hand', weightLb: 3, costCp: 1500 } },
    }
    expect(entryProblem(entry)).toBeNull()
    expect(entryProblem({ ...entry, data: { index: { weightLb: 3 } } })).toBe('item')
  })

  it('RYT-171 refuses a species, background or feat creation cannot read', () => {
    const entry = (kind: string, index: Record<string, unknown>) => ({
      kind,
      key: 'test',
      name_en: 'Test',
      name_es: 'Prueba',
      data: { index },
    })
    expect(entryProblem(entry('species', { speed: 30 }))).toBeNull()
    expect(entryProblem(entry('species', { speed: 'fast' }))).toBe('origin')
    expect(
      entryProblem(
        entry('species', {
          speed: 30,
          traits: [{ key: 'gift', en: 'Gift', es: 'Don' }],
          choices: [{ trait: 'other', options: [] }],
        }),
      ),
    ).toBe('origin')
    expect(
      entryProblem(
        entry('background', { abilities: ['str', 'dex', 'wis'], skills: ['athletics'] }),
      ),
    ).toBeNull()
    expect(
      entryProblem(
        entry('background', { abilities: ['str', 'str', 'wis'], skills: ['athletics'] }),
      ),
    ).toBe('origin')
    expect(entryProblem(entry('feat', { category: 'general', level: 4 }))).toBeNull()
    expect(entryProblem(entry('feat', {}))).toBe('origin')
  })

  it('RYT-184 keeps the reserved cover entry valid and out of content', () => {
    const image =
      'pre/70000000-0000-4000-8000-000000000001/7a000000-0000-4000-8000-000000000001.webp'
    expect(coverInput(image)).toEqual({
      kind: 'pack',
      key: 'cover',
      name_en: 'Cover',
      name_es: 'Portada',
      data: { index: { image } },
    })
    expect(entryProblem(coverInput(image))).toBeNull()
    expect(entryProblem(coverInput(null))).toBeNull()
    expect(contentCounts({ creature: 3, pack: 1 })).toEqual({ creature: 3 })
    const file = JSON.stringify({
      format: 'rytta-content',
      version: 1,
      kind: 'pack',
      entries: [{ key: 'cover', name_en: 'Cover', data: {} }],
    })
    const parsed = parseContentFile(file)
    expect(typeof parsed === 'string' ? parsed : parsed.problems[0]?.reason).toBe('kind')
  })
})
