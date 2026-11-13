import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { config } from '@/shared/lib/config'
import { newRequestId } from '@/shared/lib/request-id'
import {
  changeEntry,
  deletePack,
  importEntries,
  loadChanges,
  loadDraft,
  loadDrafts,
  loadLibrary,
  publishPack,
  savePack,
  saveEntry,
  setVisibility,
} from './data/repository'
import { batches } from './domain/import-file'
import type { EntryInput, ImportReport, PackInput } from './domain/library'

const root = (userId: string) => ['private', userId, 'content-library'] as const

export const libraryQuery = (userId: string) =>
  queryOptions({
    queryKey: root(userId),
    queryFn: ({ signal }) => loadLibrary(signal),
    staleTime: 30_000,
  })
export const draftsQuery = (userId: string, packId: string, kind: string) =>
  queryOptions({
    queryKey: [...root(userId), packId, 'drafts', kind],
    queryFn: ({ signal }) => loadDrafts(packId, kind, signal),
  })
export const changesQuery = (userId: string, packId: string) =>
  queryOptions({
    queryKey: [...root(userId), packId, 'changes'],
    queryFn: ({ signal }) => loadChanges(packId, signal),
  })
export const draftQuery = (userId: string, entryId: string) =>
  queryOptions({
    queryKey: [...root(userId), 'entry', entryId],
    queryFn: ({ signal }) => loadDraft(entryId, signal),
  })

/** Whether the signed-in account may open the content library (presentation only: RLS decides). */
export function useContentEditor(): boolean {
  const { state } = useAuth()
  const userId = state.user?.id
  const live = config.VITE_DATA_MODE === 'supabase'
  const library = useQuery({ ...libraryQuery(userId ?? ''), enabled: live && !!userId })
  return library.data?.editor === true
}

export type LibraryAction =
  | { kind: 'savePack'; packId: string | null; revision: number | null; input: PackInput }
  | { kind: 'deletePack'; packId: string; revision: number }
  | {
      kind: 'saveEntry'
      packId: string
      entryId: string | null
      revision: number | null
      input: EntryInput
    }
  | { kind: 'deleteEntry' | 'revertEntry'; entryId: string; revision: number }
  | { kind: 'publish'; packId: string; version: number }
  | { kind: 'visibility'; packId: string; revision: number; visibility: 'public' | 'private' }

/** Every editor write; the whole library cache is refreshed after it settles. */
export function useLibraryAction() {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (action: LibraryAction) => {
      if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('network')
      switch (action.kind) {
        case 'savePack':
          return savePack(action.packId, action.revision, action.input)
        case 'deletePack':
          return deletePack(action.packId, action.revision)
        case 'saveEntry':
          return saveEntry(action.packId, action.entryId, action.revision, action.input)
        case 'deleteEntry':
          return changeEntry('delete', action.entryId, action.revision)
        case 'revertEntry':
          return changeEntry('revert', action.entryId, action.revision)
        case 'publish':
          return publishPack(action.packId, action.version)
        case 'visibility':
          return setVisibility(action.packId, action.revision, action.visibility)
      }
    },
    onSettled: () => {
      if (userId) void cache.invalidateQueries({ queryKey: root(userId) })
    },
  })
}

export type ImportProgress = { done: number; total: number }
const emptyReport = (dryRun: boolean): ImportReport => ({
  added: 0,
  updated: 0,
  unchanged: 0,
  refused: 0,
  problems: [],
  dry_run: dryRun,
})

/**
 * Sends groups of entries in batches, one kind at a time. A dry run adds up the server's reports
 * without writing; a real run writes every batch in order (each one idempotent on its request id).
 */
export function useImportEntries() {
  const { state } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  return async (
    packId: string,
    groups: { kind: string; entries: EntryInput[] }[],
    dryRun: boolean,
    onProgress: (progress: ImportProgress) => void,
  ): Promise<ImportReport> => {
    if (!navigator.onLine || !userId) throw new Error('network')
    const plan = groups.flatMap((group) =>
      batches(group.entries).map((entries) => ({ kind: group.kind, entries })),
    )
    const total = plan.reduce((sum, batch) => sum + batch.entries.length, 0)
    const report = emptyReport(dryRun)
    let done = 0
    onProgress({ done, total })
    try {
      for (const batch of plan) {
        const part = await importEntries(packId, batch.kind, batch.entries, dryRun, newRequestId())
        report.added += part.added
        report.updated += part.updated
        report.unchanged += part.unchanged
        report.refused += part.refused
        report.problems.push(
          ...part.problems.map((problem) => ({ ...problem, key: problem.key ?? null })),
        )
        done += batch.entries.length
        onProgress({ done, total })
      }
    } finally {
      if (!dryRun) void cache.invalidateQueries({ queryKey: root(userId) })
    }
    return report
  }
}
