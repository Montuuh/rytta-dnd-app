import { useId } from 'react'
import { Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { portraitQuery, usePortraitUpload } from '../api'

/** Center-crop to a 512px WebP square before upload; keeps uploads small and uniform. */
async function toPortrait(file: File) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.min(512, side)
  canvas
    .getContext('2d')!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    )
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('invalid'))),
      'image/webp',
      0.85,
    ),
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

export function CharacterPortrait({
  campaignId,
  characterId,
  name,
  path,
  size = 96,
  editable = false,
}: {
  campaignId: string
  characterId: string
  name: string
  path: string | null
  size?: number
  editable?: boolean
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const inputId = useId()
  const url = useQuery(portraitQuery(state.user!.id, path))
  const upload = usePortraitUpload(campaignId, characterId)
  return (
    <div className="portrait" style={{ width: size, height: size }}>
      <div className="portrait-medallion" aria-hidden={!url.data}>
        {url.data ? (
          <img src={url.data} alt={t('inventory.portrait.alt', { name })} />
        ) : (
          <span className="portrait-initials" aria-hidden="true">
            {initials(name)}
          </span>
        )}
      </div>
      {editable && (
        <>
          <input
            id={inputId}
            type="file"
            accept="image/webp,image/png,image/jpeg"
            className="visually-hidden"
            disabled={upload.isPending}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (!file) return
              try {
                upload.mutate(await toPortrait(file))
              } catch {
                upload.reset()
              }
            }}
          />
          <label
            htmlFor={inputId}
            className="portrait-edit"
            data-pending={upload.isPending || undefined}
          >
            <Camera size={16} aria-hidden="true" />
            <span className="visually-hidden">{t('inventory.portrait.change', { name })}</span>
          </label>
        </>
      )}
      {upload.isError && (
        <Text size="xs" role="alert" className="portrait-error">
          {t('inventory.portrait.error')}
        </Text>
      )}
    </div>
  )
}
