import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Loader, Drawer, Stack, Text, UnstyledButton } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageUp, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { rosterQuery, useInventoryAction } from '../api'
import {
  attachItemImage,
  discardItemUpload,
  loadDefinitionImpact,
  uploadItemImage,
  type DefinitionImpact,
} from '../data/repository'
import type { DefinitionDraft, ItemDefinition } from '../domain/item'
import { Forge } from './forge'
import { ItemIcon } from './item-icon'
import { CharacterPortrait } from './portrait'
import { PriceSyncDialog } from './price-sync'
import { newRequestId } from '@/shared/lib/request-id'
import {
  canvasToUpload,
  drawSmooth,
  encodeWithin,
  hasTransparency,
  uploadSide,
} from '@/shared/lib/image-encode'

export type GiveOutcome = { given: string[]; failed: string[] }
type PendingSync = {
  item: ItemDefinition
  outcome?: GiveOutcome
  listings: DefinitionImpact['listings']
}

/** Decode and re-encode: never upload arbitrary bytes or crop an item illustration. */
async function toItemImage(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error('invalid')
  const bitmap = await createImageBitmap(file)
  try {
    const fit = Math.min(1, uploadSide / Math.max(bitmap.width, bitmap.height))
    // See-through item art stays PNG where WebP cannot be encoded; opaque art goes JPEG (RYT-099).
    const alpha = file.type !== 'image/jpeg' && hasTransparency(bitmap)
    return await encodeWithin(
      (scale) => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * fit * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * fit * scale))
        drawSmooth(
          canvas.getContext('2d')!,
          bitmap,
          0,
          0,
          bitmap.width,
          bitmap.height,
          0,
          0,
          canvas.width,
          canvas.height,
        )
        return canvas
      },
      (canvas, quality) => canvasToUpload(canvas, quality, alpha),
    )
  } finally {
    bitmap.close()
  }
}

/** One editor, independent of any character. Save the definition once before media work. */
export function DefinitionEditor({
  campaignId,
  definition,
  onSaved,
  onClose,
  allowGive = false,
  initialGive,
  title,
  returnFocusToOpener = true,
}: {
  campaignId: string
  definition: ItemDefinition | null
  /** `outcome` lists the character names that received (or failed to receive) the new item;
   * `repriced` counts shop listings moved to a changed value (RYT-032). */
  onSaved: (item: ItemDefinition, outcome?: GiveOutcome, repriced?: number) => void
  onClose: () => void
  /** Offer "Give to" roster chips so a new item can be created for characters (RYT-027). */
  allowGive?: boolean
  initialGive?: string[]
  /** Drawer title override, e.g. "New item for Arin". */
  title?: string
  /** Set to false when the caller returns focus itself (e.g. editors opened from a link). */
  returnFocusToOpener?: boolean
}) {
  const { t } = useTranslation()
  const { state, controller } = useAuth()
  const userId = state.user!.id
  const cache = useQueryClient()
  const action = useInventoryAction(campaignId)
  const roster = useQuery({
    ...rosterQuery(userId, campaignId),
    enabled: allowGive && !definition,
  })
  const pendingGive = useRef<{ characterIds: string[]; amount: number }>({
    characterIds: [],
    amount: 1,
  })
  const grantRequests = useRef(new Map<string, string>())
  const [image, setImage] = useState<Blob | null | undefined>(undefined)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<ItemDefinition | null>(null)
  const [sync, setSync] = useState<PendingSync | null>(null)
  const [dragging, setDragging] = useState(false)
  const opener = useRef(document.activeElement as HTMLElement | null)
  const restoreFocus = () =>
    requestAnimationFrame(() => {
      if (returnFocusToOpener && opener.current?.isConnected) opener.current.focus()
    })
  const upload = useRef<string | null>(null)
  const requestId = useRef(newRequestId())
  const generation = useRef(0)
  const definitionRequest = useRef({ payload: '', id: newRequestId() })
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  const message = (failure: unknown) =>
    failure instanceof Error && failure.message === 'stale'
      ? t('inventory.error.stale')
      : t('catalogue.saveError')
  const finish = async (item: ItemDefinition) => {
    if (!navigator.onLine || controller?.getSnapshot().user?.id !== userId)
      throw new Error('unavailable')
    let path = item.image_path ?? null
    if (image !== undefined) {
      if (image && !upload.current)
        upload.current = await uploadItemImage(campaignId, item.id, image)
      path = image ? upload.current : null
      await attachItemImage(campaignId, item.id, item.revision, path, requestId.current)
    }
    // Grants run after the definition exists; each target keeps a stable idempotency key so a
    // retry after a partial failure never doubles an already granted stack.
    const outcome: GiveOutcome = { given: [], failed: [] }
    const nameOf = (id: string) => roster.data?.find((c) => c.id === id)?.name ?? id
    for (const characterId of pendingGive.current.characterIds) {
      const key = `${item.id}:${characterId}`
      if (!grantRequests.current.has(key)) grantRequests.current.set(key, newRequestId())
      try {
        await action.mutateAsync({
          kind: 'grant',
          characterId,
          definitionId: item.id,
          amount: pendingGive.current.amount,
          requestId: grantRequests.current.get(key),
        })
        outcome.given.push(nameOf(characterId))
      } catch {
        outcome.failed.push(nameOf(characterId))
      }
    }
    pendingGive.current = { characterIds: [], amount: 1 }
    await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    const final = {
      ...item,
      image_path: path,
      revision: item.revision + (image !== undefined ? 1 : 0),
    }
    const given = outcome.given.length || outcome.failed.length ? outcome : undefined
    // A changed value offers to reprice the shops that still sell the item (RYT-032). A failed
    // check never blocks the save that already happened.
    if (definition && final.value_gp !== null && final.value_gp !== definition.value_gp) {
      try {
        const impact = await loadDefinitionImpact(campaignId, final.id)
        const listings = impact.listings.filter((l) => l.price !== final.value_gp)
        if (listings.length) {
          setSync({ item: final, outcome: given, listings })
          return
        }
      } catch {
        /* Keep the prices; the DM can still edit listings in Shops. */
      }
    }
    onSaved(final, given)
    restoreFocus()
  }
  const pick = async (next: File | null) => {
    const token = ++generation.current
    setError(null)
    if (!next) {
      setImage(undefined)
      setPreview(null)
      return
    }
    setBusy(true)
    try {
      const converted = await toItemImage(next)
      if (token === generation.current) {
        setImage(converted)
        setPreview(URL.createObjectURL(converted))
      }
    } catch {
      setImage(undefined)
      setPreview(null)
      setError(t('catalogue.imageInvalid'))
    } finally {
      if (token === generation.current) setBusy(false)
    }
  }
  const save = async (draft: DefinitionDraft, give: { characterIds: string[]; amount: number }) => {
    pendingGive.current = definition ? { characterIds: [], amount: 1 } : give
    setError(null)
    setBusy(true)
    try {
      const payload = JSON.stringify(draft)
      if (definitionRequest.current.payload !== payload)
        definitionRequest.current = { payload, id: newRequestId() }
      const result = await action.mutateAsync({
        kind: 'define',
        requestId: definitionRequest.current.id,
        definitionId: definition?.id ?? null,
        expectedRevision: definition?.revision ?? null,
        draft,
      })
      if (!('definitionId' in result)) throw new Error('unavailable')
      const item: ItemDefinition = {
        ...draft,
        id: result.definitionId,
        campaign_id: campaignId,
        origin: definition?.origin ?? draft.origin ?? 'dm',
        archived: false,
        created_by: definition?.created_by ?? userId,
        revision: definition ? definition.revision + 1 : 0,
        image_path: definition?.image_path ?? null,
      }
      setSaved(item)
      await finish(item)
    } catch (failure) {
      setError(message(failure))
    } finally {
      setBusy(false)
    }
  }
  const close = async () => {
    if (busy) return
    if (upload.current) {
      try {
        await discardItemUpload(campaignId, upload.current)
      } catch {
        setError(t('catalogue.cleanupError'))
        return
      }
    }
    onClose()
    restoreFocus()
  }
  if (sync)
    return (
      <PriceSyncDialog
        campaignId={campaignId}
        definitionId={sync.item.id}
        name={sync.item.name}
        price={sync.item.value_gp ?? 0}
        listings={sync.listings}
        onDone={(repriced) => {
          onSaved(sync.item, sync.outcome, repriced)
          restoreFocus()
        }}
      />
    )
  if (saved)
    return (
      <Drawer
        returnFocus={false}
        opened
        onClose={() => void close()}
        title={t('catalogue.saved')}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <Stack>
          <Text>{t('catalogue.mediaPending')}</Text>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <Button
            aria-disabled={busy || undefined}
            aria-busy={busy}
            leftSection={busy ? <Loader size={16} /> : undefined}
            onClick={async () => {
              if (busy) return
              setBusy(true)
              setError(null)
              try {
                await finish(saved)
              } catch (failure) {
                setError(message(failure))
              } finally {
                setBusy(false)
              }
            }}
          >
            {t('common.retry')}
          </Button>
          <Button variant="subtle" disabled={busy} onClick={() => void close()}>
            {t('common.close')}
          </Button>
        </Stack>
      </Drawer>
    )
  return (
    <Forge
      definition={definition}
      dm
      targets={
        allowGive && !definition
          ? (roster.data ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              portrait: (
                <CharacterPortrait
                  campaignId={campaignId}
                  characterId={c.id}
                  name={c.name}
                  path={null}
                  size={40}
                />
              ),
            }))
          : []
      }
      initialGive={initialGive}
      title={title}
      pending={busy}
      error={error}
      onSave={(draft, give) => void save(draft, give)}
      onClose={() => void close()}
      image={image === null ? null : preview}
      media={
        <fieldset className="plain-fieldset">
          <legend>
            <Text fw={600} size="sm" mb={6}>
              {t('catalogue.image')}
            </Text>
          </legend>
          <div
            className="forge-drop"
            data-dragging={dragging || undefined}
            onDragOver={(event) => {
              event.preventDefault()
              if (!busy) setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              if (!busy) void pick(event.dataTransfer.files[0] ?? null)
            }}
          >
            <label className="forge-drop-target">
              <input
                type="file"
                className="forge-file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                aria-describedby={`${campaignId}-image-help`}
                onChange={(event) => {
                  const next = event.currentTarget.files?.[0] ?? null
                  event.currentTarget.value = ''
                  void pick(next)
                }}
              />
              <span className="forge-drop-thumb">
                {preview ? (
                  <img src={preview} alt={t('catalogue.imagePreview')} width={64} height={64} />
                ) : image !== null && definition?.image_path ? (
                  <ItemIcon icon={definition.icon} size={56} imagePath={definition.image_path} />
                ) : (
                  <ImageUp size={26} aria-hidden="true" />
                )}
              </span>
              <span className="forge-drop-copy">
                <span className="forge-drop-title">
                  {dragging
                    ? t('forge.dropActive')
                    : preview || (image !== null && definition?.image_path)
                      ? t('forge.replaceImage')
                      : t('forge.dropTitle')}
                </span>
                <span className="forge-drop-help" id={`${campaignId}-image-help`}>
                  {t('catalogue.imageHelp')}
                </span>
              </span>
            </label>
            {image !== null && (image || definition?.image_path) && (
              <UnstyledButton
                type="button"
                className="forge-drop-remove"
                disabled={busy}
                onClick={() => {
                  generation.current++
                  setImage(null)
                  setPreview(null)
                  setError(null)
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                <span>{t('catalogue.removeImage')}</span>
              </UnstyledButton>
            )}
          </div>
        </fieldset>
      }
    />
  )
}
