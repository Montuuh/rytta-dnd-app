import type { AppSupabaseClient } from '@/shared/api/database.types'
import { ownsStoragePath } from '@/shared/api/storage-paths'
import {
  AccountError,
  accountDeletionWord,
  accountBlockersSchema,
  accountDeletionPreparationSchema,
  accountDeletionResultSchema,
  accountError,
  accountExportSchema,
  accountStoragePathsSchema,
  storageBuckets,
  type AccountBlocker,
  type AccountDeletionResult,
  type AccountExport,
  type AccountStoragePath,
  type StorageBucket,
} from '../domain/account'

const removeBatch = 100
/** Listing rounds after the prepared snapshot (each lists up to 5000 objects). */
const maxListingRounds = 10

export type AccountRepository = {
  exportMyData(signal?: AbortSignal): Promise<AccountExport>
  deletionBlockers(signal?: AbortSignal): Promise<AccountBlocker[]>
  /**
   * Prepares the deletion on the server (which closes pending invitations of the campaigns it
   * will delete), removes their Storage objects (active environment only) until none are listed,
   * then deletes the account. Refuses before touching Storage while blockers remain, and before
   * the deletion when objects remain.
   */
  deleteMyAccount(confirmation: string, requestId: string): Promise<AccountDeletionResult>
}

/** `schema` is the active database environment; paths of the other one are never removed. */
export function createSupabaseAccountRepository(
  client: AppSupabaseClient,
  schema: string,
): AccountRepository {
  async function deletionBlockers(signal?: AbortSignal) {
    let query = client.rpc('account_deletion_blockers')
    if (signal) query = query.abortSignal(signal)
    const { data, error } = await query
    if (error) throw accountError(error)
    return accountBlockersSchema.parse(data ?? [])
  }

  async function listCampaignObjects() {
    const { data, error } = await client.rpc('account_storage_paths')
    if (error) throw accountError(error)
    return accountStoragePathsSchema.parse(data ?? [])
  }

  /**
   * Removes the prepared paths, then lists again until no owned object is left. A path listed
   * again after its removal reported success was not removed (Storage skips what RLS denies):
   * that, a failed batch or more pages than the cap stop with 'storage' before the deletion.
   * Only campaigns of the prepared snapshot are touched: one that became solo afterwards is not
   * deleted by the server, so its pictures must stay.
   */
  async function removeCampaignObjects(prepared: AccountStoragePath[], campaigns: string[]) {
    const allowed = new Set([...campaigns, ...prepared.map((row) => row.campaign_id)])
    const removed = new Set<string>()
    const skipped = new Set<string>()
    let page = prepared
    for (let round = 0; page.length > 0; round += 1) {
      if (round > maxListingRounds) throw new AccountError('storage')
      const byBucket = new Map<StorageBucket, string[]>()
      for (const row of page) {
        const key = `${row.bucket_id}/${row.object_path}`
        if (skipped.has(key)) continue
        if (removed.has(key)) throw new AccountError('storage')
        const bucket = storageBuckets.find((name) => name === row.bucket_id)
        if (
          !bucket ||
          !allowed.has(row.campaign_id) ||
          !ownsStoragePath(row.object_path, schema, row.campaign_id)
        ) {
          skipped.add(key)
          continue
        }
        removed.add(key)
        byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row.object_path])
      }
      if (byBucket.size === 0) return
      for (const [bucket, paths] of byBucket) {
        for (let start = 0; start < paths.length; start += removeBatch) {
          const result = await client.storage
            .from(bucket)
            .remove(paths.slice(start, start + removeBatch))
          if (result.error) throw new AccountError('storage')
        }
      }
      page = await listCampaignObjects()
    }
  }

  async function prepareDeletion(requestId: string) {
    const { data, error } = await client.rpc('prepare_account_deletion', { request_id: requestId })
    if (error) throw accountError(error)
    return accountDeletionPreparationSchema.parse(data)
  }

  return {
    async exportMyData(signal) {
      let query = client.rpc('export_my_data')
      if (signal) query = query.abortSignal(signal)
      const { data, error } = await query
      if (error) throw accountError(error)
      return accountExportSchema.parse(data)
    },
    deletionBlockers,
    async deleteMyAccount(confirmation, requestId) {
      // Checked here too: Storage objects are removed before the server sees the word.
      if (confirmation !== accountDeletionWord) throw new AccountError('confirmation')
      const prepared = await prepareDeletion(requestId)
      if (prepared.blockers.length > 0) throw new AccountError('blocked', prepared.blockers)
      await removeCampaignObjects(prepared.storagePaths, prepared.campaigns)
      const { data, error } = await client.rpc('delete_my_account', {
        confirmation,
        request_id: requestId,
      })
      if (error) {
        const failure = accountError(error)
        if (failure.kind === 'blocked')
          throw new AccountError('blocked', await deletionBlockers().catch(() => []))
        throw failure
      }
      return accountDeletionResultSchema.parse(data)
    },
  }
}
