import { lazy } from 'react'

export { useContentEditor } from './api'
// The manager loads on demand, so the app menu can ask for the editor role without bundling it.
export const LibraryPage = lazy(() =>
  import('./ui/library-page').then((module) => ({ default: module.LibraryPage })),
)
