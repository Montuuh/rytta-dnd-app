import { describe, expect, it } from 'vitest'
import { hrefOf, legacyHashAddress, routeOf, routerBasename } from './app-path'

describe('app paths under the deploy base (RYT-186)', () => {
  it('gives the router a basename with the trailing slash', () => {
    expect(routerBasename('/')).toBe('/')
    expect(routerBasename('/rytta-dnd-app/')).toBe('/rytta-dnd-app/')
  })

  it('reads the route of a same-origin address under the base', () => {
    const origin = 'https://rytta.app'
    expect(routeOf('https://rytta.app/campaign/a/party?tab=x', origin, '/')).toBe(
      '/campaign/a/party?tab=x',
    )
    expect(routeOf('https://rytta.app/', origin, '/')).toBe('/')
    expect(routeOf('/rytta-dnd-app/glossary', origin, '/rytta-dnd-app/')).toBe('/glossary')
    expect(routeOf('/rytta-dnd-app', origin, '/rytta-dnd-app/')).toBe('/')
    expect(routeOf('/rytta-dnd-appx/glossary', origin, '/rytta-dnd-app/')).toBeNull()
    expect(routeOf('https://evil.example/campaign', origin, '/')).toBeNull()
  })

  it('builds raw addresses for links outside the router', () => {
    expect(hrefOf('/campaign/a/tabletop-table', '/')).toBe('/campaign/a/tabletop-table')
    expect(hrefOf('/campaign/a', '/rytta-dnd-app/')).toBe('/rytta-dnd-app/campaign/a')
  })

  it('turns old hash addresses into the same route', () => {
    expect(legacyHashAddress('https://rytta.app/#/campaign/a/party', '/')).toBe('/campaign/a/party')
    expect(legacyHashAddress('https://rytta.app/#/glossary?q=fuego', '/')).toBe('/glossary?q=fuego')
    expect(legacyHashAddress('https://rytta.app/?code=1#/settings', '/')).toBe('/settings?code=1')
    expect(legacyHashAddress('https://rytta.app/x/#/', '/x/')).toBe('/x/')
    // Another host in the hash never leaves the app's origin.
    expect(legacyHashAddress('https://rytta.app/#//evil.example/x', '/')).toBe('/x')
  })

  it('adds the trailing slash to the bare subpath base', () => {
    expect(legacyHashAddress('https://rytta.app/rytta-dnd-app?x=1', '/rytta-dnd-app/')).toBe(
      '/rytta-dnd-app/?x=1',
    )
    expect(legacyHashAddress('https://rytta.app/rytta-dnd-app/', '/rytta-dnd-app/')).toBeNull()
  })

  it('leaves plain addresses, in-page anchors and token fragments alone', () => {
    expect(legacyHashAddress('https://rytta.app/campaign/a', '/')).toBeNull()
    expect(legacyHashAddress('https://rytta.app/#main-content', '/')).toBeNull()
    expect(legacyHashAddress('https://rytta.app/#access_token=x', '/')).toBeNull()
  })
})
