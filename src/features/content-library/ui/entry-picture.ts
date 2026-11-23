import { useQuery } from '@tanstack/react-query'
import { creatureArtQuery, creatureArtUrl } from '@/features/bestiary'
import { classEmblem } from '@/features/characters'
import { artUrl } from '@/shared/ui/art-url'
import { indexOf } from '../domain/forms'
import type { EntryInput } from '../domain/library'

/** RYT-172: the kinds whose entries carry a picture (owner choice P1 A). */
// Subclasses are drawn nowhere in the app, so they take no picture of their own.
export const pictureKinds = ['creature', 'item', 'class'] as const
export const hasPicture = (kind: string) => (pictureKinds as readonly string[]).includes(kind)

export type PictureOrigin = 'pack' | 'app' | 'category' | 'none'

/**
 * Where an entry's picture comes from when it carries none: the app's painting of an SRD
 * creature or class, or an item's category painting. Pack entries (`--` in the key) have none.
 */
export function useAppPicture(entry: EntryInput, size: 'thumb' | 'full' = 'thumb') {
  const credits = useQuery({ ...creatureArtQuery(), enabled: entry.kind === 'creature' })
  const srd = !entry.key.includes('--')
  if (entry.kind === 'creature' && srd && credits.data?.[entry.key])
    return { src: creatureArtUrl(entry.key, size), origin: 'app' as PictureOrigin }
  if (entry.kind === 'class' && srd) {
    const emblem = classEmblem(entry.key)
    if (emblem)
      return { src: size === 'thumb' ? emblem.thumb : emblem.full, origin: 'app' as PictureOrigin }
  }
  const category = indexOf(entry.data).category
  if (entry.kind === 'item' && typeof category === 'string')
    return { src: artUrl(`items/thumbs/${category}`), origin: 'category' as PictureOrigin }
  return { src: null, origin: 'none' as PictureOrigin }
}
