import { describe, expect, it } from 'vitest'
import { documentTitleKey } from './document-title'

const live = (pathname: string, signedIn = true) =>
  documentTitleKey({ pathname, live: true, signedIn })

describe('documentTitleKey', () => {
  it('keeps the module title on nested routes', () => {
    expect(live('/campaign/c1/combat')).toBe('module.combat')
    expect(live('/campaign/c1/combat/e1')).toBe('module.combat')
    expect(live('/campaign/c1/combat/e1/table')).toBe('module.combat')
    expect(live('/campaign/c1/glossary/goblin')).toBe('module.glossary')
    expect(live('/campaign/c1/tabletop/s1')).toBe('module.tabletop')
  })

  it('titles the party sub-pages by their own page', () => {
    expect(live('/campaign/c1/party')).toBe('module.party')
    expect(live('/campaign/c1/party/roster')).toBe('roster.title')
    expect(live('/campaign/c1/party/p1')).toBe('sheet.title')
    expect(live('/campaign/c1/party/p1/create')).toBe('wizard.editorTitle')
    expect(live('/campaign/c1/members')).toBe('campaign.manage')
  })

  it('uses the sign-in heading, the hub and the library', () => {
    expect(live('/campaign/c1/party', false)).toBe('auth.title')
    expect(live('/')).toBe('hub.title')
    expect(live('/library/pack/kind')).toBe('library.title')
  })

  it('titles the public legal pages even when signed out', () => {
    expect(live('/privacy', false)).toBe('legal.privacy')
    expect(live('/terms', false)).toBe('legal.terms')
    expect(documentTitleKey({ pathname: '/terms', live: false, signedIn: false })).toBe(
      'legal.terms',
    )
  })

  it('leaves a campaign home to the campaign name and 404s unknown or planned routes', () => {
    expect(live('/campaign/c1')).toBeNull()
    expect(live('/campaign/c1/quests')).toBe('page.notFound')
    expect(live('/campaign/c1/nowhere')).toBe('page.notFound')
  })

  it('works in demo mode', () => {
    expect(documentTitleKey({ pathname: '/glossary/x', live: false, signedIn: false })).toBe(
      'module.glossary',
    )
    expect(documentTitleKey({ pathname: '/party', live: false, signedIn: false })).toBe(
      'module.party',
    )
  })
})
