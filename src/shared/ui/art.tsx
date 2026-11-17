import './art.css'
import { artUrl } from './art-url'

type ArtPlateProps = {
  /** Path under `public/art` without extension. */
  name: string
  /** Rendered width in px; the plate is square unless `ratio` is given. */
  size?: number
  /** CSS aspect-ratio for wide scenes, e.g. `16 / 9`; the plate then fills its container width. */
  ratio?: string
  /** Illustrations are decorative by default; pass text only when the picture carries meaning. */
  alt?: string
  round?: boolean
  className?: string
}

/** A painted illustration framed like a print: decorative, lazy and never layout-shifting. */
export function ArtPlate({ name, size, ratio, alt = '', round = false, className }: ArtPlateProps) {
  return (
    <img
      src={artUrl(name)}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={['art-plate', round ? 'art-plate-round' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      style={
        ratio ? { aspectRatio: ratio, width: '100%' } : { width: size ?? 160, height: size ?? 160 }
      }
    />
  )
}
