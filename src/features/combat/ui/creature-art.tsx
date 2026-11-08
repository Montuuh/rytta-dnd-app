import { useEffect, useId, useRef, useState } from 'react'
import {
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
import { ExternalLink, Eye, ImageIcon, ImagePlus, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import type { CreatureArt, CreatureType } from '@/features/bestiary'
import { usePhone } from '@/shared/ui/use-viewport'
import { combatImageQuery, useCombatAction, useCreatureImageUpload } from '../api'
import { typeGlyphs } from './bestiary-glyphs'
import { toSquareWebp } from './square-image'
import { Token } from './token'

/** Where a new image is attached: a campaign creature (with its revision) or an SRD creature. */
export type ArtTarget = { templateId: string; revision: number } | { srdId: string }

/**
 * The creature's token at the head of its stat block (RYT-053, ADR 030). With an image, tapping it
 * opens a short menu anchored to the token: view the image (a matted plate with its credit), change
 * it, and restore the bundled art (SRD creature with the DM's own image) or remove it (campaign
 * creature). Without any image the token is the file picker itself, as before (RYT-043). The private
 * image wins over the bundled art; a campaign copy of an SRD creature shows that creature's art until
 * the DM chooses another image.
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
  /** The viewer or the remove question opened or closed: a sheet underneath leaves Escape to it. */
  onViewing?: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const upload = useCreatureImageUpload(campaignId)
  const action = useCombatAction(campaignId)
  const [unreadable, setUnreadable] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
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
  // After a save the control may change shape (picker <-> menu button): focus follows it.
  const refocusAfterSave = useRef(false)
  const failed = unreadable || upload.isError || action.isError
  const pending = upload.isPending || action.isPending
  const srd = 'srdId' in target
  const hasImage = Boolean(imagePath) || Boolean(art)
  const glyph = type ? typeGlyphs[type] : undefined
  useEffect(() => {
    if (!refocusAfterSave.current) return
    refocusAfterSave.current = false
    ;(hasImage ? trigger.current : input.current)?.focus()
  })

  const choose = async (file: File | undefined) => {
    if (!file) return
    setUnreadable(false)
    setNotice(null)
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
    upload.mutate(
      { target, image },
      {
        onSuccess: () => {
          refocusAfterSave.current = true
          setNotice(t('combat.image.saved', { name }))
        },
      },
    )
  }
  const clear = () => {
    setNotice(null)
    upload.reset()
    action.reset()
    setLastOp('clear')
    action.mutate(
      'srdId' in target
        ? { kind: 'srdImage', srdId: target.srdId, path: null }
        : {
            kind: 'templateImage',
            templateId: target.templateId,
            revision: target.revision,
            path: null,
          },
      {
        onSuccess: () => {
          refocusAfterSave.current = true
          setNotice(t(srd ? 'bestiary.art.restored' : 'bestiary.art.removed', { name }))
        },
      },
    )
  }
  // Overlays opened from the menu give focus back to the token, which outlives them.
  const refocus = () => window.setTimeout(() => trigger.current?.focus(), 0)

  const token = (
    <Token
      name={name}
      side={side}
      imageKind="creature"
      path={imagePath}
      art={art?.thumb}
      size={64}
      glyph={glyph}
      described
    >
      <span className={`combat-image-seal${hasImage ? ' is-quiet' : ''}`} aria-hidden="true">
        {pending ? (
          <Loader size={14} color="currentColor" />
        ) : hasImage ? (
          <ImageIcon size={14} strokeWidth={2.25} />
        ) : (
          <ImagePlus size={16} strokeWidth={2.25} />
        )}
      </span>
    </Token>
  )

  return (
    <div className="combat-creature-image">
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
        <Menu position="bottom-start" withinPortal zIndex={420} returnFocus>
          <Menu.Target>
            <UnstyledButton
              ref={trigger}
              className="combat-image-picker"
              data-pending={pending || undefined}
              aria-label={t('bestiary.art.trigger', { name })}
              aria-describedby={failed ? errorId : undefined}
            >
              {token}
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Eye size={16} aria-hidden="true" />}
              onClick={() => setViewing(true)}
            >
              {t('bestiary.art.view')}
            </Menu.Item>
            <Menu.Item
              leftSection={<ImagePlus size={16} aria-hidden="true" />}
              disabled={pending}
              onClick={() => input.current?.click()}
            >
              {t('bestiary.art.change')}
            </Menu.Item>
            {imagePath && (
              <>
                <Menu.Divider />
                <Menu.Item
                  color={srd ? undefined : 'red'}
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
              </>
            )}
          </Menu.Dropdown>
        </Menu>
      ) : (
        <label
          htmlFor={inputId}
          className="combat-image-picker"
          data-pending={pending || undefined}
          title={t('combat.image.add', { name })}
        >
          {token}
        </label>
      )}
      <Text role="status" size="sm" className="combat-image-status">
        {pending ? t('combat.image.saving') : (notice ?? '')}
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
            refocus()
          }}
          zIndex={430}
          title={t('bestiary.art.removeTitle', { name })}
          closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
        >
          <Text>{t(art ? 'bestiary.art.removeBodyArt' : 'bestiary.art.removeBody')}</Text>
          <Group justify="flex-end" mt="lg" className="bst-dialog-actions">
            <Button
              variant="subtle"
              onClick={() => {
                setConfirming(false)
                refocus()
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
                refocus()
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
 * quiet action: change the image. Escape and the close button return focus to the token.
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
  onChange: () => void
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
      <div className="bst-art-actions">
        <Button
          variant="light"
          leftSection={<ImagePlus size={16} aria-hidden="true" />}
          onClick={onChange}
        >
          {t('bestiary.art.change')}
        </Button>
      </div>
    </Modal>
  )
}
