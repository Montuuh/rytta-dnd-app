import { lazy } from 'react'

export { adminCampaignsQuery, useAdminStatus } from './api'
export { AdminBanner } from './ui/admin-banner'
export { SupervisedCampaigns } from './ui/supervised'
// The panel loads on demand: only super admins ever open it.
export const AdminPage = lazy(() =>
  import('./ui/admin-page').then((module) => ({ default: module.AdminPage })),
)
