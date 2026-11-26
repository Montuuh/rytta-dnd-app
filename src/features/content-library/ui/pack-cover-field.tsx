import { useId, useRef, useState } from 'react'
import { Alert, Button, Loader, Text } from '@mantine/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SquareImageEditor } from '@/features/inventory'
import { isPackImagePath, uploadPackImage } from '@/shared/api/pack-images'
import { PackCover } from '@/shared/ui/pack-cover'
import { draftsQuery, useLibraryAction } from '../api'
import {
  coverInput,
  coverKey,
  coverKind,
  libraryErrorCode,
  packTitle,
  type ContentLanguage,
  type ContentPack,
} from '../domain/library'

/**
 * RYT-184 (owner option 6): a pack's cover. It is the reserved entry `pack` / `cover` whose
 * `data.index.image` names the picture, so it is drafted and published with the pack like any
 * entry. The editor crops a square; the cover frame is 3:4 and shows it with object-fit: cover.
 */
export function PackCoverField({
  pack,
  language,
  userId,
}: {
  pack: ContentPack
  language: ContentLanguage
  userId: string
}) {
  const { t } = useTranslation()
  const headingId = useId()
  const input = useRef<HTMLInputElement>(null)
  const change = useRef<HTMLButtonElement>(null)
  const uploaded = useRef<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const action = useLibraryAction()
  const drafts = useQuery(draftsQuery(userId, pack.id, coverKind))
  const row = drafts.data?.find((item) => item.key === coverKey) ?? null
  const raw = row && row.state !== 'deleted' ? row.index?.image : null
  const path = isPackImagePath(raw) ? raw : null
  const title = packTitle(pack, language)
  const errorText = (error: unknown) =>
    t(`library.error.${libraryErrorCode(error instanceof Error ? error.message : '')}`)

  const refocus = () => requestAnimationFrame(() => change.current?.focus())
  // The picture is uploaded once; a save that fails is retried without uploading it again.
  const choose = useMutation({
    mutationFn: async (image: Blob) => {
      uploaded.current ??= await uploadPackImage(pack.id, image).catch(() => {
        throw new Error('upload')
      })
      await action.mutateAsync({
        kind: 'saveEntry',
        packId: pack.id,
        entryId: row?.id ?? null,
        revision: row?.revision ?? null,
        input: coverInput(uploaded.current),
      })
    },
    networkMode: 'always',
    retry: false,
    onSuccess: () => {
      uploaded.current = null
      setFile(null)
      refocus()
    },
  })
  const closeEditor = () => {
    uploaded.current = null
    setFile(null)
    choose.reset()
    refocus()
  }
  const remove = async () => {
    if (!row) return
    setRemoveError(null)
    try {
      // A cover no version names yet simply goes; a published one is saved without its picture.
      if (row.state === 'new')
        await action.mutateAsync({ kind: 'deleteEntry', entryId: row.id, revision: row.revision })
      else
        await action.mutateAsync({
          kind: 'saveEntry',
          packId: pack.id,
          entryId: row.id,
          revision: row.revision,
          input: coverInput(null),
        })
      refocus()
    } catch (caught) {
      setRemoveError(errorText(caught))
    }
  }

  return (
    <section className="lib-cover" aria-labelledby={headingId}>
      <PackCover
        path={path}
        title={title}
        userId={userId}
        className="tw:h-28 tw:w-[84px] tw:rounded-md tw:text-4xl"
      />
      <div className="lib-cover-body">
        <Text fw={650} id={headingId}>
          {t('library.cover.title')}
        </Text>
        {drafts.isPending ? (
          <Loader size="sm" aria-label={t('common.loading')} />
        ) : drafts.isError ? (
          <Alert color="red" role="alert" p="xs">
            <Text size="sm">{t(`library.error.${libraryErrorCode(drafts.error.message)}`)}</Text>
            <Button size="xs" variant="light" color="red" onClick={() => void drafts.refetch()}>
              {t('library.retry')}
            </Button>
          </Alert>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              {path ? t('library.cover.reach') : t('library.cover.none')}
            </Text>
            {removeError && (
              <Text size="sm" c="red" role="alert">
                {removeError}
              </Text>
            )}
            <div className="lib-cover-actions">
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) => {
                  const chosen = event.currentTarget.files?.[0]
                  event.currentTarget.value = ''
                  if (chosen) {
                    choose.reset()
                    uploaded.current = null
                    setFile(chosen)
                  }
                }}
              />
              <Button
                ref={change}
                variant="default"
                leftSection={<ImagePlus size={18} aria-hidden="true" />}
                onClick={() => input.current?.click()}
              >
                {t(path ? 'library.image.change' : 'library.image.add')}
              </Button>
              {path && (
                <Button
                  variant="subtle"
                  color="red"
                  loading={action.isPending && !choose.isPending}
                  leftSection={<Trash2 size={18} aria-hidden="true" />}
                  onClick={() => void remove()}
                >
                  {t('library.image.remove')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      {file && (
        <SquareImageEditor
          describeError={(error) =>
            error?.message === 'upload' ? t('library.image.failed') : errorText(error)
          }
          shape="square"
          file={file}
          name={title}
          title={t('library.cover.editorTitle', { name: title })}
          saveLabel={t('library.cover.use')}
          pending={choose.isPending}
          error={choose.error}
          onCancel={closeEditor}
          onReplace={(next) => {
            choose.reset()
            uploaded.current = null
            setFile(next)
          }}
          onSave={(image) => choose.mutate(image)}
        />
      )}
    </section>
  )
}
