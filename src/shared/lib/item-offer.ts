import { createContext, useContext } from 'react'

export type OfferPartner = { id: string; name: string; busy: boolean }
export type ItemOfferRequest = {
  partnerId: string
  partnerName: string
  itemId: string
  quantity: number
  /** Give: the item is offered and the giver's side is sealed, so the receiver only accepts. */
  give: boolean
}
export type ItemOfferValue = {
  /** The character the viewer acts as. */
  characterId: string
  partners: OfferPartner[]
  /** Partner of the viewer's open or pending trade, if any. */
  tradingWith: string | null
  /** A request the trade layer is still waiting to place. */
  waiting: ItemOfferRequest | null
  offer: (request: ItemOfferRequest) => void
}

/**
 * RYT-149: lets an item card start a trade with one item on the table without the inventory
 * feature importing the trades feature. Provided by the trade layer where the viewer acts as a
 * character.
 */
export const ItemOfferContext = createContext<ItemOfferValue | null>(null)
export const useItemOffer = () => useContext(ItemOfferContext)
