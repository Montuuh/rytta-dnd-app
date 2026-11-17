import { beforeEach, describe, expect, it, vi } from 'vitest'

// RYT-114: item pictures are signed in one batched Storage call; the catalogue is read in pages.
const createSignedUrls = vi.fn()
const pages: unknown[][] = []
const ranges: [number, number][] = []
const referenced: unknown[] = []
const removed: string[][] = []

function definitionsQuery() {
  const filters: Record<string, unknown> = {}
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => ((filters[column] = value), query),
    order: () => query,
    abortSignal: () => query,
    limit: () => Promise.resolve({ data: filters.image_path ? referenced : [], error: null }),
    range: (from: number, to: number) => {
      ranges.push([from, to])
      return Promise.resolve({ data: pages.shift() ?? [], error: null })
    },
  }
  return query
}

vi.mock('@/shared/lib/config', () => ({
  config: {
    VITE_DATA_MODE: 'supabase',
    VITE_SUPABASE_URL: 'https://x',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'k',
  },
}))
vi.mock('@/shared/api/supabase', () => ({
  activeSchema: () => 'pre',
  getSupabase: () => ({
    from: () => definitionsQuery(),
    storage: {
      from: () => ({
        createSignedUrls,
        remove: (paths: string[]) => (removed.push(paths), Promise.resolve({ error: null })),
      }),
    },
  }),
}))

const repository = await import('./repository')
const campaign = '00000000-0000-4000-8000-000000000001'
const definition = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  campaign_id: campaign,
  name: `Item ${n}`,
  category: 'gear',
  icon: 'package',
  rarity: 'common',
  weight_tenths: 0,
  weight_lb: 0,
  value_gp: 0,
  description: '',
  translations: null,
  slot_kind: 'none',
  properties: {},
  origin: 'dm',
  basic_key: null,
  is_template: false,
  archived: false,
  created_by: null,
  revision: 0,
  image_path: null,
})

beforeEach(() => {
  createSignedUrls.mockReset()
  pages.length = ranges.length = referenced.length = removed.length = 0
})

describe('item picture signing', () => {
  it('signs every picture requested together in one call with a one-hour lifetime', async () => {
    createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://x/${path}?t=1`, error: null })),
      error: null,
    }))
    const paths = Array.from({ length: 40 }, (_, i) => `pre/${campaign}/item/${i}.webp`)
    const urls = await Promise.all([...paths, paths[0]!].map((p) => repository.itemImageUrl(p)))
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls).toHaveBeenCalledWith(paths, 3600)
    expect(urls[39]).toBe(`https://x/${paths[39]}?t=1`)
    expect(urls[40]).toBe(urls[0])
  })

  it('rejects only the pictures Storage refused, and refuses other environments', async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: 'pre/a.webp', signedUrl: 'https://x/a', error: null },
        { path: 'pre/b.webp', signedUrl: '', error: 'Object not found' },
      ],
      error: null,
    })
    const [a, b] = await Promise.allSettled([
      repository.itemImageUrl('pre/a.webp'),
      repository.itemImageUrl('pre/b.webp'),
    ])
    expect(a).toEqual({ status: 'fulfilled', value: 'https://x/a' })
    expect(b.status).toBe('rejected')
    await expect(repository.itemImageUrl('public/c.webp')).rejects.toThrow('unavailable')
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
  })
})

describe('catalogue paging', () => {
  it('reads past the 1000-row API cap instead of truncating', async () => {
    pages.push(
      Array.from({ length: 1000 }, (_, i) => definition(i + 1)),
      Array.from({ length: 5 }, (_, i) => definition(i + 1001)),
    )
    const catalogue = await repository.loadCatalogue(campaign)
    expect(catalogue).toHaveLength(1005)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('keeps an upload that a definition references and removes it otherwise', async () => {
    referenced.push({ id: definition(1).id })
    await repository.discardItemUpload(campaign, `pre/${campaign}/used.webp`)
    expect(removed).toEqual([])
    referenced.length = 0
    await repository.discardItemUpload(campaign, `pre/${campaign}/orphan.webp`)
    expect(removed).toEqual([[`pre/${campaign}/orphan.webp`]])
  })

  it('never removes a production or foreign-campaign path from PRE', async () => {
    removed.length = 0
    await repository.discardItemUpload(campaign, `public/${campaign}/live.webp`)
    await repository.discardItemUpload(campaign, 'pre/00000000-0000-4000-8000-000000000000/x.webp')
    expect(removed).toEqual([])
  })
})
