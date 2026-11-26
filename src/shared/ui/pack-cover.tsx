import { useQuery } from '@tanstack/react-query'
import { isPackImagePath, packImageOptions } from '@/shared/api/pack-images'
import { cn } from '@/shared/lib/cn'
import { Skeleton } from '@/shared/ui/kit/skeleton'

/**
 * RYT-184: a pack's cover, drawn like the front of a book. `path` is what the content reads
 * answer (the painted cover, or a picture of the pack's content); without one the pack shows
 * its initial. Decorative: the pack's name is always beside it.
 */
export function PackCover({
  path,
  title,
  userId,
  size = 'md',
  className,
}: {
  path: string | null | undefined
  title: string
  userId: string | undefined
  /** `md` is the card cover (44 by 56), `sm` a 32px mark for rows and notices. */
  size?: 'sm' | 'md'
  className?: string
}) {
  const valid = isPackImagePath(path) ? path : null
  const signed = useQuery(packImageOptions(userId, valid))
  const frame = cn(
    'tw:shrink-0 tw:overflow-hidden tw:border tw:border-border tw:bg-muted',
    size === 'md' ? 'tw:h-14 tw:w-11 tw:rounded-sm' : 'tw:size-8 tw:rounded-sm',
    className,
  )
  if (valid && signed.isPending) return <Skeleton data-slot="pack-cover" className={frame} />
  if (valid && signed.data)
    return (
      <img
        data-slot="pack-cover"
        src={signed.data}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn(frame, 'tw:object-cover')}
      />
    )
  return (
    <span
      data-slot="pack-cover"
      aria-hidden="true"
      className={cn(
        frame,
        'tw:grid tw:place-items-center tw:font-heading tw:text-primary',
        size === 'md' ? 'tw:text-xl' : 'tw:text-base',
      )}
    >
      {title.trim().charAt(0).toUpperCase()}
    </span>
  )
}
