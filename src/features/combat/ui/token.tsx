import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Castle,
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
import { creatureArtQuery, creatureArtUrl, type CreatureArt } from '@/features/bestiary'
import { combatImageQuery } from '../api'
import { monogram, type Combatant, type HpBand } from '../domain/combat'
import { ArtViewer } from './art-viewer'

type TokenSide = 'party' | 'ally' | 'enemy' | 'lair'

/**
 * A combatant's token (RYT-043): the portrait or creature image cut to the shape of its side, like a
 * miniature's base. Party tokens are round, allies are rounded squares, enemies are hexagons and the
 * lair is a crenellated keep, so the side reads by shape as well as by the ring's colour. Without an
 * image (or when it cannot load) the token shows an engraved monogram, or the keep glyph for the
 * lair; both are decorative because the name is always printed next to the token.
 *
 * RYT-098: a viewable token that shows a picture is its own button (at least 44px to the touch)
 * that opens the viewer; monograms and glyphs never are. Only where it sits outside another control.
 */
export function Token({
  name,
  side,
  imageKind,
  path,
  art,
  size,
  active = false,
  defeated = false,
  hidden = false,
  described = false,
  children,
  glyph: Glyph,
  viewable = false,
  fullArt,
  credit,
}: {
  /** The image is the subject here (not just beside the printed name): give it alt text. */
  described?: boolean
  name: string
  side: TokenSide
  /** Which private bucket holds `path`. */
  imageKind: 'character' | 'creature'
  path: string | null | undefined
  /** RYT-053: public bundled art shown when there is no private image (or it cannot load). */
  art?: string | null
  /** Pixels; omit to let the layout's --token-size decide. */
  size?: number
  active?: boolean
  defeated?: boolean
  /** DM only: the combatant is hidden from Players. */
  hidden?: boolean
  /** Overlay (the bestiary's change-image affordance). */
  children?: ReactNode
  /** Without an image, a glyph instead of the monogram (the bestiary list: creature type). */
  glyph?: LucideIcon
  /** The picture opens the viewer (not inside another control). */
  viewable?: boolean
  /** The bundled art at full size for the viewer; the token shows the thumbnail. */
  fullArt?: string | null
  /** The bundled art's credit, shown in the viewer under it. */
  credit?: CreatureArt | null
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const url = useQuery(combatImageQuery(state.user?.id ?? 'anonymous', imageKind, path ?? null))
  const [failed, setFailed] = useState<string | null>(null)
  const own = url.data && failed !== url.data ? url.data : null
  // The bundled art stands in when there is no private image or it cannot be read.
  const ownGone = !path || url.isError || (url.data !== undefined && failed === url.data)
  const src = own ?? (art && ownGone && failed !== art ? art : null)
  const [viewing, setViewing] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const open = viewable && Boolean(src)
  const Root = open ? 'button' : 'span'
  const token = (
    <Root
      ref={open ? opener : undefined}
      className={[
        'combat-token',
        `shape-${side}`,
        active ? 'is-active' : '',
        defeated ? 'is-defeated' : '',
        hidden ? 'is-hidden' : '',
        open ? 'combat-token-open' : '',
      ].join(' ')}
      // Without a size the surrounding layout sets --token-size (the table banner scales it).
      style={size ? ({ '--token-size': `${size}px` } as CSSProperties) : undefined}
      {...(open && {
        type: 'button' as const,
        'aria-haspopup': 'dialog' as const,
        'aria-label': t(
          imageKind === 'character' ? 'inventory.portrait.open' : 'bestiary.art.open',
          {
            name,
          },
        ),
        onClick: () => setViewing(true),
      })}
    >
      <span className="combat-token-ring" aria-hidden="true" />
      <span className="combat-token-face">
        {src ? (
          <img
            src={src}
            // Next to a printed name the image adds nothing for screen readers (empty alt); where
            // the image is the subject (detail, bestiary) it is described. A button names itself.
            alt={
              described && !open
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
        ) : side === 'lair' ? (
          // A place has no initials: the keep glyph (RYT-043 F6).
          <Castle className="combat-token-glyph" aria-hidden="true" strokeWidth={2} />
        ) : Glyph ? (
          <Glyph className="combat-token-glyph" aria-hidden="true" strokeWidth={2} />
        ) : (
          <span className="combat-token-monogram" aria-hidden="true">
            {monogram(name)}
          </span>
        )}
      </span>
      {children}
    </Root>
  )
  if (!open) return token
  return (
    <>
      {token}
      {viewing && (
        <ArtViewer
          name={name}
          imageKind={imageKind}
          imagePath={path}
          art={fullArt ?? art}
          credit={credit}
          returnFocus={opener}
          onClose={() => setViewing(false)}
        />
      )}
    </>
  )
}

/** The token of a combatant in the order, the banner, the detail or the recap. */
export function CombatantToken({
  combatant,
  size,
  showActive = true,
  described = false,
  viewable = false,
}: {
  combatant: Combatant
  size?: number
  showActive?: boolean
  described?: boolean
  /** RYT-098: a picture opens the viewer (only outside another control). */
  viewable?: boolean
}) {
  // The DM's projection names the SRD creature an NPC came from: its bundled art stands in for a
  // missing image (RYT-053). Players and the table never receive srd_id, so they keep the monogram.
  const srdId = combatant.kind === 'npc' ? combatant.srd_id : undefined
  const credits = useQuery({ ...creatureArtQuery(), enabled: Boolean(srdId) })
  const credit = (srdId && credits.data?.[srdId]) || null
  const art = srdId && credit ? creatureArtUrl(srdId, 'thumb') : null
  return (
    <Token
      name={combatant.name}
      side={combatant.kind === 'lair' ? 'lair' : combatant.side}
      imageKind={combatant.kind === 'character' ? 'character' : 'creature'}
      path={combatant.kind === 'lair' ? null : combatant.image_path}
      art={art}
      size={size}
      active={showActive && combatant.is_active}
      defeated={combatant.defeated || combatant.hp_band === 'down'}
      hidden={combatant.hidden === true}
      described={described}
      viewable={viewable}
      fullArt={srdId && credit ? creatureArtUrl(srdId, 'full') : null}
      credit={credit}
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
        <Icon size={large && band !== 'unknown' ? 22 : 16} strokeWidth={2.25} />
      </span>
      <span className="combat-band-word">{word}</span>
    </span>
  )
}
