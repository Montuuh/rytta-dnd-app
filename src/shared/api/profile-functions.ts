import type { Json } from './database.generated'

// Reviewed SQL contract for the RYT-078 username migration (ADR 036) and the RYT-115 account
// export and deletion migration; regenerate from local Supabase when the stack is available.
export type ProfileFunctions = {
  get_my_username: { Args: Record<string, never>; Returns: string | null }
  username_available: { Args: { candidate: string }; Returns: boolean }
  set_my_username: { Args: { new_username: string }; Returns: string }
  export_my_data: { Args: Record<string, never>; Returns: Json }
  account_deletion_blockers: {
    Args: Record<string, never>
    Returns: { campaign_id: string; campaign_name: string; other_members: number }[]
  }
  account_storage_paths: {
    Args: Record<string, never>
    Returns: { bucket_id: string; object_path: string; campaign_id: string }[]
  }
  prepare_account_deletion: { Args: { request_id: string }; Returns: Json }
  delete_my_account: { Args: { confirmation: string; request_id: string }; Returns: Json }
}
