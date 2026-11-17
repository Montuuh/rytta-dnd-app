import { useSyncExternalStore } from 'react'
import type { AccountDeletionResult } from './domain/account'

/**
 * RYT-115: what the landing says after the account was deleted. Memory only: a reload, or the
 * next sign-in, starts clean. The deleting screen is gone by then (the account signs out first).
 */
export type AccountNotice = 'deleted' | 'disabled' | 'kept'

let current: AccountNotice | null = null
const listeners = new Set<() => void>()

function publish(next: AccountNotice | null) {
  current = next
  for (const listener of listeners) listener()
}

/** The Auth record outlives the data when it was disabled, kept or is shared (PRE). */
export function noticeFor(authUser: AccountDeletionResult['authUser']): AccountNotice {
  if (authUser === 'disabled') return 'disabled'
  if (authUser === 'kept' || authUser === 'shared') return 'kept'
  return 'deleted'
}

export function showAccountNotice(authUser: AccountDeletionResult['authUser']) {
  publish(noticeFor(authUser))
}

export function dismissAccountNotice() {
  publish(null)
}

export function useAccountNotice(): AccountNotice | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    () => current,
    () => null,
  )
}

/**
 * The text a notice shows. A surviving sign-in record can only be removed on request, so the
 * wording that asks the user to write depends on a published contact address: without one it says
 * plainly that the record holds no app data and that the request opens once the address exists.
 */
export function noticeCopy(
  notice: AccountNotice,
  contact: string | null | undefined,
):
  | { text: 'account.done.deleted'; contact: null }
  | {
      text:
        | 'account.done.disabled'
        | 'account.done.kept'
        | 'account.done.disabledContact'
        | 'account.done.keptContact'
      contact: string | null
    } {
  if (notice === 'deleted') return { text: 'account.done.deleted', contact: null }
  const address = contact?.trim() || null
  if (!address) return { text: `account.done.${notice}`, contact: null }
  return { text: `account.done.${notice}Contact`, contact: address }
}
