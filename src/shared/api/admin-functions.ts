import type { Json } from './database.generated'

// Reviewed SQL contract for the RYT-153 super admin migration (20261216120000_super_admin_role);
// regenerate from local Supabase when the stack is available.
export type AdminFunctions = {
  admin_status: { Args: Record<string, never>; Returns: Json }
  admin_list_campaigns: { Args: { search?: string | null }; Returns: Json }
  admin_campaign_summary: { Args: { target_campaign: string }; Returns: Json }
  admin_enter_campaign: { Args: { target_campaign: string }; Returns: Json }
  admin_exit_campaign: { Args: { target_campaign: string }; Returns: Json }
  admin_set_favourite: { Args: { target_campaign: string; favourite: boolean }; Returns: boolean }
  admin_favourite_campaigns: { Args: Record<string, never>; Returns: Json }
  admin_audit_log: { Args: { before_at?: string | null; page_size?: number }; Returns: Json }
  admin_usage: { Args: Record<string, never>; Returns: Json }
  admin_find_account: { Args: { query: string }; Returns: Json }
}
