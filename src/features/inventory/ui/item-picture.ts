import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { itemImageQuery } from '../api'

/**
 * RYT-098: whether an item has a picture to show (its signed address arrived), so a row can take the
 * picture out of its own button and let it open the viewer. Shares the query with ItemIcon.
 */
export function useItemPicture(imagePath: string | null | undefined) {
  const { state } = useAuth()
  return Boolean(useQuery(itemImageQuery(state.user?.id, imagePath)).data)
}
