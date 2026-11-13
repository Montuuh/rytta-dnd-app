import { z } from 'zod'
import type { Json } from '@/shared/api/database.generated'
import { config } from '@/shared/lib/config'
import { newRequestId } from '@/shared/lib/request-id'
import {
  draftListSchema,
  draftSchema,
  entryKindSchema,
  importReportSchema,
  librarySchema,
  libraryErrorCode,
  publishResultSchema,
  saveResultSchema,
  type EntryInput,
  type PackInput,
} from '../domain/library'

/** RYT-092 content library RPCs. Every result is validated; errors become stable codes. */
async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}
const uuid = (value: string) => z.uuid().parse(value)
const fail = (error: { message: string }) => {
  throw new Error(libraryErrorCode(error.message))
}

export async function loadLibrary(signal: AbortSignal) {
  const db = await client()
  const result = await db.rpc('get_content_library').abortSignal(signal)
  if (result.error) fail(result.error)
  return librarySchema.parse(result.data)
}

export async function loadDrafts(packId: string, kind: string, signal: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('list_content_drafts', {
      target_pack: uuid(packId),
      entry_kind: entryKindSchema.parse(kind),
    })
    .abortSignal(signal)
  if (result.error) fail(result.error)
  return draftListSchema.parse(result.data)
}

export async function loadChanges(packId: string, signal: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('list_content_changes', { target_pack: uuid(packId) })
    .abortSignal(signal)
  if (result.error) fail(result.error)
  return draftListSchema.parse(result.data)
}

export async function loadDraft(entryId: string, signal: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('get_content_draft', { target_entry: uuid(entryId) })
    .abortSignal(signal)
  if (result.error) fail(result.error)
  return draftSchema.parse(result.data)
}

export async function savePack(packId: string | null, revision: number | null, input: PackInput) {
  const db = await client()
  const result = await db.rpc('save_content_pack', {
    target_pack: packId === null ? null : uuid(packId),
    expected_revision: revision,
    payload: { ...input, edition: input.edition || null } as unknown as Json,
    request_id: newRequestId(),
  })
  if (result.error) fail(result.error)
  return saveResultSchema.parse(result.data)
}

export async function setVisibility(
  packId: string,
  revision: number,
  visibility: 'public' | 'private',
) {
  const db = await client()
  const result = await db.rpc('set_content_pack_visibility', {
    target_pack: uuid(packId),
    expected_revision: revision,
    new_visibility: visibility,
    request_id: newRequestId(),
  })
  if (result.error) fail(result.error)
  return saveResultSchema.parse(result.data)
}

export async function deletePack(packId: string, revision: number) {
  const db = await client()
  const result = await db.rpc('delete_content_pack', {
    target_pack: uuid(packId),
    expected_revision: revision,
    request_id: newRequestId(),
  })
  if (result.error) fail(result.error)
  return saveResultSchema.parse(result.data)
}

export async function saveEntry(
  packId: string,
  entryId: string | null,
  revision: number | null,
  input: EntryInput,
) {
  const db = await client()
  const result = await db.rpc('save_content_entry', {
    target_pack: uuid(packId),
    target_entry: entryId === null ? null : uuid(entryId),
    expected_revision: revision,
    payload: input as unknown as Json,
    request_id: newRequestId(),
  })
  if (result.error) fail(result.error)
  return saveResultSchema.parse(result.data)
}

export async function changeEntry(action: 'delete' | 'revert', entryId: string, revision: number) {
  const db = await client()
  const result = await db.rpc(
    action === 'delete' ? 'delete_content_entry' : 'revert_content_entry',
    {
      target_entry: uuid(entryId),
      expected_revision: revision,
      request_id: newRequestId(),
    },
  )
  if (result.error) fail(result.error)
  return saveResultSchema.parse(result.data)
}

/** One batch (at most 500 entries) of one kind; a dry run only reports. */
export async function importEntries(
  packId: string,
  kind: string,
  entries: EntryInput[],
  dryRun: boolean,
  requestId: string,
) {
  const db = await client()
  const result = await db.rpc('import_content_entries', {
    target_pack: uuid(packId),
    entry_kind: entryKindSchema.parse(kind),
    entries: entries.map(({ key, name_en, name_es, data }) => ({
      key,
      name_en,
      name_es,
      data,
    })) as unknown as Json,
    dry_run: dryRun,
    request_id: requestId,
  })
  if (result.error) fail(result.error)
  return importReportSchema.parse(result.data)
}

export async function publishPack(packId: string, version: number) {
  const db = await client()
  const result = await db.rpc('publish_content_pack', {
    target_pack: uuid(packId),
    expected_version: version,
    request_id: newRequestId(),
  })
  if (result.error) fail(result.error)
  return publishResultSchema.parse(result.data)
}
