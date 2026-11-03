import type { Json } from './database.generated'
// Reviewed SQL contract for the RYT-032 item lifecycle migration. Results are JSON validated by
// the inventory adapter; regenerate from local Supabase when the stack is available.
export type ItemFunctions = {
  item_definition_impact: {
    Args: { target_campaign: string; target_definition: string }
    Returns: Json
  }
  archive_item_definition: {
    Args: {
      target_campaign: string
      target_definition: string
      expected_revision: number
      request_id: string
    }
    Returns: Json
  }
  sync_listing_prices: {
    Args: {
      target_campaign: string
      target_definition: string
      listing_ids: string[]
      new_price: number
      request_id: string
    }
    Returns: Json
  }
}
