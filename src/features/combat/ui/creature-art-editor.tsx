import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Button, Group, Loader, Menu, Text, Textarea, UnstyledButton } from '@mantine/core'
import { Modal } from '@/shared/ui/overlays'
import { ImagePlus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { artPrompt, copyArtPrompt, type ArtSubject } from '@/shared/lib/art-prompt'
import type { CreatureArt, CreatureType } from '@/features/bestiary'
import { useCombatAction, useCreatureImageUpload } from '../api'
import { ArtViewer } from './art-viewer'
import { typeGlyphs } from './bestiary-glyphs'
import { toSquareWebp } from './square-image'
import { Token } from './token'

/** Where a new image is attached: a campaign creature (with its revision) or an SRD creature. */
export type ArtTarget = { templateId: string; revision: number } | { srdId: string }

/**
 * What the last save or removal said, and whether focus should follow it. The stat block keeps it
 * so the notice and the focus survive the control mounting again.
 */
export type ArtNotice = { text: string; refocus: boolean }

/**
 * The creature's picture in its stat block (RYT-053, ADR 030): a 56px thumbnail beside the name
 * that opens the picture large (with its credit), and the editing of that picture as entries of
 * the stat block's `···` menu: choose or change the image, copy the prompt that paints one, and
 * remove it (or restore the bundled art of an SRD creature). A private image wins over the bundled
 * art; a campaign copy of an SRD creature shows that creature's art until another image is chosen.
 *
 * `thumb` goes beside the name, `menuItems` inside the menu's dropdown and `extras` anywhere in the
 * stat block (the hidden file input, what the last change said, the questions and the viewer).
 */
export function useCreatureArt({
  campaignId,
  name,
  side,
  type,
  target,
  imagePath,
  packPath = null,
  art,
  credit,
  notice,
  onNotice,
  onViewing,
  returnTo,
}: {
  campaignId: string
  name: string
  side: 'enemy' | 'ally'
  type: CreatureType | null
  target: ArtTarget
  /** The private image: the campaign creature's own, or the DM's image of an SRD creature. */
  imagePath: string | null
  /** RYT-172: the pack entry's picture, shown when the campaign has no image of its own. */
  packPath?: string | null
  /** Bundled art of the SRD creature (or of the one a campaign creature was copied from). */
  art: { thumb: string; full: string } | null
  credit: CreatureArt | null
  notice: ArtNotice | null
  onNotice: (notice: ArtNotice | null) => void
  /** The viewer or the remove question opened or closed: a sheet underneath leaves Escape to it. */
  onViewing?: (open: boolean) => void
  /** The control that opens the menu: focus goes back to it after a change. */
  returnTo: RefObject<HTMLElement | null>
}): { thumb: ReactNode; menuItems: ReactNode; extras: ReactNode } {
  const { t } = useTranslation()
  const promptSubject: ArtSubject = { kind: 'creature', name, traits: [type] }
  const [manualPrompt, setManualPrompt] = useState(false)
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const upload = useCreatureImageUpload(campaignId)
  const action = useCombatAction(campaignId)
  const [unreadable, setUnreadable] = useState(false)
  // Preparing the 1024px picture takes a moment on phones: it reads as saving from the tap (RYT-099).
  const [encoding, setEncoding] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // What the last request did, so a failure names it (saving or removing).
  const [lastOp, setLastOp] = useState<'save' | 'clear'>('save')
  const reportViewing = useRef(onViewing)
  useEffect(() => {
    reportViewing.current = onViewing
  })
  // While the viewer or the remove question is open, a sheet underneath leaves Escape to it; leaving
  // with one open (another creature, or the sheet closes) hands Escape back.
  const overlay = viewing || confirming
  useEffect(() => {
    reportViewing.current?.(overlay)
    if (!overlay) return
    return () => reportViewing.current?.(false)
  }, [overlay])
  const failed = unreadable || upload.isError || action.isError
  const pending = upload.isPending || action.isPending || encoding
  const srd = 'srdId' in target
  const hasImage = Boolean(imagePath ?? packPath) || Boolean(art)
  const glyph = type ? typeGlyphs[type] : undefined
  // After a save the stat block says what happened and focus goes back to the menu button, once.
  useEffect(() => {
    if (!notice?.refocus) return
    returnTo.current?.focus()
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
    setEncoding(true)
    try {
      image = await toSquareWebp(file)
    } catch {
      setUnreadable(true)
      return
    } finally {
      setEncoding(false)
    }
    // The promise, not mutate's callbacks: the first image turns the token into a picture and this
    // hook can mount again before they would run. Failures show through the mutation's state.
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
  // The viewer gives focus back to the thumbnail; the remove question to the menu button.
  const refocusMenu = () => window.setTimeout(() => returnTo.current?.focus(), 0)

  const face = (
    <Token
      name={name}
      side={side}
      imageKind="creature"
      path={imagePath ?? packPath}
      art={art?.thumb}
      size={56}
      glyph={glyph}
    />
  )
  const thumb = hasImage ? (
    <UnstyledButton
      ref={trigger}
      className="bst-thumb"
      aria-haspopup="dialog"
      aria-label={t('bestiary.art.open', { name })}
      onClick={() => setViewing(true)}
    >
      {face}
    </UnstyledButton>
  ) : (
    <span className="bst-thumb" aria-hidden="true">
      {face}
    </span>
  )

  const menuItems = (
    <>
      <Menu.Item
        leftSection={pending ? <Loader size={16} /> : <ImagePlus size={16} aria-hidden="true" />}
        disabled={pending}
        aria-describedby={failed ? errorId : undefined}
        onClick={() => input.current?.click()}
      >
        {t(hasImage ? 'bestiary.art.change' : 'bestiary.art.add')}
      </Menu.Item>
      <Menu.Item
        leftSection={<Sparkles size={16} aria-hidden="true" />}
        onClick={async () => {
          const copied = await copyArtPrompt(promptSubject)
          setManualPrompt(!copied)
          onNotice({ text: t(copied ? 'art.prompt.copied' : 'art.prompt.failed'), refocus: false })
        }}
      >
        {t('art.prompt.copy')}
      </Menu.Item>
      {imagePath && (
        <>
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
        </>
      )}
    </>
  )

  const extras = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/webp,image/png,image/jpeg"
        className="visually-hidden combat-image-input"
        disabled={pending}
        // Only the menu reaches it.
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          void choose(file)
        }}
      />
      {manualPrompt && (
        <Textarea
          className="combat-prompt-manual"
          label={t('art.prompt.manual')}
          value={artPrompt(promptSubject)}
          readOnly
          autosize
          minRows={3}
          maxRows={8}
          onFocus={(event) => event.currentTarget.select()}
          data-autofocus
          ref={(node) => node?.select()}
        />
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
            refocusMenu()
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
                refocusMenu()
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
                refocusMenu()
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
          imagePath={imagePath ?? packPath}
          art={art?.full}
          credit={credit}
          ownNote={srd ? 'srd' : 'campaign'}
          returnFocus={trigger}
          onChange={() => {
            setViewing(false)
            window.setTimeout(() => trigger.current?.focus(), 0)
            input.current?.click()
          }}
          onClose={() => setViewing(false)}
        />
      )}
    </>
  )

  return { thumb, menuItems, extras }
}
