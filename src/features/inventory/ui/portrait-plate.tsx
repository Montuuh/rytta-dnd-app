import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Loader, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ImagePlus, ImageUp, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { ImageViewer } from '@/shared/ui/image-viewer'
import { portraitQuery, usePortraitRemove, usePortraitUpload } from '../api'
import { initials } from './initials'
import { PortraitEditor } from './portrait-editor'
import './portrait-plate.css'

/** How long the remove confirmation ignores taps after the question appears (ms). */
const confirmDelay = 400

/** RYT-090: a character's portrait as a plate that fills its box. Tapping it opens a viewer
 * where editors change or remove it; without a portrait it shows the monogram and, for
 * editors, "Add portrait". Children are overlays the consumer positions over the plate. */
export function PortraitPlate({
  campaignId,
  characterId,
  name,
  path,
  editable = false,
  className,
  children,
}: {
  campaignId: string
  characterId: string
  name: string
  path: string | null
  editable?: boolean
  className?: string
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const inputId = useId()
  const url = useQuery(portraitQuery(state.user!.id, path))
  const upload = usePortraitUpload(campaignId, characterId)
  const remove = usePortraitRemove(campaignId, characterId)
  const [broken, setBroken] = useState<string | null>(null)
  const [viewer, setViewer] = useState(false)
  const [asking, setAsking] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  // The viewer teaches double taps (zoom): a double tap on Remove must never remove. Keep takes
  // Remove's place and the confirmation ignores taps for a moment after the question appears.
  const askedAt = useRef(0)
  const [armed, setArmed] = useState(true)
  // The question takes the place of Remove: focus moves into it and back.
  const ask = (next: boolean) => {
    setAsking(next)
    if (next) {
      askedAt.current = performance.now()
      setArmed(false)
      window.setTimeout(() => setArmed(true), confirmDelay)
    }
    requestAnimationFrame(() => (next ? keep : removeButton).current?.focus())
  }
  const src = url.data && broken !== url.data ? url.data : null
  const loading = Boolean(path) && url.isPending
  // Focus goes back to the plate, or to "Add portrait" once the portrait is gone; after a
  // change it waits for the new picture to load.
  const wantFocus = useRef(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const refocus = () => {
    wantFocus.current = true
    setFocusRequest((count) => count + 1)
  }
  useEffect(() => {
    if (!wantFocus.current || loading) return
    const target = opener.current ?? input.current
    if (!target) return
    wantFocus.current = false
    requestAnimationFrame(() => target.focus())
  }, [src, loading, focusRequest])
  const closeViewer = () => {
    setViewer(false)
    setAsking(false)
    remove.reset()
  }
  const closeEditor = () => {
    setFile(null)
    refocus()
  }
  return (
    <div className={`portrait-plate ${className ?? ''}`} data-empty={!src || undefined}>
      <div className="portrait-plate-art">
        {src ? (
          <button
            ref={opener}
            type="button"
            className="portrait-plate-open"
            aria-haspopup="dialog"
            aria-label={t('inventory.portrait.open', { name })}
            onClick={() => setViewer(true)}
          >
            <img src={src} alt="" onError={() => setBroken(src)} />
          </button>
        ) : (
          <div className="portrait-plate-empty" />
        )}
      </div>
      <div className="portrait-plate-content">
        {!src && (
          <div className="portrait-plate-blank" aria-busy={loading || undefined}>
            <span className="portrait-plate-monogram" aria-hidden="true">
              {initials(name)}
            </span>
            {loading ? (
              <Loader size="sm" aria-hidden="true" />
            ) : (
              editable && (
                <label
                  htmlFor={inputId}
                  className="portrait-plate-add"
                  data-pending={upload.isPending || undefined}
                >
                  <ImagePlus size={20} aria-hidden="true" />
                  {/* A portrait that cannot be shown can still be replaced. */}
                  {t(path ? 'inventory.portrait.replace' : 'inventory.portrait.add')}
                </label>
              )
            )}
          </div>
        )}
        {children}
        {upload.isError && !file && (
          <Alert color="red" role="alert" className="portrait-plate-error">
            {t('inventory.portrait.error')}
          </Alert>
        )}
      </div>
      {editable && (
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="image/webp,image/png,image/jpeg"
          className="visually-hidden portrait-plate-input"
          // With a portrait the viewer's "Change portrait" opens this picker.
          aria-label={src ? t('inventory.portrait.change', { name }) : undefined}
          tabIndex={src ? -1 : undefined}
          disabled={upload.isPending}
          onChange={(event) => {
            const chosen = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (chosen) {
              upload.reset()
              setFile(chosen)
            }
          }}
        />
      )}
      <ImageViewer
        opened={viewer && Boolean(src)}
        onClose={closeViewer}
        title={name}
        src={src}
        alt={t('inventory.portrait.alt', { name })}
        actions={
          editable ? (
            <>
              {remove.isError && (
                <Text role="alert" className="portrait-viewer-error">
                  {t('inventory.portrait.removeError')}
                </Text>
              )}
              {asking ? (
                <>
                  <Text className="portrait-viewer-ask user-copy">
                    {t('inventory.portrait.removeAsk', { name })}
                  </Text>
                  {/* Confirm sits where Change was and Keep where Remove was. */}
                  <Button
                    variant="default"
                    className="portrait-danger portrait-confirm"
                    loading={remove.isPending}
                    aria-disabled={!armed || undefined}
                    onClick={() => {
                      if (performance.now() - askedAt.current < confirmDelay) return
                      remove.mutate(undefined, {
                        onSuccess: () => {
                          closeViewer()
                          refocus()
                        },
                      })
                    }}
                  >
                    {t('inventory.portrait.removeConfirm')}
                  </Button>
                  <Button ref={keep} variant="default" onClick={() => ask(false)}>
                    {t('inventory.portrait.keep')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="default"
                    leftSection={<ImageUp size={18} aria-hidden="true" />}
                    onClick={() => {
                      closeViewer()
                      input.current?.click()
                    }}
                  >
                    {t('inventory.portrait.replace')}
                  </Button>
                  <Button
                    ref={removeButton}
                    variant="default"
                    className="portrait-danger"
                    leftSection={<Trash2 size={18} aria-hidden="true" />}
                    onClick={() => ask(true)}
                  >
                    {t('inventory.portrait.remove')}
                  </Button>
                </>
              )}
            </>
          ) : undefined
        }
      />
      {file && (
        <PortraitEditor
          file={file}
          name={name}
          pending={upload.isPending}
          error={upload.isError}
          onCancel={closeEditor}
          onSave={(image) => upload.mutate(image, { onSuccess: closeEditor })}
        />
      )}
    </div>
  )
}
