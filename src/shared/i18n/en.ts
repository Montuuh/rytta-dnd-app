import { charactersEn } from './characters-en'
import { sheetEn } from './sheet-en'
import { inventoryEn } from './inventory-en'
import { shopsEn } from './shops-en'
import { identityEn } from './identity-en'
import { designEn } from './design-en'
import { storeEn } from './store-en'
import { partyEn } from './party-en'
import { settingsEn } from './settings-en'
import { lifecycleEn } from './lifecycle-en'
import { tradesEn } from './trades-en'
import { combatEn } from './combat-en'
import { glossaryEn } from './glossary-en'
import { rosterEn } from './roster-en'
import { bestiaryEn } from './bestiary-en'
import { builderEn } from './builder-en'
import { tabletopEn } from './tabletop-en'
import { panelEn } from './panel-en'
export const en = {
  ...identityEn,
  ...charactersEn,
  ...sheetEn,
  ...inventoryEn,
  ...shopsEn,
  ...designEn,
  ...storeEn,
  ...partyEn,
  ...settingsEn,
  ...lifecycleEn,
  ...tradesEn,
  ...combatEn,
  ...glossaryEn,
  ...rosterEn,
  ...bestiaryEn,
  ...builderEn,
  ...tabletopEn,
  ...panelEn,
  'module.party': 'Party',
  'module.inventory': 'Inventory',
  'module.shops': 'Shops',
  'module.quests': 'Quests',
  'module.combat': 'Combat',
  'module.atlas': 'Atlas',
  'module.glossary': 'Glossary',
  'module.memories': 'Memories',
  'module.stronghold': 'Stronghold',
  'module.workshop': 'Workshop',
  'summary.party': 'Character sheets and DM-managed resources.',
  'summary.inventory': 'Items, equipment, weight and reversible use.',
  'summary.shops': 'Revealed merchants and secure purchases.',
  'summary.quests': 'A shared record of your unfinished stories.',
  'summary.combat': 'Hit points and initiative, visible to the table.',
  'summary.atlas': 'Places, routes and travel resources.',
  'summary.glossary': 'Searchable rules and homebrew references.',
  'summary.memories': 'An album of memorable moments.',
  'summary.stronghold': 'Mano Hundida, its people and its upkeep.',
  'summary.workshop': 'DM crafting and character relationships.',
  'nav.main': 'Main navigation',
  'nav.skip': 'Skip to content',
  'nav.open': 'Open navigation',
  'nav.drawer': 'Rytta navigation',
  'nav.close': 'Close navigation',
  'nav.adventure': 'YOUR ADVENTURE',
  'nav.settings': 'App setup',
  'brand.tag': 'THE TABLE COMPANION',
  'brand.title': 'The adventurer’s companion',
  'brand.less': 'Less bookkeeping.',
  'brand.more': 'More adventure.',
  'brand.footer': 'Made for the people around your table.',
  'mode.demo': 'Preview · sample data',
  'mode.backend': 'Your table',
  'common.planned': 'Planned module',
  'common.back': 'Back',
  'common.loading': 'Opening your companion…',
  'common.retry': 'Try again',
  'page.notFound': 'Page not found',
  'page.unknown': 'Unknown route',
  'page.noPath': 'This path does not lead to a page.',
  'page.return': 'Go back to keep exploring the companion.',
  'page.planned':
    'This module is not available yet. It will appear in the menu when your table can use it.',
  'campaigns.title': 'Your campaigns',
  'campaigns.next': 'Campaign creation and invitations arrive with RYT-002.',
  'campaigns.empty': 'No campaigns available for this account.',
  'campaigns.unavailable': 'Campaigns unavailable',
  'error.signIn': 'Sign-in is required. Authentication screens are planned in RYT-001.',
  'error.campaigns': 'Campaigns could not be loaded. Check your connection and campaign access.',
  'error.title': 'The companion could not open',
  'error.help': 'Reload to try again. If this continues, check the app configuration.',
  'error.reload': 'Reload',
  'preferences.language': 'Language',
  'preferences.saved':
    'Your choices are saved on this device. New visits start in Spanish with the Hearth theme.',
  'settings.demo': 'Demo mode',
  'settings.backend': 'Supabase mode',
  'settings.demoDescription':
    'Sample content is local and read-only. No account, connection or saved progress is implied.',
  'settings.backendDescription':
    'Google sign-in and campaign membership use your configured Supabase project. Gameplay modules are still planned.',
  'settings.connection': 'Backend configuration: {{status}}.',
  'settings.provided': 'provided (connection not verified)',
  'settings.missing': 'not provided',
  'settings.docs':
    'For local setup, follow README.md. Deployment, database permissions and delivery plans live in docs/.',
} as const
