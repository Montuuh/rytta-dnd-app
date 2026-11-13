import { describe, expect, it } from 'vitest'
import { monsterBodiesQuery, monsterIndexQuery } from '@/features/bestiary'
import { glossaryBodiesQuery, glossaryIndexQuery } from '@/features/glossary'
import { batches, contentFile, parseContentFile } from './import-file'
import { entryName, entryProblem, formFamily, keyFromName, libraryErrorCode } from './library'
import { srdEntries, type BundledSrd } from './srd'
import { blocksToText, textToBlocks } from './text'

// The bundled SRD, loaded through the other features' public queries.
const load = <T>(query: { queryFn?: unknown }) => (query.queryFn as () => Promise<T>)()
const monsterIndex = await load(monsterIndexQuery())
const monstersEn = await load(monsterBodiesQuery('en'))
const monstersEs = await load(monsterBodiesQuery('es'))
const glossaryIndex = await load(glossaryIndexQuery())
const glossaryEn = await load<Record<string, { blocks: unknown[] }>>(glossaryBodiesQuery('en'))
const glossaryEs = await load<Record<string, { blocks: unknown[] }>>(glossaryBodiesQuery('es'))

const srd = {
  monsters: monsterIndex,
  bodies: { en: monstersEn, es: monstersEs },
  glossary: glossaryIndex,
  glossaryBodies: { en: glossaryEn, es: glossaryEs },
} as unknown as BundledSrd

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

  it('turns the bundled SRD 5.2.1 into valid entries of every kind', () => {
    const groups = srdEntries(srd)
    const count = (kind: string) => groups.find((g) => g.kind === kind)?.entries.length ?? 0
    expect(count('creature')).toBe(330)
    expect(count('creature-trait')).toBe(48)
    expect(count('table')).toBe(1)
    expect(groups.reduce((sum, g) => sum + g.entries.length, 0)).toBe(330 + 48 + 1 + 782)
    for (const group of groups)
      for (const entry of group.entries) {
        expect(entryProblem(entry), `${entry.kind}:${entry.key}`).toBeNull()
        expect(entry.kind).toBe(group.kind)
      }
    const wolf = groups[0]!.entries.find((e) => e.key === 'wolf')!
    expect(wolf).toMatchObject({ name_en: 'Wolf', name_es: 'Lobo' })
    expect(Object.keys(wolf.data)).toEqual(['index', 'en', 'es'])
    const grappled = groups
      .find((g) => g.kind === 'condition')!
      .entries.find((e) => e.key === 'grappled')!
    expect(grappled.data.en).toBe((glossaryEn as Record<string, unknown>)['condition.grappled'])
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
