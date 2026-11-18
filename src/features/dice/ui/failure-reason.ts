import { CampaignSettingsError } from '@/features/campaigns'

/** The reason a roll request failed, as one of the CampaignSettingsReason values. */
export const failureReason = (error: unknown) =>
  error instanceof CampaignSettingsError
    ? error.reason
    : error instanceof Error && error.name === 'ZodError'
      ? 'invalid'
      : 'unavailable'
