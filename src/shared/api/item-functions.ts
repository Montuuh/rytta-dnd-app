import type { Json } from './database.generated'
// Reviewed SQL contract for the RYT-032 item lifecycle and the RYT-104/105 item migrations
// (20261120120000, 20261121120000). Results are JSON validated by the feature adapters;
// regenerate from local Supabase when the stack is available. Money is gp with two decimals.
type Campaign = { target_campaign: string }
type Keyed = { request_id: string }
type Call<A> = { Args: Campaign & A; Returns: Json }
export type ItemFunctions = {
  delete_loot_batch: Call<Keyed & { target_batch: string }>
  list_loot_batches: Call<{ after_name: string | null }>
  distribute_loot: Call<Keyed & { allocations: Json; batch_name: string | null }>
  item_definition_impact: Call<{ target_definition: string }>
  archive_item_definition: Call<Keyed & { target_definition: string; expected_revision: number }>
  sync_listing_prices: Call<
    Keyed & { target_definition: string; listing_ids: string[]; new_price: number }
  >
  set_item_template: Call<
    Keyed & { target_definition: string; make_template: boolean; expected_revision: number }
  >
  import_basic_items: Call<Keyed & { items: Json; update_existing?: boolean }>
  search_campaign_items: Call<{ search_query: string; max_results?: number }>
  // RYT-156 (20261214120000): definition id to value_gp for the campaign DM, {} for other members.
  get_item_values: Call<Record<never, never>>
  propose_item: Call<Keyed & { target_character: string; draft: Json; quantity: number }>
  // include_closed defaults to false: pending first, then the 50 latest closed ones.
  list_item_proposals: Call<{ target_character?: string | null; include_closed?: boolean }>
  cancel_item_proposal: Call<Keyed & { target_proposal: string; expected_revision: number }>
  resolve_item_proposal: Call<
    Keyed & {
      target_proposal: string
      resolution: 'accept' | 'merge' | 'reject'
      draft: Json | null
      target_definition: string | null
      // Required (1..1000) for accept and merge; ignored for reject.
      quantity: number | null
      note: string
      expected_revision: number
    }
  >
  merge_item_definitions: Call<
    Keyed & {
      source_definition: string
      target_definition: string
      source_revision: number
      target_revision: number
    }
  >
}
