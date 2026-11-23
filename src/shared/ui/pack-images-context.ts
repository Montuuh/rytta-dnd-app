import { createContext, useContext } from 'react'
import { noPackImages, type PackImages } from '@/shared/api/pack-images'

/** RYT-172: the open campaign's pack pictures; empty outside a campaign or before they load. */
export const PackImagesContext = createContext<PackImages>(noPackImages)

/** The pack picture path of one creature, item or class, by the id the app uses. */
export function usePackImagePath(kind: keyof PackImages, id: string | null | undefined) {
  const images = useContext(PackImagesContext)
  return id ? (images[kind].get(id) ?? null) : null
}
