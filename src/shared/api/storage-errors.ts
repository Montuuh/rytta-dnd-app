/**
 * RYT-113: Storage answers an upload refused by its INSERT policy with a row-level security
 * message. Callers have already passed the access checks the screen applies, so the likely cause
 * is a campaign storage quota (objects, audio or stored bytes); anything else stays generic.
 */
export type StorageUploadError = 'storageQuota' | 'unavailable'
export function storageUploadError(
  error: { message?: unknown } | null | undefined,
): StorageUploadError {
  const message = typeof error?.message === 'string' ? error.message : ''
  return /row-level security/i.test(message) ? 'storageQuota' : 'unavailable'
}
