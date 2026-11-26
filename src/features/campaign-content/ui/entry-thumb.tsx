import { useQuery } from '@tanstack/react-query'
import { PawPrint, ScrollText, Shield, Sparkles, Swords } from 'lucide-react'
import { creatureArtQuery, creatureArtUrl } from '@/features/bestiary'
import { isPackImagePath, packImageOptions } from '@/shared/api/pack-images'
import { ItemMedia } from '@/shared/ui/kit/item'
import { artUrl } from '@/shared/ui/art-url'

// The classes the app has a painted emblem for. Kept here: importing the characters feature
// from this panel closes an import cycle through campaigns and inventory.
const paintedClasses = new Set([
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
])

const glyph = { creature: PawPrint, spell: Sparkles, class: Shield, item: Swords } as const

/**
 * RYT-184: the picture beside an entry: its own (published with the pack), else the app's painting
 * of an SRD creature, class or item category, else a glyph of its kind. Decorative.
 */
export function EntryThumb({
  entry,
  userId,
}: {
  entry: { kind: string; key: string; index: Record<string, unknown> }
  userId: string | undefined
}) {
  const own = isPackImagePath(entry.index.image) ? entry.index.image : null
  const signed = useQuery(packImageOptions(userId, own))
  const credits = useQuery({ ...creatureArtQuery(), enabled: entry.kind === 'creature' })
  const srd = !entry.key.includes('--')
  let src: string | null = own ? (signed.data ?? null) : null
  if (!own) {
    if (entry.kind === 'creature' && srd && credits.data?.[entry.key])
      src = creatureArtUrl(entry.key, 'thumb')
    else if (entry.kind === 'class' && srd && paintedClasses.has(entry.key))
      src = artUrl(`classes/thumbs/${entry.key}`)
    else if (entry.kind === 'item' && typeof entry.index.category === 'string')
      src = artUrl(`items/thumbs/${entry.index.category}`)
  }
  const Glyph = (glyph as Record<string, typeof ScrollText>)[entry.kind] ?? ScrollText
  return (
    <ItemMedia
      variant="image"
      aria-hidden="true"
      className="tw:size-11 tw:rounded-sm tw:border tw:border-border tw:bg-muted tw:text-muted-foreground"
    >
      {src ? (
        <img src={src} alt="" width={44} height={44} loading="lazy" decoding="async" />
      ) : (
        <Glyph className="tw:size-5" aria-hidden="true" />
      )}
    </ItemMedia>
  )
}
