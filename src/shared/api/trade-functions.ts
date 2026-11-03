import type { Json } from './database.generated'
// Reviewed SQL contract for the RYT-034 trades migration. Results are JSON validated by the
// trades adapter; regenerate from local Supabase when the stack is available.
type Mutation<A> = { Args: A & { target_campaign: string }; Returns: Json }
export type TradeFunctions = {
  get_trade_state: { Args: { target_campaign: string; acting_user: string | null }; Returns: Json }
  invite_trade: Mutation<{ from_character: string; to_character: string; request_id: string }>
  respond_trade_invite: Mutation<{ target_trade: string; accept: boolean; request_id: string }>
  set_trade_offer: Mutation<{
    target_trade: string
    acting_character: string
    expected_revision: number
    offer_items: Json
    offer_gold: number
    request_id: string
  }>
  confirm_trade: Mutation<{
    target_trade: string
    acting_character: string
    expected_revision: number
    request_id: string
  }>
  cancel_trade: Mutation<{ target_trade: string; acting_character: string }>
}
