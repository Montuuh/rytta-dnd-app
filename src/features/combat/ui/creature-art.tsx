import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import {
  ActionIcon,
  Anchor,
  Button,
  Loader,
  Menu,
  Modal,
  Group,
  Text,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, ImagePlus, Pencil, RotateCcw, Trash2, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  creatureArtQuery,
  creatureArtUrl,
  type CreatureArt,
  type CreatureType,
} from '@/features/bestiary'
import { usePhone } from '@/shared/ui/use-viewport'
import { combatImageQuery, useCombatAction, useCreatureImageUpload } from '../api'
import type { Combatant } from '../domain/combat'
import { typeGlyphs } from './bestiary-glyphs'
import { toSquareWebp } from './square-image'
import { CombatantToken, Token } from './token'

/** Where a new image is attached: a campaign creature (with its revision) or an SRD creature. */
export type ArtTarget = { templateId: string; revision: number } | { srdId: string }

/**
 * What the last save or removal said, and whether focus should follow it. The stat block keeps it:
 * the first image of a campaign creature turns the token beside the name into the plate above it
 * (RYT-088), which mounts the control again, and the notice and the focus must survive that move.
 */
export type ArtNotice = { text: string; refocus: boolean }

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
 * The creature's image at the head of its stat block (RYT-053, ADR 030). With an image it is a plate
 * (RYT-088): tapping the print opens the viewer with its credit, and the pencil in the corner changes
 * it, or opens a short menu to change it and restore the bundled art (SRD creature with the DM's own
 * image) or remove it (campaign creature). Without any image the token is the file picker itself, as
 * before (RYT-043). The private image wins over the bundled art; a campaign copy of an SRD creature
 * shows that creature's art until the DM chooses another image.
 */
export function CreatureArtControl({
  campaignId,
  name,
  side,
  type,
  target,
  imagePath,
  art,
  credit,
  notice,
  onNotice,
  onViewing,
}: {
  campaignId: string
  name: string
  side: 'enemy' | 'ally'
  type: CreatureType | null
  target: ArtTarget
  /** The private image: the campaign creature's own, or the DM's image of an SRD creature. */
  imagePath: string | null
  /** Bundled art of the SRD creature (or of the one a campaign creature was copied from). */
  art: { thumb: string; full: string } | null
  credit: CreatureArt | null
  notice: ArtNotice | null
  onNotice: (notice: ArtNotice | null) => void
  /** The viewer or the remove question opened or closed: a sheet underneath leaves Escape to it. */
  onViewing?: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const edit = useRef<HTMLButtonElement>(null)
  const upload = useCreatureImageUpload(campaignId)
  const action = useCombatAction(campaignId)
  const [unreadable, setUnreadable] = useState(false)
  const [viewing, setViewingState] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // What the last request did, so a failure names it (saving or removing).
  const [lastOp, setLastOp] = useState<'save' | 'clear'>('save')
  const reportViewing = useRef(onViewing)
  useEffect(() => {
    reportViewing.current = onViewing
  })
  const setViewing = setViewingState
  // While the viewer or the remove question is open, a sheet underneath leaves Escape to it; leaving
  // with one open (another creature, or the sheet closes) hands Escape back.
  const overlay = viewing || confirming
  useEffect(() => {
    reportViewing.current?.(overlay)
    if (!overlay) return
    return () => reportViewing.current?.(false)
  }, [overlay])
  const failed = unreadable || upload.isError || action.isError
  const pending = upload.isPending || action.isPending
  const srd = 'srdId' in target
  const hasImage = Boolean(imagePath) || Boolean(art)
  const glyph = type ? typeGlyphs[type] : undefined
  const plate = usePlateImage(imagePath, art?.full ?? null)
  // After a save the control may change shape (picker <-> plate, pencil <-> menu), or mount again in
  // the plate's place: focus follows it once.
  useEffect(() => {
    if (!notice?.refocus) return
    ;(hasImage ? edit.current : input.current)?.focus()
    onNotice({ text: notice.text, refocus: false })
  })

  const choose = async (file: File | undefined) => {
    if (!file) return
    setUnreadable(false)
    onNotice(null)
    upload.reset()
    action.reset()
    setLastOp('save')
    let image: Blob
    try {
      image = await toSquareWebp(file)
    } catch {
      setUnreadable(true)
      return
    }
    // The promise, not mutate's callbacks: the first image turns the token into the plate, which can
    // mount this control again before they would run. Failures show through the mutation's state.
    upload.mutateAsync({ target, image }).then(
      () => onNotice({ text: t('combat.image.saved', { name }), refocus: true }),
      () => undefined,
    )
  }
  const clear = () => {
    onNotice(null)
    upload.reset()
    action.reset()
    setLastOp('clear')
    // Removing a campaign creature's only image turns the plate back into the token: as above.
    action
      .mutateAsync(
        'srdId' in target
          ? { kind: 'srdImage', srdId: target.srdId, path: null }
          : {
              kind: 'templateImage',
              templateId: target.templateId,
              revision: target.revision,
              path: null,
            },
      )
      .then(
        () =>
          onNotice({
            text: t(srd ? 'bestiary.art.restored' : 'bestiary.art.removed', { name }),
            refocus: true,
          }),
        () => undefined,
      )
  }
  // Overlays give focus back to what opened them: the viewer to the print, the remove question to
  // the pencil; both outlive them.
  const refocus = () => window.setTimeout(() => trigger.current?.focus(), 0)
  const refocusEdit = () => window.setTimeout(() => edit.current?.focus(), 0)

  const pencil = (
    <ActionIcon
      ref={edit}
      className="bst-plate-edit"
      variant="default"
      radius="xl"
      size={44}
      // Busy, not disabled: a disabled button would drop the focus while the image saves.
      data-disabled={pending || undefined}
      aria-disabled={pending || undefined}
      aria-label={t('bestiary.art.edit', { name })}
      aria-describedby={failed ? errorId : undefined}
      // Without the DM's own image the only choice is a new file: the pencil opens it directly.
      onClick={imagePath || pending ? undefined : () => input.current?.click()}
    >
      {pending ? <Loader size={16} /> : <Pencil size={18} aria-hidden="true" />}
    </ActionIcon>
  )

  return (
    <div className={hasImage ? 'combat-creature-image is-plate' : 'combat-creature-image'}>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept="image/webp,image/png,image/jpeg"
        className="visually-hidden combat-image-input"
        disabled={pending}
        // Without an image the input is the control (its label is the token); with one it is only
        // reached through the menu, so it leaves the tab order.
        tabIndex={hasImage ? -1 : undefined}
        aria-hidden={hasImage || undefined}
        aria-label={t('combat.image.add', { name })}
        aria-describedby={failed ? errorId : undefined}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          void choose(file)
        }}
      />
      {hasImage ? (
        <ArtPlate
          name={name}
          src={plate.src}
          loading={plate.loading}
          glyph={glyph}
          openRef={trigger}
          onOpen={() => setViewing(true)}
          onError={plate.fail}
        >
          {imagePath ? (
            <Menu position="bottom-end" withinPortal zIndex={420} returnFocus>
              <Menu.Target>{pencil}</Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<ImagePlus size={16} aria-hidden="true" />}
                  disabled={pending}
                  onClick={() => input.current?.click()}
                >
                  {t('bestiary.art.change')}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  // The theme's own danger colour: Mantine's red fails AA on the light menu.
                  className={srd ? undefined : 'bst-menu-danger'}
                  leftSection={
                    srd ? (
                      <RotateCcw size={16} aria-hidden="true" />
                    ) : (
                      <Trash2 size={16} aria-hidden="true" />
                    )
                  }
                  disabled={pending}
                  // Removing a campaign creature's only image asks first; restoring SRD art does not.
                  onClick={srd ? clear : () => setConfirming(true)}
                >
                  {t(
                    srd
                      ? art
                        ? 'bestiary.art.restore'
                        : 'bestiary.art.removeOwn'
                      : 'bestiary.art.removeAsk',
                  )}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            pencil
          )}
        </ArtPlate>
      ) : (
        <label
          htmlFor={inputId}
          className="combat-image-picker"
          data-pending={pending || undefined}
          title={t('combat.image.add', { name })}
        >
          <Token
            name={name}
            side={side}
            imageKind="creature"
            path={null}
            size={64}
            glyph={glyph}
            described
          >
            <span className="combat-image-seal" aria-hidden="true">
              {pending ? (
                <Loader size={14} color="currentColor" />
              ) : (
                <ImagePlus size={16} strokeWidth={2.25} />
              )}
            </span>
          </Token>
        </label>
      )}
      <Text role="status" size="sm" className="combat-image-status">
        {pending ? t('combat.image.saving') : (notice?.text ?? '')}
      </Text>
      {failed && (
        <Text id={errorId} role="alert" size="sm" className="combat-image-error">
          {t(
            unreadable
              ? 'combat.image.unreadable'
              : lastOp === 'clear'
                ? 'bestiary.art.clearFailed'
                : 'combat.image.failed',
          )}
        </Text>
      )}
      {confirming && (
        <Modal
          opened
          onClose={() => {
            setConfirming(false)
            refocusEdit()
          }}
          zIndex={430}
          title={t('bestiary.art.removeTitle', { name })}
          closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
        >
          <Text>{t(art ? 'bestiary.art.removeBodyArt' : 'bestiary.art.removeBody')}</Text>
          <Group justify="flex-end" mt="lg" className="bst-dialog-actions">
            <Button
              variant="subtle"
              data-autofocus
              onClick={() => {
                setConfirming(false)
                refocusEdit()
              }}
            >
              {t('action.cancel')}
            </Button>
            <Button
              color="red"
              variant="light"
              leftSection={<Trash2 size={16} aria-hidden="true" />}
              onClick={() => {
                setConfirming(false)
                refocusEdit()
                clear()
              }}
            >
              {t('bestiary.art.remove')}
            </Button>
          </Group>
        </Modal>
      )}
      {viewing && (
        <ArtViewer
          name={name}
          imagePath={imagePath}
          art={art}
          credit={credit}
          srd={srd}
          onChange={() => {
            setViewing(false)
            refocus()
            input.current?.click()
          }}
          onClose={() => {
            setViewing(false)
            refocus()
          }}
        />
      )}
    </div>
  )
}

/**
 * The image at full size on a matted plate, with a museum-style label beneath: the creature's name
 * and, for bundled art, its author, licence and source (the attribution the licence asks for). One
 * quiet action where the image can be changed. Escape and the close button return focus to the plate.
 */
function ArtViewer({
  name,
  imagePath,
  art,
  credit,
  srd,
  onChange,
  onClose,
}: {
  name: string
  imagePath: string | null
  art: { thumb: string; full: string } | null
  /** The bundled art's credit, shown whenever the bundled art is what the viewer shows. */
  credit: CreatureArt | null
  srd: boolean
  /** Opens the file picker; omitted where the image is only viewed (the combat portrait). */
  onChange?: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const { state } = useAuth()
  const own = useQuery(combatImageQuery(state.user?.id ?? 'anonymous', 'creature', imagePath))
  const [broken, setBroken] = useState<string | null>(null)
  // The private image when it can be read; otherwise the bundled art, as the token does.
  const ownFailed = own.isError || (own.data !== undefined && broken === own.data)
  const showingOwn = Boolean(imagePath) && !ownFailed
  const src = showingOwn ? own.data : art?.full
  const loading = showingOwn && own.isPending
  const unavailable = !src || broken === src
  const external = <VisuallyHidden>{t('bestiary.art.newTab')}</VisuallyHidden>
  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen={phone}
      size="xl"
      zIndex={430}
      returnFocus={false}
      title={<span className="bst-art-title">{name}</span>}
      classNames={{ content: 'bst-art-viewer', body: 'bst-art-body' }}
      closeButtonProps={{ 'aria-label': t('bestiary.art.close'), size: 44 }}
    >
      <figure className="bst-art-figure">
        <div className="bst-art-plate" aria-busy={loading || undefined}>
          {loading ? (
            <span role="status">
              <Loader />
              <VisuallyHidden>{t('bestiary.art.loading')}</VisuallyHidden>
            </span>
          ) : unavailable ? (
            <Text className="bst-art-missing">{t('bestiary.art.unavailable')}</Text>
          ) : (
            // Photo corners hold the print itself, not the mat around it.
            <span className="bst-art-photo">
              <img
                src={src}
                alt={t('combat.image.creature', { name })}
                // Uploads are 512px squares; bundled art carries its own size.
                width={showingOwn ? 512 : credit?.width}
                height={showingOwn ? 512 : credit?.height}
                decoding="async"
                draggable={false}
                onError={() => setBroken(src ?? null)}
              />
              <span className="bst-art-corner is-tl" aria-hidden="true" />
              <span className="bst-art-corner is-tr" aria-hidden="true" />
              <span className="bst-art-corner is-bl" aria-hidden="true" />
              <span className="bst-art-corner is-br" aria-hidden="true" />
            </span>
          )}
        </div>
        <figcaption className="bst-art-label">
          {!showingOwn && credit ? (
            <>
              <dl>
                <div>
                  <dt>{t('bestiary.art.author')}</dt>
                  <dd>{credit.author}</dd>
                </div>
                <div>
                  <dt>{t('bestiary.art.license')}</dt>
                  <dd>
                    {credit.licenseUrl ? (
                      <Anchor href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">
                        {credit.license}
                        <ExternalLink size={14} aria-hidden="true" />
                        {external}
                      </Anchor>
                    ) : (
                      credit.license
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t('bestiary.art.source')}</dt>
                  <dd>
                    <Anchor href={credit.source} target="_blank" rel="noopener noreferrer">
                      {t(`bestiary.art.origin.${credit.origin}`)}
                      <ExternalLink size={14} aria-hidden="true" />
                      {external}
                    </Anchor>
                  </dd>
                </div>
              </dl>
              <Text size="sm" c="dimmed" className="bst-art-note">
                {t(
                  credit.origin === 'generated' ? 'bestiary.art.generated' : 'bestiary.art.adapted',
                )}
              </Text>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              {t(srd ? 'bestiary.art.ownSrd' : 'bestiary.art.own')}
            </Text>
          )}
        </figcaption>
      </figure>
      {onChange && (
        <div className="bst-art-actions">
          <Button
            variant="light"
            leftSection={<ImagePlus size={16} aria-hidden="true" />}
            onClick={onChange}
          >
            {t('bestiary.art.change')}
          </Button>
        </div>
      )}
    </Modal>
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
  const path = combatant.image_path ?? null
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
          art={art}
          credit={credit}
          srd={Boolean(srdId)}
          onClose={() => {
            setViewing(false)
            window.setTimeout(() => open.current?.focus(), 0)
          }}
        />
      )}
    </>
  )
}
