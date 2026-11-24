import { useId, useRef, useState } from 'react'
import { Button, Loader, Stack, Text } from '@mantine/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ImageOff, ImagePlus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SquareImageEditor } from '@/features/inventory'
import { isPackImagePath, packImageOptions, uploadPackImage } from '@/shared/api/pack-images'
import { indexOf, withIndex } from '../domain/forms'
import type { EntryInput } from '../domain/library'
import { useAppPicture, type PictureOrigin } from './entry-picture'

/**
 * RYT-172 (owner choice P3 A): the entry's picture as the app will show it, where it comes from,
 * and Change / Remove. A new picture is uploaded at once and named by the draft; it reaches
 * campaigns with the next published version.
 */
export function EntryImageField({
  entry,
  packId,
  userId,
  readOnly = false,
  onChange,
}: {
  entry: EntryInput
  packId: string
  userId: string
  readOnly?: boolean
  onChange: (next: EntryInput) => void
}) {
  const { t, i18n } = useTranslation()
  const headingId = useId()
  const input = useRef<HTMLInputElement>(null)
  const change = useRef<HTMLButtonElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const raw = indexOf(entry.data).image
  const path = isPackImagePath(raw) ? raw : null
  const signed = useQuery(packImageOptions(userId, path))
  const fallback = useAppPicture(entry, 'full')
  const upload = useMutation({
    mutationFn: (image: Blob) => uploadPackImage(packId, image),
    networkMode: 'always',
    retry: false,
    onSuccess: (next) => {
      setFile(null)
      onChange({ ...entry, data: withIndex(entry.data, { image: next }) })
      requestAnimationFrame(() => change.current?.focus())
    },
  })
  const origin: PictureOrigin = path ? 'pack' : fallback.origin
  const src = path ? (signed.data ?? null) : fallback.src
  const name =
    (i18n.language.startsWith('en')
      ? entry.name_en || entry.name_es
      : entry.name_es || entry.name_en) || entry.key
  return (
    <section className="lib-image" aria-labelledby={headingId}>
      <div className="lib-image-frame">
        {path && signed.isPending ? (
          <Loader size="sm" aria-label={t('common.loading')} />
        ) : src ? (
          <img src={src} alt={t('library.image.alt', { name })} />
        ) : (
          <ImageOff size={32} aria-hidden="true" />
        )}
      </div>
      <div className="lib-image-body">
        <Text fw={650} id={headingId}>
          {t('library.image.title')}
        </Text>
        <Text size="sm" c="dimmed">
          {t(`library.image.origin.${origin}`)}
          {/* With its own picture, say what comes back if it goes (the fallback). */}
          {path &&
            ` ${t(`library.image.fallback.${fallback.origin as 'app' | 'category' | 'none'}`)}`}
        </Text>
        {path && signed.isError && (
          <Text size="sm" c="red" role="alert">
            {t('library.image.unreadable')}
          </Text>
        )}
        {upload.isError && !file && (
          <Text size="sm" c="red" role="alert">
            {t('library.image.failed')}
          </Text>
        )}
        {/* Stacked: the two never fit side by side beside the frame on a phone. */}
        {!readOnly && (
          <Stack gap={4} mt={4} align="flex-start">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => {
                const chosen = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (chosen) {
                  upload.reset()
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
                leftSection={<Trash2 size={18} aria-hidden="true" />}
                onClick={() => {
                  onChange({ ...entry, data: withIndex(entry.data, { image: undefined }) })
                  requestAnimationFrame(() => change.current?.focus())
                }}
              >
                {t('library.image.remove')}
              </Button>
            )}
          </Stack>
        )}
      </div>
      {file && (
        <SquareImageEditor
          describeError={() => t('library.image.failed')}
          shape="square"
          file={file}
          name={name}
          title={t('library.image.editorTitle', { name })}
          saveLabel={t('library.image.use')}
          pending={upload.isPending}
          error={upload.error}
          onCancel={() => {
            setFile(null)
            upload.reset()
            requestAnimationFrame(() => change.current?.focus())
          }}
          onReplace={(next) => {
            upload.reset()
            setFile(next)
          }}
          onSave={(image) => upload.mutate(image)}
        />
      )}
    </section>
  )
}

/** RYT-172: the picture beside an entry in the list, as the app would show it (40 px). */
export function EntryThumb({
  row,
  userId,
}: {
  row: { kind: string; key: string; index?: Record<string, unknown> }
  userId: string
}) {
  const raw = row.index?.image
  const path = isPackImagePath(raw) ? raw : null
  const signed = useQuery(packImageOptions(userId, path))
  const fallback = useAppPicture({
    kind: row.kind,
    key: row.key,
    name_en: '',
    name_es: '',
    data: { index: row.index ?? {} },
  })
  const src = path ? (signed.data ?? null) : fallback.src
  return (
    <span className="lib-row-thumb" aria-hidden="true">
      {src ? (
        <img src={src} alt="" width={40} height={40} loading="lazy" decoding="async" />
      ) : (
        <ImageOff size={18} aria-hidden="true" />
      )}
    </span>
  )
}
