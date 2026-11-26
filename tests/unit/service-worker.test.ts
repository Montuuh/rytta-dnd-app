import { describe, expect, it } from 'vitest'
import { route, serviceWorkerSource, shellUrls } from '../../scripts/lib/service-worker.mts'

const scope = {
  origin: 'https://rytta.app',
  base: '/',
  shell: ['/', '/manifest.webmanifest', '/assets/index-a1.js'],
}
const get = (url: string, mode = 'cors') => ({ method: 'GET', mode, url })

describe('offline shell routing (RYT-128)', () => {
  it('answers navigations to the app from the network, then the cached shell', () => {
    expect(route(get('https://rytta.app/', 'navigate'), scope)).toBe('navigation')
    expect(route(get('https://rytta.app/index.html', 'navigate'), scope)).toBe('navigation')
    expect(route(get('https://rytta.app/?auth=callback', 'navigate'), scope)).toBe('navigation')
  })

  it('answers app routes from the network, then the cached shell without storing them (RYT-186)', () => {
    expect(route(get('https://rytta.app/campaign/abc/party', 'navigate'), scope)).toBe('route')
    expect(route(get('https://rytta.app/glossary/rule.long-rest', 'navigate'), scope)).toBe('route')
    expect(route(get('https://rytta.app/settings', 'navigate'), scope)).toBe('route')
    expect(route(get('https://rytta.app/privacy', 'navigate'), scope)).toBe('network')
    expect(route(get('https://rytta.app/en/terms/', 'navigate'), scope)).toBe('network')
    expect(route(get('https://rytta.app/google8b8d6f9672d29973.html', 'navigate'), scope)).toBe(
      'network',
    )
  })

  it('leaves other pages, other origins, writes and queries to the network', () => {
    expect(route(get('https://rytta.app/privacy/', 'navigate'), scope)).toBe('network')
    expect(route(get('https://abc.supabase.co/rest/v1/campaigns'), scope)).toBe('network')
    expect(route(get('https://abc.supabase.co/storage/v1/object/sign/x'), scope)).toBe('network')
    expect(
      route({ method: 'POST', mode: 'cors', url: 'https://rytta.app/assets/a.js' }, scope),
    ).toBe('network')
    expect(route(get('https://rytta.app/version.json?t=1'), scope)).toBe('network')
    expect(route(get('https://rytta.app/art/landing.webp'), scope)).toBe('network')
  })

  it('serves hashed build files and the listed shell files from the cache', () => {
    expect(route(get('https://rytta.app/assets/router-x1.js'), scope)).toBe('asset')
    expect(route(get('https://rytta.app/manifest.webmanifest'), scope)).toBe('shell')
  })

  it('keeps to the production subpath', () => {
    const sub = { ...scope, base: '/rytta-dnd-app/' }
    expect(route(get('https://rytta.app/rytta-dnd-app/', 'navigate'), sub)).toBe('navigation')
    expect(route(get('https://rytta.app/rytta-dnd-app/campaign/a', 'navigate'), sub)).toBe('route')
    expect(route(get('https://rytta.app/campaign/a', 'navigate'), sub)).toBe('network')
    expect(route(get('https://rytta.app/assets/a.js'), sub)).toBe('network')
    expect(route(get('https://rytta.app/rytta-dnd-app/assets/a.js'), sub)).toBe('asset')
  })
})

describe('offline shell build output', () => {
  const html = `<link rel="manifest" href="/manifest.webmanifest" />
    <script type="module" crossorigin src="/assets/index-a1.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/jsx-b2.js">
    <link rel="stylesheet" crossorigin href="/assets/index-c3.css">
    <link rel="icon" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.example" />`

  it('precaches index.html, the manifest and the build files the page loads first', () => {
    expect(shellUrls(html, '/')).toEqual([
      '/',
      '/manifest.webmanifest',
      '/assets/index-a1.js',
      '/assets/jsx-b2.js',
      '/assets/index-c3.css',
    ])
  })

  it('writes a worker with one cache per build that never stores another origin', () => {
    const source = serviceWorkerSource({ buildId: 'b1', base: '/', shell: shellUrls(html, '/') })
    expect(source).toContain('const CACHE = "rytta-shell-b1"')
    expect(source).toContain("key.startsWith('rytta-shell-') && key !== CACHE")
    expect(source).not.toMatch(/supabase|authorization/i)
    expect(() => new Function(source.replace(/^\/\*.*\*\/$/m, ''))).not.toThrow()
  })
})
