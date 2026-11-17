import { matchPath } from 'react-router'
import { modules } from './modules'

type TitleInput = {
  pathname: string
  live: boolean
  signedIn: boolean
}

/** Routes whose title is not their module's name. Order matters: first match wins. */
const routeTitles = [
  { pattern: '/members', key: 'campaign.manage' },
  { pattern: '/party/roster', key: 'roster.title' },
  { pattern: '/party/:characterId/create', key: 'wizard.editorTitle' },
  { pattern: '/party/:characterId', key: 'sheet.title' },
] as const

/** Translation key for the document title, derived from the matched route pattern so nested
 * routes (`/combat/:id/table`, `/glossary/:entryId`) keep their module's title.
 * Returns `null` for a campaign home, which is titled with the campaign name. */
export function documentTitleKey({ pathname, live, signedIn }: TitleInput) {
  // RYT-115: the legal pages are public and keep their own title signed out.
  if (pathname === '/privacy') return 'legal.privacy'
  if (pathname === '/terms') return 'legal.terms'
  if (live && !signedIn) return 'auth.title'
  if (live && pathname === '/') return 'hub.title'
  if (matchPath({ path: '/library/*' }, pathname) || pathname === '/library') return 'library.title'
  const modulePath = live ? pathname.replace(/^\/campaign\/[^/]+/, '') || '/' : pathname
  if (live && modulePath === '/' && pathname !== '/') return null
  for (const { pattern, key } of routeTitles) {
    if (matchPath({ path: pattern, end: true }, modulePath)) return key
  }
  const module = modules.find(({ path }) => matchPath({ path: `${path}/*` }, modulePath))
  return module?.label ?? 'page.notFound'
}
