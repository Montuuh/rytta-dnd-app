import { useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Droplets,
  EyeOff,
  Heart,
  HeartCrack,
  HeartMinus,
  HeartOff,
  Skull,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { combatImageQuery } from '../api'
import { monogram, type Combatant, type HpBand } from '../domain/combat'

type TokenSide = 'party' | 'ally' | 'enemy' | 'lair'

/**
 * A combatant's token (RYT-043): the portrait or creature image cut to the shape of its side, like a
 * miniature's base. Party tokens are round, allies are rounded squares, enemies are hexagons and the
 * lair is a square keep, so the side reads by shape as well as by the ring's colour. Without an image
 * (or when it cannot load) the token shows an engraved monogram. The image carries alt text; the
 * monogram is decorative because the name is always printed next to it.
 */
export function Token({
  name,
  side,
  imageKind,
  path,
  size,
  active = false,
  defeated = false,
  hidden = false,
  described = false,
  children,
}: {
  /** The image is the subject here (not just beside the printed name): give it alt text. */
  described?: boolean
  name: string
  side: TokenSide
  /** Which private bucket holds `path`. */
  imageKind: 'character' | 'creature'
  path: string | null | undefined
  /** Pixels; omit to let the layout's --token-size decide. */
  size?: number
  active?: boolean
  defeated?: boolean
  /** DM only: the combatant is hidden from Players. */
  hidden?: boolean
  /** Overlay (the bestiary's change-image affordance). */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const url = useQuery(combatImageQuery(state.user?.id ?? 'anonymous', imageKind, path ?? null))
  const [failed, setFailed] = useState<string | null>(null)
  const src = url.data && failed !== url.data ? url.data : null
  return (
    <span
      className={[
        'combat-token',
        `shape-${side}`,
        active ? 'is-active' : '',
        defeated ? 'is-defeated' : '',
        hidden ? 'is-hidden' : '',
      ].join(' ')}
      // Without a size the surrounding layout sets --token-size (the table banner scales it).
      style={size ? ({ '--token-size': `${size}px` } as CSSProperties) : undefined}
    >
      <span className="combat-token-ring" aria-hidden="true" />
      <span className="combat-token-face">
        {src ? (
          <img
            src={src}
            // Next to a printed name the image adds nothing for screen readers (empty alt); where
            // the image is the subject (detail, bestiary) it is described.
            alt={
              described
                ? t(imageKind === 'character' ? 'combat.image.portrait' : 'combat.image.creature', {
                    name,
                  })
                : ''
            }
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(src)}
          />
        ) : (
          <span className="combat-token-monogram" aria-hidden="true">
            {monogram(name)}
          </span>
        )}
      </span>
      {children}
    </span>
  )
}

/** The token of a combatant in the order, the banner, the detail or the recap. */
export function CombatantToken({
  combatant,
  size,
  showActive = true,
  described = false,
}: {
  combatant: Combatant
  size?: number
  showActive?: boolean
  described?: boolean
}) {
  return (
    <Token
      name={combatant.name}
      side={combatant.kind === 'lair' ? 'lair' : combatant.side}
      imageKind={combatant.kind === 'character' ? 'character' : 'creature'}
      path={combatant.kind === 'lair' ? null : combatant.image_path}
      size={size}
      active={showActive && combatant.is_active}
      defeated={combatant.defeated || combatant.hp_band === 'down'}
      hidden={combatant.hidden === true}
      described={described}
    />
  )
}

const bandIcons: Record<HpBand, LucideIcon> = {
  unhurt: Heart,
  wounded: HeartMinus,
  bloodied: Droplets,
  critical: HeartCrack,
  down: HeartOff,
  unknown: EyeOff,
}

/**
 * Health without numbers (RYT-043): a wax seal holding a glyph for the band, then the band's name.
 * Each band has its own glyph and word, so it never depends on colour. Used wherever exact hit
 * points are not visible; it is deliberately not a bar, because a bar would suggest precision.
 */
export function BandMark({
  band,
  word,
  defeated = false,
  large = false,
}: {
  band: HpBand
  /** The printed word (Defeated / Dead override the band's own name). */
  word: string
  defeated?: boolean
  large?: boolean
}) {
  const Icon = defeated ? Skull : bandIcons[band]
  return (
    <span className={`combat-band band-${defeated ? 'defeated' : band}${large ? ' is-large' : ''}`}>
      <span className="combat-band-seal" aria-hidden="true">
        <Icon size={large ? 22 : 16} strokeWidth={2.25} />
      </span>
      <span className="combat-band-word">{word}</span>
    </span>
  )
}
