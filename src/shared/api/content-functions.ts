import type { Json } from './database.generated'
// Reviewed SQL contract for the RYT-092 content library migration. Results are JSON validated by
// the content library adapter; regenerate from local Supabase when the stack is available.
type Write<A> = { Args: A & { request_id: string }; Returns: Json }
export type ContentFunctions = {
  get_content_library: { Args: Record<string, never>; Returns: Json }
  get_content_entries: {
    Args: { target_pack: string; entry_kind: string; after_key?: string | null }
    Returns: Json
  }
  list_content_drafts: { Args: { target_pack: string; entry_kind: string }; Returns: Json }
  list_content_changes: { Args: { target_pack: string }; Returns: Json }
  get_content_draft: { Args: { target_entry: string }; Returns: Json }
  save_content_pack: Write<{
    target_pack: string | null
    expected_revision: number | null
    payload: Json
  }>
  set_content_pack_visibility: Write<{
    target_pack: string
    expected_revision: number
    new_visibility: string
  }>
  delete_content_pack: Write<{ target_pack: string; expected_revision: number }>
  save_content_entry: Write<{
    target_pack: string
    target_entry: string | null
    expected_revision: number | null
    payload: Json
  }>
  delete_content_entry: Write<{ target_entry: string; expected_revision: number }>
  revert_content_entry: Write<{ target_entry: string; expected_revision: number }>
  import_content_entries: Write<{
    target_pack: string
    entry_kind: string
    entries: Json
    dry_run: boolean
  }>
  publish_content_pack: Write<{ target_pack: string; expected_version: number }>
}
