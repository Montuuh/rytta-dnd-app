import { useRef, useState, type ReactNode, type Ref } from 'react'
import { Loader, UnstyledButton } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { usePackImagePath } from '@/shared/ui/pack-images-context'
import { creatureArtQuery, creatureArtUrl } from '@/features/bestiary'
import { combatImageQuery } from '../api'
import type { Combatant } from '../domain/combat'
import { ArtViewer } from './art-viewer'
import { CombatantToken } from './token'

/**
 * The private image when it can be read, otherwise the bundled art (RYT-053). While the signed URL
 * of a private image is on its way the plate shows a loader in the space it keeps.
 */
function usePlateImage(imagePath: string | null, art: string | null) {
  const { state } = useAuth()
  const own = useQuery(combatImageQuery(state.user?.id ?? 'anonymous', 'creature', imagePath))
  // Every address that failed stays failed, so two broken images never swap back and forth.
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set())
  const ownGone = !imagePath || own.isError || (own.data !== undefined && broken.has(own.data))
  const loading = Boolean(imagePath) && own.isPending
  const src = !ownGone && own.data ? own.data : art && !broken.has(art) ? art : null
  const fail = (url: string) => setBroken((before) => new Set(before).add(url))
  return { src: loading ? null : src, loading, fail }
}

/**
 * RYT-088: the creature's illustration as a specimen plate, the print on a raised mat held by four
 * photo corners like the viewer. The print itself is the button that opens the viewer; an overlay
 * (the pencil) sits in the mat's corner. Without a readable image it keeps its square with the
 * creature type glyph, so nothing moves.
 */
function ArtPlate({
  name,
  src,
  loading,
  glyph: Glyph,
  small = false,
  dimmed = false,
  hidden = false,
  openRef,
  onOpen,
  onError,
  children,
}: {
  name: string
  src: string | null
  loading: boolean
  glyph?: LucideIcon
  /** The combat portrait: a smaller mat and corners. */
  small?: boolean
  /** A defeated combatant: the print fades like its token. */
  dimmed?: boolean
  /** DM only: the combatant is hidden from Players; the mat is dashed like the token's ring. */
  hidden?: boolean
  openRef?: Ref<HTMLButtonElement>
  onOpen: () => void
  onError: (src: string) => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div
      className={[
        'bst-plate',
        small ? 'is-small' : '',
        dimmed ? 'is-dimmed' : '',
        hidden ? 'is-hidden' : '',
      ].join(' ')}
      data-pending={loading || undefined}
    >
      <UnstyledButton
        ref={openRef}
        className="bst-plate-open"
        aria-haspopup="dialog"
        aria-label={t('bestiary.art.open', { name })}
        onClick={onOpen}
      >
        <span className="bst-plate-photo">
          {loading ? (
            <Loader size="sm" />
          ) : src ? (
            <img
              src={src}
              alt=""
              width={720}
              height={720}
              decoding="async"
              draggable={false}
              onError={() => onError(src)}
            />
          ) : Glyph ? (
            <Glyph className="bst-plate-glyph" aria-hidden="true" strokeWidth={1.75} />
          ) : null}
          <span className="bst-art-corner is-tl" aria-hidden="true" />
          <span className="bst-art-corner is-tr" aria-hidden="true" />
          <span className="bst-art-corner is-bl" aria-hidden="true" />
          <span className="bst-art-corner is-br" aria-hidden="true" />
        </span>
      </UnstyledButton>
      {children}
    </div>
  )
}

/**
 * RYT-088: the DM's detail of a creature in a fight opens on its portrait, a small plate that opens
 * the viewer. Only the DM's projection names the SRD creature (Players and the table never receive
 * srd_id); without any image the detail keeps the combatant's token.
 */
export function CreaturePortrait({ combatant }: { combatant: Combatant }) {
  const srdId = combatant.kind === 'npc' ? combatant.srd_id : undefined
  const credits = useQuery({ ...creatureArtQuery(), enabled: Boolean(srdId) })
  const credit = (srdId && credits.data?.[srdId]) || null
  const art =
    srdId && credit
      ? { thumb: creatureArtUrl(srdId, 'thumb'), full: creatureArtUrl(srdId, 'full') }
      : null
  // RYT-172: an NPC from a pack shows its pack picture below the campaign's own (DM view only).
  const packPath = usePackImagePath('creature', srdId)
  const path = combatant.image_path ?? packPath
  const plate = usePlateImage(path, art?.full ?? null)
  const [viewing, setViewing] = useState(false)
  const open = useRef<HTMLButtonElement>(null)
  const waiting = Boolean(srdId) && credits.isPending
  if (!path && !art && !waiting)
    return <CombatantToken combatant={combatant} size={72} showActive={false} described />
  return (
    <>
      <ArtPlate
        name={combatant.name}
        src={plate.src}
        loading={plate.loading || (waiting && !path)}
        small
        dimmed={combatant.defeated || combatant.hp_band === 'down'}
        hidden={combatant.hidden === true}
        openRef={open}
        onOpen={() => setViewing(true)}
        onError={plate.fail}
      />
      {viewing && (
        <ArtViewer
          name={combatant.name}
          imagePath={path}
          art={art?.full}
          credit={credit}
          ownNote={srdId ? 'srd' : 'campaign'}
          returnFocus={open}
          onClose={() => setViewing(false)}
        />
      )}
    </>
  )
}
