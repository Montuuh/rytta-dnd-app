import { lazy } from 'react'

export { useQuestsUnseen } from './api'
// The journal loads when a campaign's quests are opened.
export const QuestsPage = lazy(() =>
  import('./ui/quests-page').then((module) => ({ default: module.QuestsPage })),
)
