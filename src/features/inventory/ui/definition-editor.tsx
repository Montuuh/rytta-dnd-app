import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Loader, Drawer, FileInput, Group, Stack, Text } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { rosterQuery, useInventoryAction } from '../api'
import { attachItemImage, discardItemUpload, uploadItemImage } from '../data/repository'
import type { DefinitionDraft, ItemDefinition } from '../domain/item'
import { Forge } from './forge'
import { ItemIcon } from './item-icon'
import { CharacterPortrait } from './portrait'

export type GiveOutcome = { given: string[]; failed: string[] }

/** Decode and re-encode: never upload arbitrary bytes or crop an item illustration. */
async function toItemImage(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error('invalid')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.85, 0.65, 0.45]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', quality),
      )
      if (blob?.type === 'image/webp' && blob.size <= 1_048_576) return blob
    }
    throw new Error('invalid')
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
  /** `outcome` lists the character names that received (or failed to receive) the new item. */
  onSaved: (item: ItemDefinition, outcome?: GiveOutcome) => void
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
  const [file, setFile] = useState<File | null>(null)
  const [image, setImage] = useState<Blob | null | undefined>(undefined)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<ItemDefinition | null>(null)
  const opener = useRef(document.activeElement as HTMLElement | null)
  const restoreFocus = () =>
    requestAnimationFrame(() => {
      if (returnFocusToOpener && opener.current?.isConnected) opener.current.focus()
    })
  const upload = useRef<string | null>(null)
  const requestId = useRef(crypto.randomUUID())
  const generation = useRef(0)
  const definitionRequest = useRef({ payload: '', id: crypto.randomUUID() })
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
      if (!grantRequests.current.has(key)) grantRequests.current.set(key, crypto.randomUUID())
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
    onSaved(
      { ...item, image_path: path, revision: item.revision + (image !== undefined ? 1 : 0) },
      outcome.given.length || outcome.failed.length ? outcome : undefined,
    )
    restoreFocus()
  }
  const save = async (draft: DefinitionDraft, give: { characterIds: string[]; amount: number }) => {
    pendingGive.current = definition ? { characterIds: [], amount: 1 } : give
    setError(null)
    setBusy(true)
    try {
      const payload = JSON.stringify(draft)
      if (definitionRequest.current.payload !== payload)
        definitionRequest.current = { payload, id: crypto.randomUUID() }
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
      media={
        <Stack gap="xs">
          <FileInput
            label={t('catalogue.image')}
            description={t('catalogue.imageHelp')}
            accept="image/jpeg,image/png,image/webp"
            value={file}
            disabled={busy}
            onChange={async (next) => {
              const token = ++generation.current
              setFile(next)
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
                setFile(null)
                setImage(undefined)
                setPreview(null)
                setError(t('catalogue.imageInvalid'))
              } finally {
                if (token === generation.current) setBusy(false)
              }
            }}
          />
          <Group>
            {preview ? (
              <img
                src={preview}
                alt={t('catalogue.imagePreview')}
                width={128}
                height={128}
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <ItemIcon
                icon={definition?.icon ?? 'package'}
                size={80}
                imagePath={image === null ? null : definition?.image_path}
              />
            )}
            {(image || definition?.image_path) && (
              <Button
                variant="subtle"
                disabled={busy}
                onClick={() => {
                  setImage(null)
                  setPreview(null)
                  setFile(null)
                  setError(null)
                }}
              >
                {t('catalogue.removeImage')}
              </Button>
            )}
          </Group>
        </Stack>
      }
    />
  )
}
