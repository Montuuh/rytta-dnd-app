import type { Json } from './database.generated'
// Reviewed SQL contract for the RYT-005 shops migration. Reads return JSON validated by the
// shops adapter; regenerate from local Supabase when the stack is available.
type Read<A> = { Args: A; Returns: Json }
type Campaign = { target_campaign: string }
type Keyed = { request_id: string }
type Upsert<Target> = Campaign &
  Keyed &
  Target & { expected_revision: number | null; definition: Json }
export type ShopFunctions = {
  get_storefront: Read<Campaign & { target_character: string }>
  get_shop_admin: Read<Campaign>
  list_shop_orders: Read<Campaign & { target_character: string | null }>
  save_shop: { Args: Upsert<{ target_shop: string | null }>; Returns: string }
  archive_shop: { Args: Campaign & { target_shop: string }; Returns: undefined }
  save_listing: {
    Args: Upsert<{ target_shop: string; target_listing: string | null }>
    Returns: string
  }
  archive_listing: { Args: Campaign & { target_listing: string }; Returns: undefined }
  set_shop_modifier: {
    Args: Campaign & { target_shop: string; target_character: string; new_percent: number }
    Returns: undefined
  }
  checkout: Read<
    Campaign &
      Keyed & { target_shop: string; target_character: string; order_lines: Json; note: string }
  >
  sell_to_shop: Read<
    Campaign &
      Keyed & { target_shop: string; target_character: string; order_lines: Json; note: string }
  >
  respond_order: Read<
    Campaign &
      Keyed & { target_order: string; decision: string; line_prices: Json | null; note: string }
  >
  answer_counter_offer: Read<Campaign & Keyed & { target_order: string; accept: boolean }>
  cancel_order: { Args: Campaign & { target_order: string }; Returns: undefined }
  revert_order: Read<Campaign & Keyed & { target_order: string; note: string }>
}
