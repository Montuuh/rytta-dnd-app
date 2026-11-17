import { useTranslation } from 'react-i18next'
import { useIsRealDm } from '@/features/campaigns'

/**
 * RYT-125: the words for a failed portrait upload. A full storage quota is the DM's to free, so
 * a Player is told to ask the DM instead of being sent to delete campaign files.
 */
export function usePortraitErrorText() {
  const { t } = useTranslation()
  const dm = useIsRealDm()
  return (error: Error | null) =>
    error?.message === 'storageQuota'
      ? t(dm ? 'common.storageQuota' : 'inventory.portrait.quotaPlayer')
      : t('inventory.portrait.error')
}
