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
import { restEn } from './rest-en'
import { usernameEn } from './username-en'
import { accountEn } from './account-en'
import { libraryEn } from './library-en'
import { viewerEn } from './viewer-en'
import { legalEn } from './legal-en'
import { diceEn } from './dice-en'
import { levelupEn } from './levelup-en'
import { castEn } from './cast-en'
import { activationEn } from './activation-en'
import { sessionEn } from './session-en'

export const en = {
  ...sessionEn,
  ...activationEn,
  ...legalEn,
  ...diceEn,
  ...levelupEn,
  ...castEn,
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
  ...restEn,
  ...usernameEn,
  ...accountEn,
  ...libraryEn,
  ...viewerEn,
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
  'nav.settings': 'Settings',
  'mode.demo': 'Preview · sample data',
  'mode.backend': 'Your table',
  'common.back': 'Back',
  'common.loading': 'Loading…',
  'common.loadingSlow': 'This is taking longer than expected. Reload or go back to the start.',
  'common.retry': 'Try again',
  'common.storageQuota':
    'Storage refused the upload. This campaign may have used its storage space: remove pictures or media it no longer needs, then try again.',
  'page.notFound': 'Page not found',
  'page.notFoundHelp': 'This address doesn’t exist or is no longer available.',
  'page.goCampaign': 'Go to the campaign',
  'page.goHome': 'Go to the start',
  'nav.campaignHome': 'Home of {{name}}',
  'campaigns.title': 'Your campaigns',
  'campaigns.next': 'Campaign creation and invitations arrive with RYT-002.',
  'campaigns.empty': 'No campaigns available for this account.',
  'campaigns.unavailable': 'Campaigns unavailable',
  'error.signIn': 'Sign-in is required. Authentication screens are planned in RYT-001.',
  'error.campaigns': 'Campaigns could not be loaded. Check your connection and campaign access.',
  'error.title': 'The companion could not open',
  'error.help': 'Reload the page. If it keeps failing, go back to the start and try again.',
  'error.home': 'Go to the start',
  'error.reload': 'Reload',
  'preferences.language': 'Language',
  'preferences.saved': 'Your choices are saved on this device.',
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
