/** RYT-115: account export and deletion in Settings, and the notice after deleting. */
export const accountEn = {
  'account.title': 'Your account',
  'account.help': 'Manage your data and privacy across all your campaigns.',
  'account.deletedUser': 'Deleted account',

  'account.export.heading': 'Your data',
  'account.export.copy':
    'A JSON file with your profile, memberships, the characters you play, their inventory and what you created at your tables. DM-only notes are never included.',
  'account.export.button': 'Download my data',
  'account.export.busy': 'Preparing your file…',
  'account.export.done': 'Saved as {{file}}.',
  'account.export.truncated': 'The file holds the first {{rows}} rows of: {{sections}}.',
  'account.section.memberships': 'memberships',
  'account.section.characters': 'characters',
  'account.section.inventory': 'inventory',
  'account.section.invitations': 'invitations',
  'account.section.shop_orders': 'shop orders',
  'account.section.trades': 'trades',
  'account.section.item_proposals': 'item proposals',
  'account.section.rest_requests': 'rest requests',
  'account.section.character_events': 'character history',
  'account.section.inventory_events': 'inventory history',
  'account.section.combat_events': 'combat history',
  'account.section.item_definitions': 'items you created',
  'account.section.glossary_entries': 'glossary entries',
  'account.section.content_packs': 'content packs',
  'account.section.other': 'other sections',
  'account.export.error': 'We could not prepare your data. Try again.',
  'account.export.offline': 'You are offline. Reconnect to download your data.',
  'account.export.signIn': 'Your session ended. Sign in again to download your data.',

  'account.delete.heading': 'Leave Rytta',
  'account.delete.copy':
    'Deletes your Rytta account and removes you from every campaign. Campaigns where you are the only member are deleted. Shared campaigns keep their history without your name.',
  'account.delete.button': 'Delete my account…',

  'account.dialog.title': 'Delete your account',
  'account.dialog.loading': 'Checking your campaigns…',
  'account.dialog.loadError': 'We could not check your campaigns. Try again.',
  'account.dialog.close': 'Close',

  'account.blocked.lead':
    'You are the only DM of these campaigns and they still have other members. Your account cannot be deleted until that changes.',
  'account.blocked.others': 'Other members: {{count}}',
  'account.blocked.open': 'Members',
  'account.blocked.openLabel': 'Members of {{name}}',
  'account.blocked.ways':
    'Two ways out: hand the DM role to another member, or remove the other members. Then come back here.',

  'account.confirm.deletes': 'What is deleted',
  'account.confirm.deletes1': 'Your profile and your memberships.',
  'account.confirm.deletes2':
    'The campaigns where you are the only member, with everything in them.',
  'account.confirm.deletes3': 'The images you uploaded to those campaigns.',
  'account.confirm.stays': 'What stays',
  'account.confirm.stays1': 'Your history in shared campaigns, without your name.',
  'account.confirm.stays2':
    'Your characters in shared campaigns, which return to the campaign pool.',
  'account.confirm.final': 'Deleting your Rytta account is permanent.',
  'account.confirm.download': 'Download my data first',
  'account.confirm.label': 'Type {{word}} to confirm',
  'account.confirm.hint':
    'The delete button unlocks when you type the word; capital letters do not matter.',
  'account.confirm.submit': 'Delete account permanently',
  'account.confirm.busy': 'Deleting…',
  'account.confirm.cancel': 'Keep my account',

  'account.error.blocked':
    'A campaign blocked the deletion, but none is listed now. Try again; if it fails again, wait a moment.',
  'account.error.confirmation': 'The word does not match. Type it exactly as shown.',
  'account.error.storage':
    'We could not remove your uploaded images, so nothing was deleted. Try again.',
  'account.error.offline': 'You are offline. Nothing was sent: reconnect and press Delete again.',
  'account.error.signIn': 'Your session ended. Sign in again, then retry.',
  'account.error.unavailable': 'We could not delete your account. Try again in a moment.',

  'account.done.title': 'Your account was deleted',
  'account.done.deleted': 'Your data and your sign-in record are gone.',
  'account.done.disabled':
    'Your data is gone. Your sign-in record is disabled: it cannot be used to sign in and holds no app data. You can ask for it to be removed once the service publishes its contact address.',
  'account.done.kept':
    'Your data is gone. Your sign-in record still exists but holds no app data. You can ask for it to be removed once the service publishes its contact address.',
  'account.done.disabledContact':
    'Your data is gone. Your sign-in record is disabled, so it cannot be used to sign in. To have it removed, write to the owner.',
  'account.done.keptContact':
    'Your data is gone, but your sign-in record still exists. To have it removed, write to the owner.',
  'account.done.email': 'Email the owner',
  'account.done.privacy': 'See who runs the service',
  'account.done.dismiss': 'Close notice',
} as const
