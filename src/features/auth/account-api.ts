import type { QueryClient } from '@tanstack/react-query'
import { config } from '@/shared/lib/config'
import {
  AccountError,
  type AccountBlocker,
  type AccountDeletionResult,
  type AccountExport,
} from './domain/account'

// RYT-115: account export and deletion for the settings screen. Supabase is loaded on demand.
async function connect() {
  const [{ getSupabase, activeSchema }, { createSupabaseAccountRepository }] = await Promise.all([
    import('@/shared/api/supabase'),
    import('./data/account-repository'),
  ])
  const client = getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
  return { client, repository: createSupabaseAccountRepository(client, activeSchema()) }
}

/** Raises at once instead of letting a request wait for the network: a destructive action must never be queued. */
function assertOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw new AccountError('offline')
}

/** Everything tied to the signed-in account, as the server's JSON (sections capped at 500 rows). */
export async function exportMyData(signal?: AbortSignal): Promise<AccountExport> {
  assertOnline()
  return (await connect()).repository.exportMyData(signal)
}

/** Campaigns where the account is the only DM while other members remain; empty when free to delete. */
export async function accountDeletionBlockers(signal?: AbortSignal): Promise<AccountBlocker[]> {
  return (await connect()).repository.deletionBlockers(signal)
}

export type DeleteMyAccountInput = {
  /** Must equal accountDeletionWord ('DELETE'). */
  confirmation: string
  /** One id per deletion attempt; reuse it to retry the same attempt safely. */
  requestId: string
  queryClient: QueryClient
}

/**
 * Prepares the deletion on the server, removes the images of the campaigns that will be deleted
 * until none are listed, deletes the account, then signs out locally and clears every cached
 * query. Throws AccountError (kind offline, blocked, confirmation, storage, signIn or unavailable);
 * nothing is signed out when it throws. Check result.authUser: 'disabled' or 'kept' means the
 * sign-in account still exists although the app data is gone.
 */
export async function deleteMyAccount({
  confirmation,
  requestId,
  queryClient,
}: DeleteMyAccountInput): Promise<AccountDeletionResult> {
  assertOnline()
  const { client, repository } = await connect()
  const result = await repository.deleteMyAccount(confirmation, requestId)
  await queryClient.cancelQueries()
  queryClient.clear()
  // The Auth user may already be gone: only the local session is dropped, errors are moot.
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
  return result
}
