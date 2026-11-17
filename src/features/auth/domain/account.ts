import { z } from 'zod'

/** RYT-115: the server only accepts this word; the screen decides how the user types it. */
export const accountDeletionWord = 'DELETE'

export type AccountErrorKind =
  | 'blocked' // sole DM of a campaign with other members; see `blockers`
  | 'confirmation' // the confirmation word did not match
  | 'storage' // a campaign image could not be removed; nothing was deleted from the database
  | 'signIn' // no session
  | 'offline' // no network: nothing was sent
  | 'unavailable'

export type AccountBlocker = { campaignId: string; campaignName: string; otherMembers: number }

export class AccountError extends Error {
  readonly kind: AccountErrorKind
  readonly blockers: readonly AccountBlocker[]
  constructor(kind: AccountErrorKind, blockers: readonly AccountBlocker[] = []) {
    super(kind)
    this.name = 'AccountError'
    this.kind = kind
    this.blockers = blockers
  }
}

/** Maps a database error to the account error the screen can act on. */
export function accountError(error: { message?: unknown } | null | undefined): AccountError {
  const message = typeof error?.message === 'string' ? error.message : ''
  if (message.includes('Account deletion blocked')) return new AccountError('blocked')
  if (message.includes('Confirmation required')) return new AccountError('confirmation')
  if (message.includes('Forbidden')) return new AccountError('signIn')
  return new AccountError('unavailable')
}

export const accountBlockersSchema = z
  .array(
    z.object({
      campaign_id: z.uuid(),
      campaign_name: z.string(),
      other_members: z.number().int(),
    }),
  )
  .transform((rows) =>
    rows.map((row): AccountBlocker => ({
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      otherMembers: row.other_members,
    })),
  )

export const storageBuckets = [
  'character-portraits',
  'item-images',
  'creature-images',
  'tabletop-media',
  'shop-images',
] as const
export type StorageBucket = (typeof storageBuckets)[number]

const accountStoragePathSchema = z.object({
  bucket_id: z.string(),
  object_path: z.string().min(1),
  campaign_id: z.uuid(),
})
export type AccountStoragePath = z.infer<typeof accountStoragePathSchema>
export const accountStoragePathsSchema = z.array(accountStoragePathSchema)

/** prepare_account_deletion: one server snapshot taken before any Storage object is removed. */
export const accountDeletionPreparationSchema = z
  .object({
    blockers: accountBlockersSchema,
    campaigns: z.array(z.uuid()),
    storage_paths: accountStoragePathsSchema,
    revoked_invitations: z.number().int(),
  })
  .transform((row) => ({
    blockers: row.blockers,
    campaigns: row.campaigns,
    storagePaths: row.storage_paths,
  }))

export type AccountDeletionResult = {
  environment: 'public' | 'pre'
  /**
   * What the UI relies on. 'deleted' and 'absent': nothing of the account is left. 'shared': the
   * PRE data is gone and the shared Auth user stays by design. 'disabled' (banned, sessions
   * removed) and 'kept': the app data is gone but the sign-in account still exists.
   */
  authUser: 'deleted' | 'disabled' | 'kept' | 'absent' | 'shared'
  campaignsDeleted: string[]
  campaignsLeft: string[]
}

export const accountDeletionResultSchema = z
  .object({
    // false while the Auth user remains ('disabled' or 'kept'); auth_user carries the detail.
    deleted: z.boolean(),
    environment: z.enum(['public', 'pre']),
    auth_user: z.enum(['deleted', 'disabled', 'kept', 'absent', 'shared']),
    campaigns_deleted: z.array(z.uuid()),
    campaigns_left: z.array(z.uuid()),
  })
  .transform((row): AccountDeletionResult => ({
    environment: row.environment,
    authUser: row.auth_user,
    campaignsDeleted: row.campaigns_deleted,
    campaignsLeft: row.campaigns_left,
  }))

/** The export is the server's JSON as is; only its envelope is checked. */
export const accountExportSchema = z.looseObject({
  format: z.literal('rytta-account-export'),
  version: z.literal(1),
  environment: z.enum(['public', 'pre']),
  generated_at: z.string(),
  limits: z.object({ rows_per_section: z.number().int() }),
  truncated: z.array(z.string()),
})
export type AccountExport = z.infer<typeof accountExportSchema>

/** File name for a downloaded export, e.g. rytta-export-2026-11-17.json. */
export function accountExportFileName(data: Pick<AccountExport, 'generated_at'>): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(data.generated_at)?.[0] ?? 'export'
  return `rytta-export-${day}.json`
}
